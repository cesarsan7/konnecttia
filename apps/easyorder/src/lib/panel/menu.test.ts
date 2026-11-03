import { describe, expect, it } from "vitest";
import {
  type AdminVariant,
  allergenSummary,
  draftsFrom,
  moveId,
  parsePrice,
  planVariants,
  priceInput,
  priceLabel,
  validateVariants,
} from "./menu";

const variant = (overrides: Partial<AdminVariant>): AdminVariant => ({
  id: 1,
  nombre: "Normal",
  precio_centimos: 900,
  predeterminada: true,
  activa: true,
  orden: 1,
  ...overrides,
});

describe("precios", () => {
  it("lee precios con coma o punto y los pasa a céntimos", () => {
    expect(parsePrice("12,5")).toBe(1250);
    expect(parsePrice("9.05")).toBe(905);
    expect(parsePrice(" 3 € ")).toBe(300);
    expect(parsePrice("0")).toBe(0);
  });

  it("rechaza negativos, texto y más de dos decimales", () => {
    for (const text of ["-1", "abc", "1,234", "", "1,2,3"]) {
      expect(parsePrice(text)).toBeNull();
    }
  });

  it("muestra el precio para editar y el de la lista", () => {
    expect(priceInput(1250)).toBe("12,50");
    expect(priceLabel([variant({})])).toMatch(/9,00/);
    expect(priceLabel([variant({}), variant({ id: 2, precio_centimos: 1400 })])).toMatch(
      /^desde 9,00/,
    );
    expect(priceLabel([variant({ activa: false })])).toBe("Sin precio");
  });
});

describe("alérgenos", () => {
  it("distingue «no informados» de «sin alérgenos»", () => {
    expect(allergenSummary(null)).toBe("Alérgenos no informados");
    expect(allergenSummary([])).toBe("Sin alérgenos declarados");
    expect(allergenSummary(["gluten", "frutos_de_cascara"])).toBe("Gluten, Frutos de cáscara");
  });
});

describe("orden", () => {
  it("mueve un elemento sin salirse de la lista", () => {
    expect(moveId([1, 2, 3], 3, -1)).toEqual([1, 3, 2]);
    expect(moveId([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
  });
});

describe("variantes en edición", () => {
  const original = [
    variant({}),
    variant({ id: 2, nombre: "Grande", precio_centimos: 1400, predeterminada: false, orden: 2 }),
  ];

  const pair = () => {
    const [first, second] = draftsFrom(original);
    if (!first || !second) throw new Error("faltan variantes");
    return [first, second] as const;
  };

  it("valida nombres repetidos, vacíos y precios", () => {
    const drafts = pair();
    expect(validateVariants(drafts)).toEqual([]);
    expect(validateVariants([])).toHaveLength(1);
    const bad = validateVariants([
      { ...drafts[0], nombre: "grande" },
      { ...drafts[1], precio: "x" },
    ]);
    expect(bad.map((error) => error.key)).toEqual(["v2", "v2"]);
  });

  it("sin cambios no genera llamadas", () => {
    expect(planVariants(original, draftsFrom(original))).toEqual({
      create: [],
      update: [],
      remove: [],
      order: null,
    });
  });

  it("detecta altas, bajas, cambios y nuevo orden", () => {
    const [small, big] = pair();
    const plan = planVariants(original, [
      { ...big, precio: "15", predeterminada: true },
      {
        key: "n1",
        id: null,
        nombre: " Familiar ",
        precio: "20",
        predeterminada: false,
        activa: true,
      },
    ]);
    expect(plan.remove).toEqual([1]);
    expect(plan.update).toEqual([
      { id: 2, changes: { precio_centimos: 1500, predeterminada: true } },
    ]);
    expect(plan.create).toEqual([
      { nombre: "Familiar", precio_centimos: 2000, predeterminada: false, activa: true },
    ]);
    expect(plan.order).toBeNull();
    expect(planVariants(original, [big, small]).order).toEqual([2, 1]);
  });
});
