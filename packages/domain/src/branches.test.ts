import { describe, expect, it } from "vitest";
import { type Branch, chooseDeliveryZone, rankBranches } from "./branches";
import { FULFILLMENT } from "./delivery";

// Dos locales en Arrecife (Lanzarote), a unos 2 km entre sí.
const centro: Branch = {
  id: 1,
  name: "Centro",
  location: { lat: 28.9637, lng: -13.5477 },
  isPrincipal: true,
  active: true,
  acceptsPickup: true,
  acceptsDelivery: true,
};
const playa: Branch = {
  ...centro,
  id: 2,
  name: "Playa Honda",
  location: { lat: 28.9539, lng: -13.5772 },
  isPrincipal: false,
};
const cercaDePlaya = { lat: 28.955, lng: -13.575 };

describe("rankBranches", () => {
  it("ordena por cercanía al cliente", () => {
    const ranked = rankBranches([centro, playa], FULFILLMENT.Pickup, { from: cercaDePlaya });
    expect(ranked.map((candidate) => candidate.branch.id)).toEqual([2, 1]);
    expect(ranked[0]?.distanceKm).toBeLessThan(1);
  });

  it("sin ubicación del cliente, la principal va primero", () => {
    const ranked = rankBranches([playa, centro], FULFILLMENT.Pickup);
    expect(ranked[0]?.branch.id).toBe(1);
  });

  it("descarta locales cerrados, inactivos o que no ofrecen ese servicio", () => {
    const soloReparto = { ...playa, acceptsPickup: false };
    expect(rankBranches([centro, soloReparto], FULFILLMENT.Pickup).map((c) => c.branch.id)).toEqual(
      [1],
    );
    expect(
      rankBranches([centro, playa], FULFILLMENT.Pickup, {
        isOpen: (b) => b.id !== 2,
        from: cercaDePlaya,
      }).map((c) => c.branch.id),
    ).toEqual([1]);
    expect(rankBranches([{ ...centro, active: false }], FULFILLMENT.Delivery)).toEqual([]);
  });

  it("los locales sin coordenadas van al final", () => {
    const sinCoords = { ...playa, id: 3, location: null };
    const ranked = rankBranches([sinCoords, playa], FULFILLMENT.Pickup, { from: cercaDePlaya });
    expect(ranked.map((c) => c.branch.id)).toEqual([2, 3]);
  });
});

describe("chooseDeliveryZone", () => {
  const covering = [
    { zoneId: 10, branchId: 1, distanceToCenterKm: 2, radiusKm: 5 },
    { zoneId: 20, branchId: 2, distanceToCenterKm: 0.3, radiusKm: 3 },
  ];

  it("reparte desde el local más cercano al cliente", () => {
    expect(chooseDeliveryZone(covering, [centro, playa], cercaDePlaya)).toEqual({
      zoneId: 20,
      branch: playa,
    });
  });

  it("si el local más cercano está cerrado, reparte el siguiente", () => {
    expect(
      chooseDeliveryZone(covering, [centro, playa], cercaDePlaya, (b) => b.id !== 2)?.zoneId,
    ).toBe(10);
  });

  it("sin zonas que cubran al cliente no hay reparto", () => {
    expect(chooseDeliveryZone([], [centro, playa], cercaDePlaya)).toBeNull();
  });
});
