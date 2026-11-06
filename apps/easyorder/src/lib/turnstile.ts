/**
 * Captcha invisible de Cloudflare Turnstile en el checkout web. Es opcional: sin
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY no se carga nada y el pedido se envía como siempre.
 */

/** Script de Cloudflare (modo explícito: el widget se crea desde React). */
export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

/**
 * Clave pública del sitio. SOLO se llama desde el servidor (la página la pasa como prop): se lee
 * con un nombre dinámico a propósito, para que Next no la fije al compilar y valga la variable de
 * EasyPanel en tiempo de ejecución, igual que `API_PUBLIC_URL`.
 */
export function turnstileSiteKey(): string | null {
  return normalizeSiteKey(process.env[SITE_KEY_ENV]);
}

export function normalizeSiteKey(value: string | undefined | null): string | null {
  const key = value?.trim();
  return key ? key : null;
}

/** Campo del cuerpo del pedido con el token (nada si no hay captcha). */
export function captchaFields(token: string | null): { captcha_token?: string } {
  return token ? { captcha_token: token } : {};
}

export const CAPTCHA_WAITING_MESSAGE = "Comprobando que eres una persona…";
export const CAPTCHA_UNAVAILABLE_MESSAGE =
  "No se pudo cargar la comprobación de seguridad. Recarga la página o desactiva el bloqueador de contenido.";

/** Aviso mientras el captcha no ha dado su token; null si no hace falta o ya está. */
export function captchaProblem(
  enabled: boolean,
  token: string | null,
  loadFailed: boolean,
): string | null {
  if (!enabled || token) return null;
  return loadFailed ? CAPTCHA_UNAVAILABLE_MESSAGE : CAPTCHA_WAITING_MESSAGE;
}
