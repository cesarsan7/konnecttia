import { describe, expect, it } from "vitest";
import {
  cartaUrl,
  EMPTY_SIGNUP,
  hasErrors,
  SIGNUP_STEP,
  type SignupForm,
  signupErrorMessage,
  signupErrorStep,
  slugCheckMessage,
  suggestedTimeZone,
  suggestSlug,
  toSignupBody,
  trialLimitsText,
  validateStep,
} from "./logic";

const filled: SignupForm = {
  nombre: "Mi Bar",
  slug: "mi-bar",
  localNombre: "Mi Bar Centro",
  direccion: " Calle 1 ",
  telefono: "",
  zonaHoraria: "Atlantic/Canary",
  recogida: true,
  reparto: false,
  miembroNombre: " Ana ",
};

describe("asistente de alta: validación por paso", () => {
  it("paso 1: nombre y dirección web", () => {
    expect(validateStep(SIGNUP_STEP.Restaurant, filled)).toEqual({});
    const errors = validateStep(SIGNUP_STEP.Restaurant, { ...filled, nombre: " ", slug: "ab" });
    expect(Object.keys(errors).sort()).toEqual(["nombre", "slug"]);
    expect(validateStep(SIGNUP_STEP.Restaurant, { ...filled, slug: "panel" }).slug).toMatch(
      /reservado/,
    );
    expect(validateStep(SIGNUP_STEP.Restaurant, { ...filled, slug: "Mi Bar" }).slug).toBeTruthy();
  });

  it("paso 2: local y zona horaria", () => {
    expect(validateStep(SIGNUP_STEP.Branch, filled)).toEqual({});
    const errors = validateStep(SIGNUP_STEP.Branch, {
      ...filled,
      localNombre: "",
      zonaHoraria: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["localNombre", "zonaHoraria"]);
    expect(
      validateStep(SIGNUP_STEP.Branch, { ...filled, zonaHoraria: "Marte/Olimpo" }).zonaHoraria,
    ).toBeTruthy();
  });

  it("paso 3: al menos recogida o reparto", () => {
    expect(validateStep(SIGNUP_STEP.Service, filled)).toEqual({});
    expect(
      validateStep(SIGNUP_STEP.Service, { ...filled, reparto: true, recogida: false }),
    ).toEqual({});
    const none = validateStep(SIGNUP_STEP.Service, { ...filled, recogida: false, reparto: false });
    expect(hasErrors(none)).toBe(true);
    expect(none.servicio).toBeTruthy();
  });

  it("un formulario vacío falla en los pasos 1 y 2", () => {
    expect(hasErrors(validateStep(SIGNUP_STEP.Restaurant, EMPTY_SIGNUP))).toBe(true);
    expect(hasErrors(validateStep(SIGNUP_STEP.Branch, EMPTY_SIGNUP))).toBe(true);
  });
});

describe("asistente de alta: cuerpo y textos", () => {
  it("recorta los textos y omite lo vacío", () => {
    expect(toSignupBody(filled, null)).toEqual({
      nombre: "Mi Bar",
      slug: "mi-bar",
      zona_horaria: "Atlantic/Canary",
      local: { nombre: "Mi Bar Centro", direccion: "Calle 1" },
      recogida: true,
      reparto: false,
      miembro_nombre: "Ana",
    });
    expect(toSignupBody({ ...filled, miembroNombre: "" }, "tok").captcha_token).toBe("tok");
    expect("miembro_nombre" in toSignupBody({ ...filled, miembroNombre: "" }, null)).toBe(false);
  });

  it("propone la dirección web desde el nombre", () => {
    expect(suggestSlug("Cafetería «Siempre Juntos»")).toBe("cafeteria-siempre-juntos");
  });

  it("la zona horaria del navegador solo se sugiere si es válida", () => {
    expect(suggestedTimeZone(() => "Europe/Madrid")).toBe("Europe/Madrid");
    expect(suggestedTimeZone(() => "Canarias")).toBe("");
    expect(suggestedTimeZone(() => undefined)).toBe("");
    expect(
      suggestedTimeZone(() => {
        throw new Error("sin Intl");
      }),
    ).toBe("");
  });

  it("la comprobación en vivo de la dirección", () => {
    expect(slugCheckMessage({ disponible: true })).toBeNull();
    expect(slugCheckMessage({ disponible: false, motivo: "slug_taken" })).toMatch(/en uso/);
    expect(slugCheckMessage({ disponible: false, motivo: "slug_reserved" })).toMatch(/reservada/);
    expect(slugCheckMessage({ disponible: false, motivo: "slug_too_short" })).toMatch(/3/);
    expect(slugCheckMessage({ disponible: false, motivo: "slug_invalid_format" })).toMatch(
      /minúsculas/,
    );
  });

  it("la dirección pública de la carta", () => {
    expect(cartaUrl("https://app.test/", "mi-bar")).toBe("https://app.test/mi-bar");
    expect(cartaUrl("https://app.test", " ")).toBe("https://app.test/tu-restaurante");
  });

  it("los límites de la prueba para la landing", () => {
    expect(trialLimitsText({ dias: 14, max_pedidos: 50 })).toBe("14 días o 50 pedidos");
    expect(trialLimitsText({ dias: 1, max_pedidos: null })).toBe("1 día");
    expect(trialLimitsText({ dias: null, max_pedidos: 1 })).toBe("1 pedido");
    expect(trialLimitsText({ dias: null, max_pedidos: null })).toBeNull();
  });

  it("mensajes de error de la API", () => {
    expect(signupErrorMessage(0, null)).toMatch(/conexión/);
    expect(signupErrorMessage(401, null)).toMatch(/sesión/);
    expect(signupErrorMessage(429, null)).toMatch(/Demasiados/);
    expect(signupErrorMessage(403, { error: "forbidden", reason: "email_not_verified" })).toMatch(
      /Confirma tu email/,
    );
    expect(signupErrorMessage(409, { error: "conflict", reason: "already_has_trial" })).toMatch(
      /ya tiene una prueba/,
    );
    expect(signupErrorMessage(409, { error: "conflict", reason: "slug_taken" })).toMatch(/en uso/);
    expect(signupErrorMessage(503, null)).toMatch(/No pudimos crear/);
  });

  it("a qué paso volver según el error", () => {
    expect(signupErrorStep({ error: "x", reason: "slug_taken" })).toBe(SIGNUP_STEP.Restaurant);
    expect(signupErrorStep({ error: "x", reason: "invalid_time_zone" })).toBe(SIGNUP_STEP.Branch);
    expect(signupErrorStep({ error: "x", reason: "fulfillment_required" })).toBe(
      SIGNUP_STEP.Service,
    );
    expect(signupErrorStep({ error: "x", reason: "captcha_failed" })).toBeNull();
    expect(signupErrorStep(null)).toBeNull();
  });
});
