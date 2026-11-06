import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { detectImageType, type ImageType } from "./menu-admin";
import { CONFIG_KEY } from "./restaurants";

/** Tamaño máximo de una foto de entrega. */
export const MAX_DELIVERY_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Fotos por pedido. Es un tope técnico contra el abuso del almacenamiento, no una regla de
 * negocio (el ajuste del local solo decide si la foto se ofrece o se exige).
 */
export const MAX_DELIVERY_PHOTOS_PER_ORDER = 3;

/** Segundos de vida de la URL firmada con la que el panel abre una foto de entrega. */
export const DELIVERY_PHOTO_URL_SECONDS = 120;

/** Prefijo de las fotos de entrega dentro del bucket privado de justificantes. */
export const DELIVERY_PHOTO_PREFIX = "entregas";

/** Valores de `reparto_foto_entrega`. */
export const DELIVERY_PHOTO_MODE = {
  No: "no",
  Optional: "opcional",
  Required: "obligatoria",
} as const;

export type DeliveryPhotoMode = (typeof DELIVERY_PHOTO_MODE)[keyof typeof DELIVERY_PHOTO_MODE];

const MODES = new Set<string>(Object.values(DELIVERY_PHOTO_MODE));

export function isDeliveryPhotoMode(value: unknown): value is DeliveryPhotoMode {
  return typeof value === "string" && MODES.has(value);
}

/** Modo del local: sin clave, o con un valor que no se reconoce, equivale a «no». */
export function deliveryPhotoMode(config: ReadonlyMap<string, string>): DeliveryPhotoMode {
  const value = config.get(CONFIG_KEY.DeliveryPhoto)?.trim().toLowerCase();
  return isDeliveryPhotoMode(value) ? value : DELIVERY_PHOTO_MODE.No;
}

/** Tipo real del archivo por su firma (JPG, PNG o WebP; no por lo que diga el navegador). */
export function detectDeliveryPhotoType(bytes: Uint8Array): ImageType | null {
  return detectImageType(bytes);
}

/** Ruta privada del objeto: entregas/<restaurante_id>/<pedido_id>/<uuid>.<ext>. */
export function deliveryPhotoPath(
  restauranteId: number,
  pedidoId: number,
  type: ImageType,
): string {
  return `${DELIVERY_PHOTO_PREFIX}/${restauranteId}/${pedidoId}/${crypto.randomUUID()}.${type.ext}`;
}

export const DELIVERY_PHOTO_REJECTION = {
  Disabled: "delivery_photo_disabled",
  NotOnTheWay: "order_not_on_the_way",
  LimitReached: "delivery_photo_limit_reached",
} as const;

export type DeliveryPhotoRejection =
  (typeof DELIVERY_PHOTO_REJECTION)[keyof typeof DELIVERY_PHOTO_REJECTION];

/** Solo se sube la foto mientras el pedido va en camino, el local la ofrece y hay sitio. */
export function photoRejection(input: {
  readonly mode: DeliveryPhotoMode;
  readonly estado: string;
  readonly subidas: number;
}): DeliveryPhotoRejection | null {
  if (input.mode === DELIVERY_PHOTO_MODE.No) return DELIVERY_PHOTO_REJECTION.Disabled;
  if (input.estado !== ORDER_STATUS.OnTheWay) return DELIVERY_PHOTO_REJECTION.NotOnTheWay;
  if (input.subidas >= MAX_DELIVERY_PHOTOS_PER_ORDER) {
    return DELIVERY_PHOTO_REJECTION.LimitReached;
  }
  return null;
}

/** «Entregado» exige foto si el local la marcó obligatoria y aún no hay ninguna. */
export function deliveryNeedsPhoto(mode: DeliveryPhotoMode, subidas: number): boolean {
  return mode === DELIVERY_PHOTO_MODE.Required && subidas < 1;
}

export type DeliveryPhotoRow = {
  readonly id: number;
  readonly ruta: string;
  readonly tipo_mime: string;
  readonly bytes: number;
  readonly created_at: string;
};

export async function listDeliveryPhotos(
  sql: Sql,
  restauranteId: number,
  pedidoId: number,
): Promise<DeliveryPhotoRow[]> {
  return sql<DeliveryPhotoRow[]>`
    SELECT id::int, ruta, tipo_mime, bytes, created_at AT TIME ZONE 'UTC' AS created_at
    FROM   public.pedido_foto_entrega
    WHERE  restaurante_id = ${restauranteId} AND pedido_id = ${pedidoId}
    ORDER  BY created_at, id
  `;
}

export async function countDeliveryPhotos(
  sql: Sql,
  restauranteId: number,
  pedidoId: number,
): Promise<number> {
  const [row] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM public.pedido_foto_entrega
    WHERE  restaurante_id = ${restauranteId} AND pedido_id = ${pedidoId}
  `;
  return row?.total ?? 0;
}

/**
 * Registra la foto con el pedido bloqueado: dos subidas a la vez no superan el tope ni se
 * registran si el pedido dejó de ir en camino mientras tanto.
 */
export async function saveDeliveryPhoto(
  sql: Sql,
  input: {
    readonly restauranteId: number;
    readonly pedidoId: number;
    readonly membershipId: number;
    readonly mode: DeliveryPhotoMode;
    readonly ruta: string;
    readonly tipoMime: string;
    readonly bytes: number;
  },
): Promise<{ ok: true; total: number } | { ok: false; error: DeliveryPhotoRejection }> {
  return sql.begin(async (tx) => {
    const [order] = await tx<{ estado: string }[]>`
      SELECT estado FROM public.pedidos
      WHERE  id = ${input.pedidoId} AND restaurante_id = ${input.restauranteId}
      FOR UPDATE
    `;
    // El recuento va aparte para ver las subidas confirmadas mientras se esperaba el bloqueo.
    const [count] = await tx<{ total: number }[]>`
      SELECT count(*)::int AS total FROM public.pedido_foto_entrega
      WHERE  restaurante_id = ${input.restauranteId} AND pedido_id = ${input.pedidoId}
    `;
    const subidas = count?.total ?? 0;
    const error = photoRejection({ mode: input.mode, estado: order?.estado ?? "", subidas });
    if (error) return { ok: false as const, error };
    await tx`
      INSERT INTO public.pedido_foto_entrega
        (pedido_id, restaurante_id, membership_id, ruta, tipo_mime, bytes)
      VALUES (${input.pedidoId}, ${input.restauranteId}, ${input.membershipId}, ${input.ruta},
              ${input.tipoMime}, ${input.bytes})
    `;
    return { ok: true as const, total: subidas + 1 };
  });
}
