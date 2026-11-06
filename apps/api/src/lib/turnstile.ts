import type { CaptchaVerifier } from "../context";

/** Punto de verificación de Cloudflare Turnstile. */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Un token de Turnstile ocupa menos de 2048 caracteres. */
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Crea el verificador de captcha. Falla cerrado: si Cloudflare no responde o contesta algo
 * inesperado, el token no se da por bueno (sin Turnstile el navegador tampoco habría obtenido uno).
 * El token se envía por formulario junto con la IP del cliente y nunca se registra en logs.
 */
export function createTurnstileVerifier(
  secret: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): CaptchaVerifier {
  return async (token, ip) => {
    if (!token || token.length > TURNSTILE_MAX_TOKEN_LENGTH) return false;
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set("remoteip", ip);
    try {
      const response = await fetchImpl(TURNSTILE_VERIFY_URL, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });
      if (!response.ok) return false;
      const result = (await response.json()) as { success?: unknown };
      return result.success === true;
    } catch {
      return false;
    }
  };
}
