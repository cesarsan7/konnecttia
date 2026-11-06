import type { ApiErrorBody } from "../types";
import type { PanelOrder } from "./types";

/** Justificante que el cliente ha subido a un pedido (GET .../orders/:id/justificantes). */
export type OrderProof = {
  readonly id: number;
  readonly tipo_mime: string;
  readonly bytes: number;
  readonly created_at: string;
  /** URL firmada de corta duración: no se guarda ni se comparte. */
  readonly url: string;
};

export type OrderProofs = {
  readonly justificantes: readonly OrderProof[];
  readonly expira_en_segundos: number;
};

/** Justificantes de un pedido con el cobro pendiente (0 si ya está resuelto). */
export function pendingProofs(order: Pick<PanelOrder, "estado_pago" | "justificantes">): number {
  return order.estado_pago === "pendiente" ? (order.justificantes ?? 0) : 0;
}

/** Texto del indicador de la tarjeta. */
export function proofIndicator(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? "Justificante recibido" : `${count} justificantes recibidos`;
}

const MIME_KIND: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "image/jpeg": "imagen",
  "image/png": "imagen",
  "image/webp": "imagen",
};

/** Etiqueta del enlace a cada justificante: «Justificante 2 (PDF)». */
export function proofLinkLabel(index: number, proof: Pick<OrderProof, "tipo_mime">): string {
  return `Justificante ${index + 1} (${MIME_KIND[proof.tipo_mime] ?? "archivo"})`;
}

export function describeProofViewError(status: number, body: ApiErrorBody | null): string {
  if (body?.error === "storage_not_configured") {
    return "El almacén de justificantes no está configurado.";
  }
  if (status === 0) return "Sin conexión con el servidor.";
  if (status === 403) return "Tu usuario no tiene permiso para ver justificantes.";
  if (status === 404) return "Ese pedido ya no está disponible.";
  return "No se pudo abrir el justificante. Inténtalo de nuevo.";
}
