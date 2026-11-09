import type { ApiErrorBody } from "./types";

/**
 * Normaliza un teléfono al formato que acepta la API (+ y dígitos). Un número español de 9
 * cifras (6, 7, 8 o 9 inicial) recibe +34; con prefijo internacional se respeta.
 */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (/^[6-9]\d{8}$/.test(international)) return `+34${international}`;
  if (/^\+\d{7,19}$/.test(international)) return international;
  return null;
}

/**
 * Email del cliente (obligatorio en la web: recibe los avisos del pedido). Se limpia igual que
 * en la API: sin espacios y en minúsculas. Devuelve null si no parece un email.
 */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

export const EMAIL_REQUIRED_MESSAGE = "Escribe un email válido para recibir los avisos del pedido.";

export function emailProblem(raw: string): string | null {
  return normalizeEmail(raw) ? null : EMAIL_REQUIRED_MESSAGE;
}

const EMAIL_STORAGE_KEY = "easyorder:email";

/** Email recordado en este navegador (comodidad: si el almacenamiento falla, no pasa nada). */
export function readRememberedEmail(getStorage: () => Pick<Storage, "getItem">): string {
  try {
    return getStorage().getItem(EMAIL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberEmail(getStorage: () => Pick<Storage, "setItem">, email: string): void {
  try {
    if (email) getStorage().setItem(EMAIL_STORAGE_KEY, email);
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): se pedirá de nuevo.
  }
}

/** Aviso mientras falta aceptar la política de privacidad (casilla obligatoria del checkout). */
export const PRIVACY_REQUIRED_MESSAGE = "Acepta la política de privacidad para enviar el pedido.";

export function privacyProblem(accepted: boolean): string | null {
  return accepted ? null : PRIVACY_REQUIRED_MESSAGE;
}

/** Dónde se lee la política: la propia del restaurante o la página genérica de la web. */
export function privacyHref(slug: string, url: string | null | undefined): string {
  return url?.trim() ? url.trim() : `/${encodeURIComponent(slug)}/privacidad`;
}

/** Campos de consentimiento del cuerpo del pedido (la API los exige solo en el canal web). */
export function consentFields(privacyAccepted: boolean, promotions: boolean) {
  return { privacidad_aceptada: privacyAccepted, acepta_promociones: promotions };
}

export const PAYMENT_LABEL: Readonly<Record<string, string>> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  bizum: "Bizum",
  online: "Pago online",
};

export function paymentLabel(method: string): string {
  return PAYMENT_LABEL[method] ?? method;
}

/**
 * Texto cuando el restaurante no acepta pedidos online (prueba pendiente, rechazada o terminada).
 * La carta se sigue viendo.
 */
export const RESTAURANT_UNAVAILABLE_MESSAGE = "Este local no acepta pedidos online ahora mismo.";

/** ¿Acepta pedidos la carta? Las respuestas antiguas de la API no traen el dato: sí acepta. */
export function acceptsOnlineOrders(restaurant: { readonly acepta_pedidos?: boolean }): boolean {
  return restaurant.acepta_pedidos !== false;
}

/** Mensajes por `reason` (antifraude): tienen prioridad sobre el mensaje del `error`. */
export const PHONE_LIMIT_MESSAGE = "Ya tienes pedidos en curso; llama al local si necesitas otro.";
const REASON_MESSAGE: Readonly<Record<string, string>> = {
  phone_limit: PHONE_LIMIT_MESSAGE,
  // Neutro a propósito: no se dice si el teléfono está bloqueado.
  order_not_accepted:
    "No podemos tramitar este pedido por la web. Si quieres pedir, llama directamente al local.",
  captcha_failed:
    "No hemos podido comprobar que eres una persona. Recarga la página e inténtalo de nuevo.",
  restaurant_unavailable: RESTAURANT_UNAVAILABLE_MESSAGE,
};

const ERROR_MESSAGE: Readonly<Record<string, string>> = {
  local_closed: "El local está cerrado ahora mismo. Prueba con otro local o más tarde.",
  branch_required: "Elige en qué local quieres recoger el pedido.",
  branch_not_available: "Ese local no está disponible. Elige otro.",
  location_required:
    "Para calcular el envío de esa zona necesitamos tu ubicación. Pulsa «Usar mi ubicación».",
  zone_not_found: "No repartimos en esa dirección. Elige otra zona o recoge en el local.",
  delivery_not_available: "Ahora mismo no hay reparto. Puedes recogerlo en el local.",
  pickup_not_available: "Ahora mismo no se puede recoger en el local.",
  payment_method_not_accepted: "Ese método de pago no está disponible. Elige otro.",
  rate_limited: "Has enviado varios pedidos seguidos. Espera unos minutos e inténtalo de nuevo.",
  invalid_body: "Revisa los datos del formulario.",
  restaurant_not_found: "No encontramos este restaurante.",
  privacy_required: "Para pedir debes aceptar la política de privacidad.",
};

const LINE_ERROR_MESSAGE: Readonly<Record<string, string>> = {
  DELIVERY_MINIMUM_NOT_MET: "No llegas al pedido mínimo de reparto.",
  ITEM_NOT_AVAILABLE_AT_BRANCH: "Algún producto no se sirve en el local elegido.",
  ITEM_NOT_FOUND: "Algún producto ya no está en la carta.",
  ITEM_UNAVAILABLE: "Algún producto ya no está disponible.",
  VARIANT_UNAVAILABLE: "Algún tamaño o variante ya no está disponible.",
  OPTION_UNAVAILABLE: "Algún extra ya no está disponible.",
};

/** Traduce un error de la API a un mensaje para el cliente (nunca muestra códigos técnicos). */
export function describeApiError(status: number, body: ApiErrorBody | null): string {
  if (!body) {
    return status >= 500
      ? "No hemos podido enviar el pedido. Inténtalo de nuevo en un momento."
      : "No hemos podido enviar el pedido. Revisa los datos.";
  }
  if (body.error === "invalid_items" && body.errors?.length) {
    const minimum = body.errors.find((error) => error.code === "DELIVERY_MINIMUM_NOT_MET");
    if (minimum?.detail) {
      const missing = (Number(minimum.detail) / 100).toLocaleString("es-ES", {
        style: "currency",
        currency: "EUR",
      });
      return `Te faltan ${missing} para el pedido mínimo de reparto. Añade algo más o cambia a recogida.`;
    }
    const first = body.errors[0];
    return (first && LINE_ERROR_MESSAGE[first.code]) ?? "Revisa los productos del carrito.";
  }
  const byReason = body.reason ? REASON_MESSAGE[body.reason] : undefined;
  if (byReason) return byReason;
  return ERROR_MESSAGE[body.error] ?? "No hemos podido enviar el pedido. Inténtalo de nuevo.";
}

export const ORDER_STATUS_LABEL: Readonly<Record<string, string>> = {
  recibido: "Recibido",
  pendiente_pago: "Pendiente de pago",
  confirmado: "Confirmado",
  pagado: "Pagado",
  en_preparacion: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
  expirado: "Expirado",
};

/** Pasos que ve el cliente, según el tipo de entrega. */
export function trackingSteps(fulfillment: string | null): readonly string[] {
  return fulfillment === "delivery"
    ? ["recibido", "confirmado", "en_preparacion", "en_camino", "entregado"]
    : ["recibido", "confirmado", "en_preparacion", "listo", "entregado"];
}

/** Texto de la tarifa de una zona para el selector («2,00 €», «1,50 € + 0,50 €/km»…). */
export function describeZoneFee(zone: {
  readonly tipo_tarifa: string;
  readonly envio: number;
  readonly por_km: number | null;
  readonly envio_maximo: number | null;
  readonly gratis_desde: number | null;
  readonly minimo: number;
}): string {
  const money = (value: number) =>
    value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
  const parts = [
    zone.tipo_tarifa === "por_km" && zone.por_km !== null
      ? `envío ${money(zone.envio)} + ${money(zone.por_km)}/km${zone.envio_maximo !== null ? ` (máx. ${money(zone.envio_maximo)})` : ""}`
      : zone.envio === 0
        ? "envío gratis"
        : `envío ${money(zone.envio)}`,
    ...(zone.gratis_desde !== null ? [`gratis desde ${money(zone.gratis_desde)}`] : []),
    ...(zone.minimo > 0 ? [`mínimo ${money(zone.minimo)}`] : []),
  ];
  return parts.join(" · ");
}
