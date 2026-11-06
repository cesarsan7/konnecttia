/**
 * Validación pura de los ajustes de privacidad y antifraude del restaurante (sin I/O).
 * La usan la ruta de Ajustes y la lectura de la política en el pedido web.
 */

/** Tope de la URL de la política de privacidad. */
export const PRIVACY_URL_MAX = 500;
/** Tope de la versión de la política (texto corto, p. ej. «2026-11»). */
export const PRIVACY_VERSION_MAX = 40;
/** Tope de los límites antifraude por teléfono (evita valores absurdos). */
export const PHONE_LIMIT_MAX = 1000;

/** URL http o https normalizada; null si falta o no es una URL web válida. */
export function parseHttpUrl(value: string | undefined | null): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** ¿Es un valor aceptable para la URL de la política? Vacío vale (se usa la página plantilla). */
export function isValidPolicyUrl(value: string | null | undefined): boolean {
  const text = value?.trim();
  if (!text) return true;
  return text.length <= PRIVACY_URL_MAX && parseHttpUrl(text) !== null;
}

/** ¿Es un límite válido? Entero entre 1 y el tope, o vacío (null) = sin límite. */
export function isValidPhoneLimit(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return Number.isInteger(value) && value >= 1 && value <= PHONE_LIMIT_MAX;
}
