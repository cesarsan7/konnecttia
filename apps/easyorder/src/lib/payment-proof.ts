/**
 * Pago por Bizum o transferencia en el seguimiento del pedido: datos para pagar, concepto y
 * justificante. Lógica pura (sin DOM) para poder probarla.
 */

/** Mismos límites que valida la API (apps/api/src/repositories/payment-proofs.ts). */
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
/** Atributo `accept` del selector de archivo. */
export const PROOF_ACCEPT = PROOF_MIME_TYPES.join(",");

const PROOF_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "pdf"];
const DEFERRED_METHODS: ReadonlySet<string> = new Set(["transferencia", "bizum"]);
const CANCELLED_STATES: ReadonlySet<string> = new Set(["cancelado", "expirado"]);

export type ProofProblem = "empty" | "too_large" | "unsupported_type";

const PROOF_PROBLEM_MESSAGE: Readonly<Record<ProofProblem, string>> = {
  empty: "El archivo está vacío. Elige otro.",
  too_large: "El archivo pesa más de 5 MB. Elige una captura más ligera.",
  unsupported_type: "Sube una imagen (JPG, PNG o WebP) o un PDF.",
};

/**
 * Comprobación previa en el navegador para avisar antes de subir. La API vuelve a validar el
 * tipo real del archivo y el tamaño: esto es solo comodidad.
 */
export function proofProblem(file: {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}): ProofProblem | null {
  if (file.size <= 0) return "empty";
  if (file.size > PROOF_MAX_BYTES) return "too_large";
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!PROOF_MIME_TYPES.includes(file.type) && !PROOF_EXTENSIONS.includes(extension)) {
    return "unsupported_type";
  }
  return null;
}

export function proofProblemMessage(problem: ProofProblem): string {
  return PROOF_PROBLEM_MESSAGE[problem];
}

/** Mensaje para el cliente cuando la API rechaza la subida (nunca muestra códigos técnicos). */
export function describeProofError(
  status: number,
  body: { readonly error?: string; readonly reason?: string } | null,
): string {
  if (status === 0) return "Sin conexión. Inténtalo de nuevo en un momento.";
  switch (body?.error) {
    case "storage_not_configured":
      return "El local aún no tiene activada la subida de justificantes. Envíaselo directamente.";
    case "invalid_proof":
      return body.reason === "too_large"
        ? PROOF_PROBLEM_MESSAGE.too_large
        : PROOF_PROBLEM_MESSAGE.unsupported_type;
    case "proof_limit_reached":
      return "Ya has subido el máximo de justificantes para este pedido.";
    case "payment_not_pending":
      return "El pago de este pedido ya no está pendiente.";
    case "rate_limited":
      return "Has subido varios archivos seguidos. Espera unos minutos.";
    case "order_not_found":
      return "No encontramos este pedido.";
    default:
      return "No hemos podido subir el justificante. Inténtalo de nuevo.";
  }
}

/** ¿Hay que enseñar al cliente cómo pagar? Bizum o transferencia con el cobro pendiente. */
export function needsPaymentInfo(order: {
  readonly estado: string;
  readonly estadoPago: string;
  readonly metodoPago: string | null;
}): boolean {
  return (
    order.estadoPago === "pendiente" &&
    DEFERRED_METHODS.has(order.metodoPago ?? "") &&
    !CANCELLED_STATES.has(order.estado)
  );
}

const PAYMENT_DETAIL_LABEL: Readonly<Record<string, string>> = {
  titular: "Titular",
  iban: "IBAN",
  banco: "Banco",
  bizum: "Teléfono de Bizum",
};
const PAYMENT_DETAIL_ORDER = ["titular", "iban", "banco", "bizum"];

/** Filas «etiqueta: valor» de los datos para pagar, en orden fijo y solo las conocidas. */
export function paymentDetailRows(
  details: Readonly<Record<string, string>> | null,
): { readonly key: string; readonly label: string; readonly value: string }[] {
  if (!details) return [];
  return PAYMENT_DETAIL_ORDER.flatMap((key) => {
    const value = details[key]?.trim();
    return value ? [{ key, label: PAYMENT_DETAIL_LABEL[key] ?? key, value }] : [];
  });
}

/** Título del bloque de pago según el método. */
export function paymentTitle(method: string | null): string {
  return method === "bizum" ? "Paga por Bizum" : "Datos para la transferencia";
}

/** El concepto del pago es el código del pedido (para cuadrarlo con el banco); null si no hay. */
export function paymentConcept(code: string | null): string | null {
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

/** Texto de estado de los justificantes ya subidos. */
export function proofStatusText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "Justificante enviado. El local lo revisará al confirmar el pago."
    : `${count} justificantes enviados. El local los revisará al confirmar el pago.`;
}
