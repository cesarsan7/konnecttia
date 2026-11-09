import { describe, expect, it } from "vitest";
import {
  brandReport,
  contrastRatio,
  effectiveBrandColor,
  LEGACY_BRAND_COLOR,
  normalizeHex,
  readableInk,
} from "./brand";

describe("normalizeHex", () => {
  it("acepta #rgb, #rrggbb y sin almohadilla", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("E8553A")).toBe("#e8553a");
    expect(normalizeHex(" #e8553a ")).toBe("#e8553a");
  });

  it("rechaza lo que no es un color", () => {
    for (const bad of ["", "red", "#12", "#12345", "#gggggg", "javascript:1", "#e8553a;x"]) {
      expect(normalizeHex(bad)).toBeNull();
    }
    expect(normalizeHex(null)).toBeNull();
  });
});

describe("contraste", () => {
  it("blanco sobre negro es 21 y un color sobre sí mismo es 1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("elige blanco sobre oscuros y negro sobre claros", () => {
    expect(readableInk("#0e2a33")).toBe("#ffffff");
    expect(readableInk("#ffe600")).toBe("#000000");
  });

  it("el texto siempre se lee: el mejor de los dos pasa de 4,5 con cualquier color", () => {
    for (const color of ["#808080", "#777777", "#767676", "#00a0a0", "#ff7f00", "#e8553a"]) {
      expect(brandReport(color)?.inkContrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("avisa de un color demasiado pálido para bordes sobre blanco", () => {
    expect(brandReport("#ffe600")?.warnings).toEqual(["low_edge_contrast"]);
    expect(brandReport("#0e2a33")?.warnings).toEqual([]);
    expect(brandReport("no es color")).toBeNull();
  });
});

describe("effectiveBrandColor", () => {
  it("ignora vacío, inválido y el valor por defecto antiguo", () => {
    expect(effectiveBrandColor(null)).toBeNull();
    expect(effectiveBrandColor("rojo")).toBeNull();
    expect(effectiveBrandColor(LEGACY_BRAND_COLOR)).toBeNull();
    expect(effectiveBrandColor("#E63946")).toBeNull();
    expect(effectiveBrandColor("#0A7")).toBe("#00aa77");
  });
});
