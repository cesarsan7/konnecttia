import { describe, expect, it } from "vitest";
import { describeApiError, normalizePhone, trackingSteps } from "./checkout";

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

describe("seguimiento", () => {
  it("en reparto muestra «en camino» y en recogida «listo»", () => {
    expect(trackingSteps("delivery")).toContain("en_camino");
    expect(trackingSteps("retiro")).toContain("listo");
    expect(trackingSteps("retiro")).not.toContain("en_camino");
  });
});
