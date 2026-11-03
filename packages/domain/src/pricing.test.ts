import { describe, expect, it } from "vitest";
import { ALLERGEN_STATUS, declareAllergens, NOT_DECLARED } from "./allergens";
import { FULFILLMENT } from "./delivery";
import { catalogFrom, type MenuItem } from "./menu";
import { cents, centsFromDecimal } from "./money";
import { deliveryChargeFor, PRICING_ERROR, priceOrder, SURCHARGE_KIND } from "./pricing";

// Cartas de ejemplo basadas en los menús públicos de los pilotos (Siempre Juntos y La Ripia).
const salchimaduro: MenuItem = {
  id: 1,
  name: "Salchimaduro",
  active: true,
  allergens: declareAllergens(["lacteos"]),
  variants: [
    { id: 11, name: "Pequeño", priceCents: centsFromDecimal("9.00"), active: true },
    { id: 12, name: "Grande", priceCents: centsFromDecimal("14.00"), active: true },
  ],
  modifierGroups: [
    {
      id: 100,
      name: "Extras",
      minSelect: 0,
      maxSelect: null,
      options: [
        {
          id: 101,
          name: "Queso",
          priceDeltaCents: centsFromDecimal("2.50"),
          active: true,
          maxQuantity: 3,
          allergens: declareAllergens(["lacteos"]),
        },
        {
          id: 102,
          name: "Chicharrón",
          priceDeltaCents: centsFromDecimal("3.50"),
          active: false,
          allergens: NOT_DECLARED,
        },
      ],
    },
  ],
};

const matahambre: MenuItem = {
  id: 2,
  name: "El Matahambre",
  active: true,
  allergens: declareAllergens(["gluten"]),
  variants: [{ id: 21, name: "Única", priceCents: centsFromDecimal("8.00"), active: true }],
  modifierGroups: [
    {
      id: 200,
      name: "Elige la salchicha",
      minSelect: 1,
      maxSelect: 1,
      options: [
        {
          id: 201,
          name: "Salchicha",
          priceDeltaCents: cents(0),
          active: true,
          allergens: declareAllergens([]),
        },
        {
          id: 202,
          name: "Chorizo",
          priceDeltaCents: centsFromDecimal("1.00"),
          active: true,
          allergens: declareAllergens(["sulfitos"]),
        },
      ],
    },
  ],
};

const bao: MenuItem = {
  id: 3,
  name: "Bao de costilla",
  active: true,
  allergens: NOT_DECLARED,
  variants: [{ id: 31, name: "4 piezas", priceCents: centsFromDecimal("7.50"), active: true }],
  modifierGroups: [],
};

const catalog = catalogFrom([salchimaduro, matahambre, bao]);
const pickup = { fulfillment: FULFILLMENT.Pickup } as const;

