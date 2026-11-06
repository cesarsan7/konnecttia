import { DEFERRED_PAYMENT_METHODS, ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { detectImageType, IMAGE_TYPE } from "./menu-admin";
import { CONFIG_KEY } from "./restaurants";

/** Tamaño máximo de un justificante. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Subidas por pedido si el restaurante no configura `justificantes_max_por_pedido`. Es un tope
 * técnico contra el abuso del almacenamiento, no una regla de negocio.
 */
export const DEFAULT_MAX_PROOFS_PER_ORDER = 3;
const HARD_MAX_PROOFS_PER_ORDER = 10;

/** Segundos de vida de la URL firmada con la que el panel abre un justificante. */
export const PROOF_URL_SECONDS = 120;

export const PROOF_TYPE = {
  ...IMAGE_TYPE,
  Pdf: { mime: "application/pdf", ext: "pdf" },
} as const;

export type ProofType = (typeof PROOF_TYPE)[keyof typeof PROOF_TYPE];

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // «%PDF-»

/** Tipo real del archivo por su firma (no por lo que diga el navegador). */
export function detectProofType(bytes: Uint8Array): ProofType | null {
  if (PDF_SIGNATURE.every((byte, index) => bytes[index] === byte)) return PROOF_TYPE.Pdf;
  return detectImageType(bytes);
}

export function maxProofsPerOrder(config: ReadonlyMap<string, string>): number {
  const value = Number.parseInt(config.get(CONFIG_KEY.ProofsMaxPerOrder) ?? "", 10);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_MAX_PROOFS_PER_ORDER;
  return Math.min(value, HARD_MAX_PROOFS_PER_ORDER);
}

/** Ruta privada del objeto: <restaurante_id>/<pedido_id>/<uuid>.<ext>. */
export function proofPath(restauranteId: number, pedidoId: number, type: ProofType): string {
  return `${restauranteId}/${pedidoId}/${crypto.randomUUID()}.${type.ext}`;
}

/** Solo se admite justificante en un pedido de Bizum/transferencia con el cobro pendiente. */
export function acceptsProof(order: {
  readonly estado: string;
  readonly estado_pago: string;
  readonly metodo_pago: string | null;
}): boolean {
  return (
    order.estado_pago === PAYMENT_STATUS.Pending &&
    DEFERRED_PAYMENT_METHODS.has(order.metodo_pago ?? "") &&
    order.estado !== ORDER_STATUS.Cancelled &&
    order.estado !== ORDER_STATUS.Expired
  );
}

export type ProofRow = {
  readonly id: number;
  readonly ruta: string;
  readonly tipo_mime: string;
  readonly bytes: number;
  readonly created_at: string;
};

export async function listProofs(
  sql: Sql,
  restauranteId: number,
  pedidoId: number,
): Promise<ProofRow[]> {
  return sql<ProofRow[]>`
    SELECT id::int, ruta, tipo_mime, bytes, created_at AT TIME ZONE 'UTC' AS created_at
    FROM   public.pedido_justificante
    WHERE  restaurante_id = ${restauranteId} AND pedido_id = ${pedidoId}
    ORDER  BY created_at, id
  `;
}

export const PROOF_REJECTION = {
  OrderNotFound: "order_not_found",
  NotPending: "payment_not_pending",
  LimitReached: "proof_limit_reached",
} as const;

export type ProofRejection = (typeof PROOF_REJECTION)[keyof typeof PROOF_REJECTION];

type ProofTarget = {
  readonly id: number;
  readonly restaurante_id: number;
  readonly estado: string;
  readonly estado_pago: string;
  readonly metodo_pago: string | null;
  /** Justificantes ya subidos y límite configurado (texto de restaurante_config). */
  readonly subidos: number;
  readonly maximo: string | null;
};

function rejectionFor(order: ProofTarget | undefined): ProofRejection | null {
  if (!order) return PROOF_REJECTION.OrderNotFound;
  if (!acceptsProof(order)) return PROOF_REJECTION.NotPending;
  const config = new Map(
    order.maximo === null ? [] : [[CONFIG_KEY.ProofsMaxPerOrder, order.maximo]],
  );
  return order.subidos >= maxProofsPerOrder(config) ? PROOF_REJECTION.LimitReached : null;
}

/** Comprobación previa (sin bloqueo) para no subir archivos que se van a rechazar. */
export async function checkProofTarget(
  sql: Sql,
  token: string,
): Promise<
  { ok: true; pedidoId: number; restauranteId: number } | { ok: false; error: ProofRejection }
> {
  const [order] = await sql<ProofTarget[]>`
    SELECT p.id, p.restaurante_id, p.estado, p.estado_pago, p.metodo_pago,
           (SELECT count(*)::int FROM public.pedido_justificante j WHERE j.pedido_id = p.id) AS subidos,
           (SELECT c.config_value FROM public.restaurante_config c
            WHERE  c.restaurante_id = p.restaurante_id AND c.config_key = ${CONFIG_KEY.ProofsMaxPerOrder})
             AS maximo
    FROM   public.pedidos p
    WHERE  p.tracking_token = ${token}::uuid
  `;
  const error = rejectionFor(order);
  return error || !order
    ? { ok: false, error: error ?? PROOF_REJECTION.OrderNotFound }
    : { ok: true, pedidoId: order.id, restauranteId: order.restaurante_id };
}

/**
 * Registra el justificante con el pedido bloqueado: dos subidas a la vez no superan el límite
 * ni se registran si el cobro se confirmó mientras tanto.
 */
export async function saveProof(
  sql: Sql,
  token: string,
  file: { readonly ruta: string; readonly tipoMime: string; readonly bytes: number },
): Promise<{ ok: true; total: number } | { ok: false; error: ProofRejection }> {
  return sql.begin(async (tx) => {
    // Primero se bloquea el pedido; el recuento va en una consulta aparte para que vea las
    // subidas confirmadas mientras se esperaba el bloqueo (en la misma consulta no las vería).
    await tx`
      SELECT 1 FROM public.pedidos WHERE tracking_token = ${token}::uuid FOR UPDATE
    `;
    const [order] = await tx<ProofTarget[]>`
      SELECT p.id, p.restaurante_id, p.estado, p.estado_pago, p.metodo_pago,
             (SELECT count(*)::int FROM public.pedido_justificante j WHERE j.pedido_id = p.id) AS subidos,
             (SELECT c.config_value FROM public.restaurante_config c
              WHERE  c.restaurante_id = p.restaurante_id AND c.config_key = ${CONFIG_KEY.ProofsMaxPerOrder})
               AS maximo
      FROM   public.pedidos p
      WHERE  p.tracking_token = ${token}::uuid
    `;
    const error = rejectionFor(order);
    if (error || !order)
      return { ok: false as const, error: error ?? PROOF_REJECTION.OrderNotFound };
    await tx`
      INSERT INTO public.pedido_justificante (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
      VALUES (${order.id}, ${order.restaurante_id}, ${file.ruta}, ${file.tipoMime}, ${file.bytes})
    `;
    return { ok: true as const, total: order.subidos + 1 };
  });
}
