import { describe, expect, it } from "vitest";
import {
  CAPTCHA_UNAVAILABLE_MESSAGE,
  CAPTCHA_WAITING_MESSAGE,
  captchaFields,
  captchaProblem,
  normalizeSiteKey,
  TURNSTILE_SCRIPT_URL,
} from "./turnstile";

describe("captcha Turnstile", () => {
  it("sin clave del sitio está desactivado", () => {
    expect(normalizeSiteKey(undefined)).toBeNull();
    expect(normalizeSiteKey("")).toBeNull();
    expect(normalizeSiteKey("   ")).toBeNull();
    expect(normalizeSiteKey(" 0x4AAAA ")).toBe("0x4AAAA");
  });

  it("solo envía el token si existe", () => {
    expect(captchaFields(null)).toEqual({});
    expect(captchaFields("abc")).toEqual({ captcha_token: "abc" });
  });

  it("sin captcha activo no bloquea el envío", () => {
    expect(captchaProblem(false, null, false)).toBeNull();
    expect(captchaProblem(false, null, true)).toBeNull();
  });

  it("con captcha activo espera el token y avisa si el script no cargó", () => {
    expect(captchaProblem(true, null, false)).toBe(CAPTCHA_WAITING_MESSAGE);
    expect(captchaProblem(true, null, true)).toBe(CAPTCHA_UNAVAILABLE_MESSAGE);
    expect(captchaProblem(true, "abc", false)).toBeNull();
  });

  it("el script viene de Cloudflare en modo explícito", () => {
    const url = new URL(TURNSTILE_SCRIPT_URL);
    expect(url.origin).toBe("https://challenges.cloudflare.com");
    expect(url.searchParams.get("render")).toBe("explicit");
  });
});
