import { describe, expect, it } from "vitest";
import { NOT_DECLARED } from "./allergens";
import { DELIVERY_FEE_KIND, deliveryFee } from "./delivery";
import { catalogFrom } from "./menu";
import { cents } from "./money";
import { priceOrder } from "./pricing";

describe("envío", () => {
  it("tarifa fija: no depende de la distancia", () => {
    const rule = {
      kind: DELIVERY_FEE_KIND.Flat,
      baseCents: cents(200),
      perKmCents: null,
      maxCents: null,
    };
    expect(deliveryFee(rule, null)).toEqual({ ok: true, feeCents: 200 });
  });

  it("por km: base + km redondeados a la décima hacia arriba, con tope", () => {
    const rule = {
      kind: DELIVERY_FEE_KIND.PerKm,
      baseCents: cents(150),
      perKmCents: cents(50),
      maxCents: cents(400),
    };
    // 2,31 km → 2,4 km × 0,50 € = 1,20 € + 1,50 € = 2,70 €
    expect(deliveryFee(rule, 2.31)).toEqual({ ok: true, feeCents: 270 });
    // 9 km → 1,50 + 4,50 = 6,00 €, tope 4,00 €
    expect(deliveryFee(rule, 9)).toEqual({ ok: true, feeCents: 400 });
    expect(deliveryFee(rule, null)).toEqual({ ok: false, reason: "DISTANCE_REQUIRED" });
  });

  it("envío gratis a partir de un importe", () => {
    const catalog = catalogFrom([
      {
        id: 1,
        name: "Menú",
        active: true,
        allergens: NOT_DECLARED,
        variants: [{ id: 10, name: "Único", priceCents: cents(1500), active: true }],
        modifierGroups: [],
      },
    ]);
    const delivery = { feeCents: cents(200), minOrderCents: cents(0), freeFromCents: cents(3000) };
    const one = priceOrder(catalog, [{ itemId: 1, variantId: 10, quantity: 1, modifiers: [] }], {
      fulfillment: "delivery",
      delivery,
    });
    const two = priceOrder(catalog, [{ itemId: 1, variantId: 10, quantity: 2, modifiers: [] }], {
      fulfillment: "delivery",
      delivery,
    });
    expect(one.ok && one.quote.deliveryFeeCents).toBe(200);
    expect(two.ok && two.quote.deliveryFeeCents).toBe(0);
  });
});
