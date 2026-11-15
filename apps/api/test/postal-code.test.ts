import { describe, expect, it } from "vitest";
import { findPostalCode } from "../src/lib/postal-code";

describe("findPostalCode", () => {
  it("toma el código postal de la dirección escrita", () => {
    expect(findPostalCode("C. la Rosa, 33, 35500 Arrecife, Las Palmas, Spain")).toBe("35500");
    expect(findPostalCode("Calle Mayor 12, 28013 Madrid")).toBe("28013");
  });
  it("prefiere 5 cifras a un portal largo y no confunde números cortos", () => {
    expect(findPostalCode("Avenida 1234, 35500 Arrecife")).toBe("35500");
    expect(findPostalCode("Calle Luna 7, 2º B, Arrecife")).toBeNull();
  });
  it("sin código postal devuelve null", () => {
    expect(findPostalCode("Calle la Rosa 33")).toBeNull();
  });
});
