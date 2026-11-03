import { describe, expect, it } from "vitest";
import {
  addLine,
  buildLine,
  itemCount,
  lineCents,
  parseStoredCart,
  setQuantity,
  subtotalCents,
  toOrderItems,
} from "./cart";
import type { MenuItem } from "./types";

const pizza: MenuItem = {
  id: 10,
  name: "Margarita",
  description: null,
  imageUrl: null,
  variants: [
    { id: 100, name: "Mediana", price: 9.5, isDefault: true },
    { id: 101, name: "Familiar", price: 14, isDefault: false },
  ],
  extras: [
    { id: 200, name: "Queso", price: 1.2 },
    { id: 201, name: "Aceitunas", price: 0.8 },
  ],
  allergens: { status: "not_declared" },
};

describe("carrito", () => {
  it("calcula el importe de una línea con extras sin errores de decimales", () => {
    const line = buildLine(pizza, 100, [201, 200], 3, "");
    // (9,50 + 1,20 + 0,80) × 3 = 34,50
    expect(lineCents(line)).toBe(3450);
    expect(line.key).toBe("10|100|200.201|");
  });

  it("junta líneas iguales y separa las que tienen otra nota", () => {
    let lines = addLine([], buildLine(pizza, 100, [], 1, ""));
    lines = addLine(lines, buildLine(pizza, 100, [], 2, ""));
    lines = addLine(lines, buildLine(pizza, 100, [], 1, "sin orégano"));
    expect(lines).toHaveLength(2);
    expect(itemCount(lines)).toBe(4);
    expect(subtotalCents(lines)).toBe(3800);
  });

  it("cambiar la cantidad a 0 elimina la línea y nunca supera el máximo", () => {
    const line = buildLine(pizza, 101, [], 1, "");
    expect(setQuantity([line], line.key, 0)).toEqual([]);
    expect(setQuantity([line], line.key, 99)[0]?.quantity).toBe(20);
  });

  it("no acepta variantes ni extras de otro producto", () => {
    expect(() => buildLine(pizza, 999, [], 1, "")).toThrow();
    expect(() => buildLine(pizza, 100, [999], 1, "")).toThrow();
  });

  it("envía a la API solo ids y cantidades, nunca precios", () => {
    const items = toOrderItems([buildLine(pizza, 100, [200], 2, "bien hecha")]);
    expect(items).toEqual([
      {
        menu_item_id: 10,
        menu_variant_id: 100,
        quantity: 2,
        extras: [{ extra_id: 200, quantity: 1 }],
        nota: "bien hecha",
      },
    ]);
    expect(JSON.stringify(items)).not.toContain("price");
  });

  it("descarta un carrito guardado con forma inesperada", () => {
    expect(parseStoredCart("no es json")).toEqual([]);
    expect(parseStoredCart('[{"key":1}]')).toEqual([]);
    const ok = JSON.stringify([buildLine(pizza, 100, [], 1, "")]);
    expect(parseStoredCart(ok)).toHaveLength(1);
  });
});
