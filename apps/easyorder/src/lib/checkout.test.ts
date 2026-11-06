import { describe, expect, it } from "vitest";
import {
  acceptsOnlineOrders,
  consentFields,
  describeApiError,
  describeZoneFee,
  normalizePhone,
  PHONE_LIMIT_MESSAGE,
  PRIVACY_REQUIRED_MESSAGE,
  privacyHref,
  privacyProblem,
  trackingSteps,
} from "./checkout";

describe("teléfono", () => {
  it.each([
    ["612 34 56 78", "+34612345678"],
    ["828052673", "+34828052673"],
    ["0034 612345678", "+34612345678"],
    ["+56 9 1234 5678", "+56912345678"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("rechaza lo que no es un teléfono", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("hola")).toBeNull();
  });
});

describe("errores de la API", () => {
  it("explica cuánto falta para el mínimo de reparto", () => {
    expect(
      describeApiError(422, {
        error: "invalid_items",
        errors: [{ code: "DELIVERY_MINIMUM_NOT_MET", detail: "600" }],
      }),
    ).toMatch(/^Te faltan 6,00\s€ para el pedido mínimo de reparto\./u);
  });

  it("nunca muestra códigos técnicos", () => {
    expect(describeApiError(422, { error: "local_closed" })).toContain("cerrado");
    expect(describeApiError(422, { error: "algo_nuevo" })).not.toContain("algo_nuevo");
    expect(describeApiError(502, null)).toContain("Inténtalo de nuevo");
  });
});

describe("mensajes de antifraude", () => {
  it("el límite por teléfono invita a llamar al local", () => {
    const message = describeApiError(429, { error: "rate_limited", reason: "phone_limit" });
    expect(message).toBe(PHONE_LIMIT_MESSAGE);
    expect(message).toContain("llama al local");
    // Sin motivo, el 429 sigue siendo el aviso genérico de pedidos seguidos.
    expect(describeApiError(429, { error: "rate_limited" })).toContain("Espera unos minutos");
  });

  it("un teléfono bloqueado recibe un mensaje neutro", () => {
    const message = describeApiError(422, {
      error: "order_not_accepted",
      reason: "order_not_accepted",
    });
    expect(message).not.toMatch(/bloquead|fraude|sospech/i);
    expect(message).toContain("llama");
  });

  it("un captcha fallido pide recargar", () => {
    expect(describeApiError(422, { error: "captcha_failed", reason: "captcha_failed" })).toContain(
      "Recarga la página",
    );
  });
});

describe("restaurante que no acepta pedidos", () => {
  it("la API responde restaurant_unavailable y el cliente ve un texto claro", () => {
    const message = describeApiError(422, {
      error: "restaurant_unavailable",
      reason: "restaurant_unavailable",
    });
    expect(message).toBe("Este local no acepta pedidos online ahora mismo.");
  });

  it("solo un false explícito bloquea (las respuestas antiguas no traen el dato)", () => {
    expect(acceptsOnlineOrders({ acepta_pedidos: false })).toBe(false);
    expect(acceptsOnlineOrders({ acepta_pedidos: true })).toBe(true);
    expect(acceptsOnlineOrders({})).toBe(true);
  });
});

describe("seguimiento", () => {
  it("en reparto muestra «en camino» y en recogida «listo»", () => {
    expect(trackingSteps("delivery")).toContain("en_camino");
    expect(trackingSteps("retiro")).toContain("listo");
    expect(trackingSteps("retiro")).not.toContain("en_camino");
  });
});

describe("tarifa de una zona", () => {
  const base = { envio: 2, por_km: null, envio_maximo: null, gratis_desde: null, minimo: 0 };
  it("fija, por km, gratis desde y mínimo", () => {
    expect(describeZoneFee({ ...base, tipo_tarifa: "fija" })).toMatch(/^envío 2,00\s€$/u);
    expect(
      describeZoneFee({ ...base, tipo_tarifa: "por_km", envio: 1.5, por_km: 0.5, envio_maximo: 4 }),
    ).toMatch(/^envío 1,50\s€ \+ 0,50\s€\/km \(máx\. 4,00\s€\)$/u);
    expect(describeZoneFee({ ...base, tipo_tarifa: "fija", gratis_desde: 30, minimo: 25 })).toMatch(
      /gratis desde 30,00\s€ · mínimo 25,00\s€$/u,
    );
  });
});

describe("privacidad en el checkout", () => {
  it("no deja pedir sin aceptar la política", () => {
    expect(privacyProblem(false)).toBe(PRIVACY_REQUIRED_MESSAGE);
    expect(privacyProblem(true)).toBeNull();
  });

  it("enlaza a la política propia o, si no hay, a la página genérica del local", () => {
    expect(privacyHref("la-isla", "https://laisla.example/privacidad")).toBe(
      "https://laisla.example/privacidad",
    );
    expect(privacyHref("la-isla", null)).toBe("/la-isla/privacidad");
    expect(privacyHref("la-isla", "  ")).toBe("/la-isla/privacidad");
  });

  it("envía las dos casillas por separado", () => {
    expect(consentFields(true, false)).toEqual({
      privacidad_aceptada: true,
      acepta_promociones: false,
    });
    expect(consentFields(true, true).acepta_promociones).toBe(true);
  });

  it("traduce el rechazo de la API a un mensaje claro", () => {
    expect(describeApiError(422, { error: "privacy_required" })).toMatch(/política de privacidad/);
  });
});
