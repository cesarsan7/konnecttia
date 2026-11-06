import { describe, expect, it } from "vitest";
import { parseReturnTarget, resetDestination } from "./recovery";

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