describe("priceOrder", () => {
  it("calcula con precios de la carta e ignora cualquier precio del navegador", () => {
    const tamperedLine = {
      itemId: 1,
      variantId: 12,
      quantity: 2,
      modifiers: [{ optionId: 101, quantity: 1 }],
      unitPrice: 0.01,
    };
    const result = priceOrder(catalog, [tamperedLine], pickup);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // (14,00 + 2,50) × 2 = 33,00 €
    expect(result.quote.lines[0]?.unitPriceCents).toBe(1650);
    expect(result.quote.totalCents).toBe(3300);
  });

  it("suma el suplemento de una opción obligatoria («+1 € si es de chorizo»)", () => {
    const result = priceOrder(
      catalog,
      [{ itemId: 2, variantId: 21, quantity: 1, modifiers: [{ optionId: 202, quantity: 1 }] }],
      pickup,
    );
    expect(result.ok && result.quote.totalCents).toBe(900);
  });

  it("exige elegir en un grupo obligatorio", () => {
    const result = priceOrder(catalog, [{ itemId: 2, variantId: 21, quantity: 1 }], pickup);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain(PRICING_ERROR.GroupMinNotMet);
  });

  it("rechaza más opciones de las permitidas en un grupo", () => {
    const result = priceOrder(
      catalog,
      [
        {
          itemId: 2,
          variantId: 21,
          quantity: 1,
          modifiers: [
            { optionId: 201, quantity: 1 },
            { optionId: 202, quantity: 1 },
          ],
        },
      ],
      pickup,
    );
    expect(!result.ok && result.errors[0]?.code).toBe(PRICING_ERROR.GroupMaxExceeded);
  });

  it("rechaza opciones de otro producto y opciones agotadas", () => {
    const result = priceOrder(
      catalog,
      [
        { itemId: 1, variantId: 11, quantity: 1, modifiers: [{ optionId: 202, quantity: 1 }] },
        { itemId: 1, variantId: 11, quantity: 1, modifiers: [{ optionId: 102, quantity: 1 }] },
      ],
      pickup,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(PRICING_ERROR.OptionNotInItem);
    expect(codes).toContain(PRICING_ERROR.OptionUnavailable);
  });

  it("rechaza cantidades no válidas", () => {
    for (const quantity of [0, -1, 1.5, 100]) {
      const result = priceOrder(catalog, [{ itemId: 3, variantId: 31, quantity }], pickup);
      expect(!result.ok && result.errors[0]?.code).toBe(PRICING_ERROR.InvalidQuantity);
    }
  });

  it("aplica envases +1 € cuando el pedido no llega a 25 € (regla de La Ripia)", () => {
    const envases = {
      kind: SURCHARGE_KIND.BelowSubtotal,
      label: "Envases",
      thresholdCents: centsFromDecimal("25"),
      amountCents: centsFromDecimal("1"),
    };
    const small = priceOrder(catalog, [{ itemId: 3, variantId: 31, quantity: 2 }], {
      ...pickup,
      surcharges: [envases],
    });
    expect(small.ok && small.quote.totalCents).toBe(1600);

    const large = priceOrder(catalog, [{ itemId: 3, variantId: 31, quantity: 4 }], {
      ...pickup,
      surcharges: [envases],
    });
    expect(large.ok && large.quote.surcharges).toEqual([]);
  });

  it("en reparto suma el envío y bloquea si no se alcanza el mínimo, sin cambiar a recogida", () => {
    const delivery = {
      fulfillment: FULFILLMENT.Delivery,
      delivery: { feeCents: centsFromDecimal("2.50"), minOrderCents: centsFromDecimal("15") },
    } as const;
    const below = priceOrder(catalog, [{ itemId: 1, variantId: 11, quantity: 1 }], delivery);
    expect(below.ok).toBe(false);
    if (!below.ok) {
      expect(below.errors[0]).toEqual({
        code: PRICING_ERROR.DeliveryMinimumNotMet,
        detail: "600",
      });
    }

    const enough = priceOrder(catalog, [{ itemId: 1, variantId: 12, quantity: 2 }], delivery);
    expect(enough.ok && enough.quote.totalCents).toBe(3050);
  });

  it("exige zona resuelta para reparto", () => {
    const result = priceOrder(catalog, [{ itemId: 3, variantId: 31, quantity: 1 }], {
      fulfillment: FULFILLMENT.Delivery,
    });
    expect(!result.ok && result.errors[0]?.code).toBe(PRICING_ERROR.DeliveryZoneRequired);
  });

  it("propaga alérgenos y nunca convierte «no informado» en «sin alérgenos»", () => {
    const declared = priceOrder(
      catalog,
      [{ itemId: 2, variantId: 21, quantity: 1, modifiers: [{ optionId: 202, quantity: 1 }] }],
      pickup,
    );
    expect(declared.ok && declared.quote.lines[0]?.allergens).toEqual({
      status: ALLERGEN_STATUS.Declared,
      allergens: ["gluten", "sulfitos"],
    });

    const unknown = priceOrder(catalog, [{ itemId: 3, variantId: 31, quantity: 1 }], pickup);
    expect(unknown.ok && unknown.quote.lines[0]?.allergens.status).toBe(
      ALLERGEN_STATUS.NotDeclared,
    );
  });

  it("rechaza pedidos vacíos y productos inexistentes", () => {
    expect(priceOrder(catalog, [], pickup)).toEqual({
      ok: false,
      errors: [{ code: PRICING_ERROR.EmptyOrder }],
    });
    const missing = priceOrder(catalog, [{ itemId: 999, variantId: 1, quantity: 1 }], pickup);
    expect(!missing.ok && missing.errors[0]?.code).toBe(PRICING_ERROR.ItemNotFound);
  });
});

describe("condiciones de reparto para un subtotal", () => {
  const terms = { feeCents: cents(200), minOrderCents: cents(2500), freeFromCents: cents(4000) };

  it("indica cuánto falta para el mínimo", () => {
    expect(deliveryChargeFor(cents(2000), terms)).toEqual({
      feeCents: 200,
      meetsMinimum: false,
      missingCents: 500,
    });
  });

  it("aplica el envío gratis a partir del importe configurado", () => {
    expect(deliveryChargeFor(cents(4000), terms)).toEqual({
      feeCents: 0,
      meetsMinimum: true,
      missingCents: 0,
    });
  });
});
