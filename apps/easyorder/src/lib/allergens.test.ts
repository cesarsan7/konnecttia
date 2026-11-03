import { describe, expect, it } from "vitest";
import { allergenNames, lineAllergens } from "./allergens";
import type { MenuItem } from "./types";

const item = (overrides: Partial<MenuItem>): MenuItem => ({
  id: 1,
  name: "Arepa",
  description: null,
  imageUrl: null,
  variants: [{ id: 1, name: "Normal", price: 5, isDefault: true }],
  extras: [
    { id: 10, name: "Queso", price: 1, allergens: { status: "declared", allergens: ["lacteos"] } },
    { id: 11, name: "Salsa", price: 0.5 },
  ],
  allergens: { status: "declared", allergens: ["gluten"] },
  ...overrides,
});

describe("alérgenos de la línea", () => {
  it("une los del producto y los de los extras elegidos", () => {
    const info = lineAllergens(item({}), [10]);
    expect(allergenNames(info)).toEqual(["Gluten", "Lácteos"]);
  });

  it("un extra sin informar deja el conjunto como «no informados»", () => {
    expect(lineAllergens(item({}), [11]).status).toBe("not_declared");
  });

  it("un producto sin informar nunca aparece como «sin alérgenos»", () => {
    const info = lineAllergens(item({ allergens: { status: "not_declared" } }), []);
    expect(info.status).toBe("not_declared");
    expect(allergenNames(info)).toEqual([]);
  });

  it("declarado y vacío sí es «sin alérgenos»", () => {
    const info = lineAllergens(item({ allergens: { status: "declared", allergens: [] } }), []);
    expect(info).toEqual({ status: "declared", allergens: [] });
  });
});
