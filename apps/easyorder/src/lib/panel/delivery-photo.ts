import type { ApiErrorBody } from "../types";
import type { Delivery } from "./drivers";

/** Valores de `reparto_foto_entrega`: lo que el local decide sobre la prueba de entrega. */
export const DELIVERY_PHOTO_MODE = {
  No: "no",
  Optional: "opcional",
  Required: "obligatoria",
} as const;

export type DeliveryPhotoMode = (typeof DELIVERY_PHOTO_MODE)[keyof typeof DELIVERY_PHOTO_MODE];

/** Opciones del selector de Ajustes → Reparto. */
export const DELIVERY_PHOTO_OPTIONS: readonly {
  readonly id: DeliveryPhotoMode;
  readonly label: string;
  readonly hint: string;
}[] = [
  { id: DELIVERY_PHOTO_MODE.No, label: "No", hint: "El repartidor no sube foto." },
  {
    id: DELIVERY_PHOTO_MODE.Optional,
    label: "Opcional",
    hint: "El repartidor puede subir una foto al entregar.",
  },
  {
    id: DELIVERY_PHOTO_MODE.Required,
    label: "Obligatoria",
    hint: "No puede marcar «Entregado» sin subir la foto.",
  },
];

/** Tamaño máximo que acepta la API (se avisa antes de subir un archivo que se va a rechazar). */
export const MAX_DELIVERY_PHOTO_BYTES = 5 * 1024 * 1024;

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Foto de entrega de un pedido (GET .../orders/:id/foto-entrega). */
export type OrderDeliveryPhoto = {
  readonly id: number;
  readonly tipo_mime: string;
  readonly bytes: number;
  readonly created_at: string;
  /** URL firmada de corta duración: no se guarda ni se comparte. */
  readonly url: string;
};

export type OrderDeliveryPhotos = {
  readonly fotos: readonly OrderDeliveryPhoto[];
  readonly expira_en_segundos: number;
};

/** Si el local ofrece la foto en «Mis repartos». */
export function offersPhoto(mode: DeliveryPhotoMode): boolean {
  return mode !== DELIVERY_PHOTO_MODE.No;
}

/** «Entregado» queda deshabilitado: la foto es obligatoria y todavía no hay ninguna. */
export function photoBlocksDelivery(
  mode: DeliveryPhotoMode,
  delivery: Pick<Delivery, "fotos_entrega">,
): boolean {
  return mode === DELIVERY_PHOTO_MODE.Required && delivery.fotos_entrega < 1;
}

/** Problema del archivo elegido antes de subirlo, o null si es válido. */
export function photoFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (file.size <= 0) return "La foto está vacía. Haz otra.";
  if (!ACCEPTED_TYPES.has(file.type)) return "Solo se admiten fotos JPG, PNG o WebP.";
  if (file.size > MAX_DELIVERY_PHOTO_BYTES) {
    return `La foto pesa más de ${MAX_DELIVERY_PHOTO_BYTES / (1024 * 1024)} MB. Haz otra con menos calidad.`;
  }
  return null;
}

/** Texto del indicador de la tarjeta del pedido. */
export function photoIndicator(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "Foto de entrega" : `${count} fotos de entrega`;
}

/** Etiqueta del enlace a cada foto: «Foto 2». */
export function photoLinkLabel(index: number, total: number): string {
  return total === 1 ? "Ver foto de entrega" : `Foto ${index + 1}`;
}

export function describePhotoUploadError(status: number, body: ApiErrorBody | null): string {
  if (body?.error === "storage_not_configured") {
    return "El almacén de fotos no está configurado. Avisa al local.";
  }
  if (status === 0) return "Sin conexión. Inténtalo de nuevo cuando tengas cobertura.";
  if (status === 413 || body?.reason === "too_large") {
    return "La foto es demasiado grande (máximo 5 MB).";
  }
  if (status === 415) return "Solo se admiten fotos JPG, PNG o WebP.";
  if (body?.reason === "delivery_photo_limit_reached") {
    return "Ya subiste el máximo de fotos de este pedido.";
  }
  if (body?.reason === "order_not_on_the_way") {
    return "La foto se sube cuando el pedido va en camino.";
  }
  if (body?.reason === "delivery_photo_disabled") return "El local no pide foto de entrega.";
  if (status === 404) return "Ese pedido ya no es tuyo.";
  return "No se pudo subir la foto. Inténtalo de nuevo.";
}

export function describePhotoViewError(status: number, body: ApiErrorBody | null): string {
  if (body?.error === "storage_not_configured") {
    return "El almacén de fotos no está configurado.";
  }
  if (status === 0) return "Sin conexión con el servidor.";
  if (status === 403) return "Tu usuario no tiene permiso para ver fotos de entrega.";
  if (status === 404) return "Ese pedido ya no está disponible.";
  return "No se pudo abrir la foto. Inténtalo de nuevo.";
}
