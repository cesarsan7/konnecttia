import type { ApiErrorBody } from "./types";

/**
 * Código de verificación del teléfono (antifraude capa 3, ADR 0011). El servidor decide cuándo
 * hace falta: el checkout intenta el pedido y, si responde `verification_required`, pide el código.
 */

export const CODE_LENGTH = 6;

/** Solo dígitos, hasta 6: acepta lo pegado con espacios o guiones («123 456»). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function codeComplete(raw: string): boolean {
  return normalizeCode(raw).length === CODE_LENGTH;
}

/** Cuerpo de POST /verificacion: describe el pedido; el servidor decide si envía el código. */
export function codeRequestBody(input: {
  readonly phone: string;
  readonly fulfillment: string;
  readonly payment: string;
  readonly totalEuros: number;
  readonly captchaToken: string | null;
}) {
  return {
    telefono: input.phone,
    tipo_despacho: input.fulfillment,
    metodo_pago: input.payment,
    importe: Math.max(0, Math.round(input.totalEuros * 100) / 100),
    ...(input.captchaToken ? { captcha_token: input.captchaToken } : {}),
  };
}

/** Total con el que pedir el código: el del servidor si lo dio; si no, la estimación del carrito. */
export function totalForCode(body: ApiErrorBody | null, estimateEuros: number): number {
  return typeof body?.importe === "number" ? body.importe : estimateEuros;
}

export const CODE_SENT_FALLBACK_SECONDS = 60;

const REQUEST_ERROR_REASON: Readonly<Record<string, string>> = {
  monthly_cap:
    "Ahora mismo no podemos verificar tu teléfono. Paga con tarjeta o llama al local para hacer el pedido.",
  too_many_codes: "Has pedido demasiados códigos. Espera un rato o llama al local.",
  captcha_failed:
    "No hemos podido comprobar que eres una persona. Recarga la página e inténtalo de nuevo.",
};

/** Mensaje para un error al pedir el código (nunca muestra códigos técnicos). */
export function describeCodeRequestError(status: number, body: ApiErrorBody | null): string {
  if (body?.error === "order_not_accepted") {
    return "No podemos tramitar este pedido por la web. Si quieres pedir, llama directamente al local.";
  }
  if (body?.reason && REQUEST_ERROR_REASON[body.reason])
    return REQUEST_ERROR_REASON[body.reason] ?? "";
  if (body?.reason === "resend_wait") return "Espera un momento antes de pedir otro código.";
  if (status === 429) return "Has hecho varios intentos seguidos. Espera unos minutos.";
  if (body?.error === "code_send_failed") {
    return "No hemos podido enviar el código por WhatsApp. Inténtalo de nuevo o llama al local.";
  }
  return "No hemos podido enviar el código. Inténtalo de nuevo en un momento.";
}

/** Mensaje para un código que no se acepta. */
export function describeConfirmError(status: number, body: ApiErrorBody | null): string {
  if (body?.error === "code_invalid") {
    if (body.reason === "wrong") {
      const left = body.intentos_restantes ?? 0;
      return left === 1
        ? "Código incorrecto. Te queda 1 intento."
        : `Código incorrecto. Te quedan ${left} intentos.`;
    }
    if (body.reason === "locked") return "Demasiados intentos. Pide un código nuevo.";
    return "El código caducó o no existe. Pide uno nuevo.";
  }
  if (status === 429) return "Has hecho varios intentos seguidos. Espera unos minutos.";
  return "No hemos podido comprobar el código. Inténtalo de nuevo.";
}

/** «0:45», «1:00»: cuenta atrás para poder reenviar. */
export function countdownLabel(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
