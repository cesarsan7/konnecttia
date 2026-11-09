import { describe, expect, it } from "vitest";
import { parseReturnTarget, passwordUpdateMessage, resetDestination } from "./recovery";

describe("destino tras restablecer la contraseña", () => {
  it("solo acepta destinos conocidos", () => {
    expect(parseReturnTarget("interno")).toBe("interno");
    expect(parseReturnTarget("alta")).toBe("alta");
    expect(parseReturnTarget("https://otro.sitio")).toBeNull();
    expect(parseReturnTarget("constructor")).toBeNull();
    expect(parseReturnTarget(null)).toBeNull();
  });

  it("usa el destino recordado; si no, decide por la cuenta", () => {
    expect(resetDestination({ remembered: "interno", restaurants: 3, platformMember: false })).toBe(
      "/interno",
    );
    expect(resetDestination({ remembered: null, restaurants: 0, platformMember: true })).toBe(
      "/interno",
    );
    expect(resetDestination({ remembered: null, restaurants: 2, platformMember: true })).toBe(
      "/panel",
    );
    expect(resetDestination({ remembered: null, restaurants: null, platformMember: false })).toBe(
      "/panel",
    );
  });
});

describe("mensaje al guardar la contraseña nueva", () => {
  it("explica que la contraseña debe ser distinta de la anterior", () => {
    expect(passwordUpdateMessage("same_password")).toBe(
      "La nueva contraseña debe ser distinta de la anterior.",
    );
  });

  it("avisa de una contraseña demasiado fácil de adivinar", () => {
    expect(passwordUpdateMessage("weak_password")).toContain("demasiado fácil");
  });

  it("usa el mensaje genérico para otros errores o sin código", () => {
    const generic = "No se pudo guardar la contraseña. Pide un enlace nuevo.";
    expect(passwordUpdateMessage("otro_error")).toBe(generic);
    expect(passwordUpdateMessage(undefined)).toBe(generic);
  });
});
