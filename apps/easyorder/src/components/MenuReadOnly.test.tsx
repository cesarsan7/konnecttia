import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Menu } from "../lib/types";
import { MenuReadOnly } from "./MenuReadOnly";

const menu: Menu = {
  restaurante: {
    nombre: "Local Prueba",
    slug: "prueba",
    recogida: true,
    reparto: true,
    metodos_pago: ["efectivo"],
    privacidad_url: null,
  },
  local: null,
  abierto: true,
  categories: [
    {
      id: 1,
      name: "Hamburguesas",
      items: [
        {
          id: 10,
          name: "Gourmet BBQ",
          description: "Con salsa BBQ",
          imageUrl: null,
          variants: [{ id: 100, name: "Normal", price: 12.5, isDefault: true }],
          extras: [{ id: 5, name: "Queso", price: 1.5 }],
          allergens: { status: "declared", allergens: ["gluten"] },
        },
      ],
    },
  ],
};

describe("carta de solo lectura", () => {
  const html = renderToStaticMarkup(<MenuReadOnly menu={menu} />);

  it("muestra productos, precios, extras y alérgenos", () => {
    expect(html).toContain("Gourmet BBQ");
    expect(html).toContain("Queso");
    expect(html).toContain("Alérgenos: ");
  });

  it("no ofrece pedir: sin botones ni carrito", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("cart-bar");
  });
});
