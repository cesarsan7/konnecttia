import { describe, expect, it } from "vitest";
import { centsFromDecimal, formatEuros, InvalidAmountError } from "./money";

describe("money", () => {
  it("convierte importes decimales sin errores de coma flotante", () => {
    expect(centsFromDecimal("4.80")).toBe(480);
    expect(centsFromDecimal("4,8")).toBe(480);
    expect(centsFromDecimal("12")).toBe(1200);
    expect(centsFromDecimal(0.1 + 0.2)).toBe(30);
  });

  it("rechaza importes negativos o mal formados", () => {
    expect(() => centsFromDecimal("-1")).toThrow(InvalidAmountError);
    expect(() => centsFromDecimal("4.805")).toThrow(InvalidAmountError);
    expect(() => centsFromDecimal("abc")).toThrow(InvalidAmountError);
  });

  it("formatea en euros con configuración regional de España", () => {
    expect(formatEuros(centsFromDecimal("12.5")).replace(/\s/g, " ")).toBe("12,50 €");
  });
});
