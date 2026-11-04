import { describe, expect, it } from "vitest";
import type { Menu, MenuItem } from "../types";
import { rebuildLines } from "./reorder";

const item = (
  id: number,
  name: string,
  variants: [number, string, number][],
  extras: [number, string, number][] = [],
): MenuItem => ({
  id,
  name,
  description: null,
  imageUrl: null,
  variants: variants.map(([vid, vname, price], index) => ({
    id: vid,
    name: vname,
    price,
    isDefault: index === 0,
  })),
  extras: extras.map(([eid, ename, price]) => ({ id: eid, name: ename, price })),
  allergens: { status: "unknown" },
});

const menu: Menu = {
  restaurante: {
    nombre: "R",
    slug: "r",
    recogida: true,
    reparto: true,
    metodos_pago: ["efectivo"],
  },
  local: null,
  abierto: true,
  categories: [
    {
      id: 1,
      name: "Pizzas",
      items: [
        item(
          10,
          "Margarita",
          [
            [100, "Mediana", 9],
            [101, "Familiar", 14],
          ],
          [[500, "Queso extra", 1.5]],
        ),
        item(11, "Agua", [[110, "Única", 1.5]]),
      ],
    },
  ],
};

describe("repetir un pedido anterior", () => {
  it("rehace las líneas por id con los precios de hoy, extras y notas", () => {
    const { lines, missing } = rebuildLines(menu, [
      {
        menu_item_id: 10,
        menu_variant_id: 101,
        item_name: "Margarita",
        quantity: 2,
        unit_price: 12,
        extras: [{ extra_id: 500, name: "Queso extra", quantity: 2 }],
        nota: "bien hecha",
      },
      { menu_item_id: 11, menu_variant_id: 110, item_name: "Agua", quantity: 1 },
    ]);
    expect(missing).toEqual([]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      itemId: 10,
      variantId: 101,
      quantity: 2,
      unitCents: 1400,
      note: "bien hecha",
      extras: [{ id: 500, cents: 150 }],
    });
  });

  it("encuentra por nombre los pedidos sin ids (WhatsApp) y avisa de lo que ya no está", () => {
    const { lines, missing } = rebuildLines(menu, [
      { nombre: "margarita", variant_name: "Mediana", cantidad: 3 },
      { nombre: "Agua" },
      { item_name: "Calzone", quantity: 1 },
      { menu_item_id: 10, menu_variant_id: 100, extras: [{ extra_id: 999, name: "Piña" }] },
    ]);
    expect(lines.map((line) => [line.itemId, line.variantId, line.quantity])).toEqual([
      [10, 100, 4],
      [11, 110, 1],
    ]);
    expect(missing).toEqual(["Calzone", "extras de Margarita"]);
  });

  it("no falla con datos que no son una lista", () => {
    expect(rebuildLines(menu, null)).toEqual({ lines: [], missing: [] });
  });
});
