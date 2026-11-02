import { describe, expect, it } from "vitest";
import { type DeliveryZone, distanceKm, findDeliveryZone } from "./delivery";
import { centsFromDecimal } from "./money";

// Centro aproximado de Arrecife (Lanzarote).
const arrecife = { lat: 28.963, lng: -13.5477 };

const zone = (id: number, radiusKm: number, active = true): DeliveryZone => ({
  id,
  name: `Zona ${id}`,
  center: arrecife,
  radiusKm,
  feeCents: centsFromDecimal(String(id)),
  minOrderCents: centsFromDecimal("10"),
  etaMinutes: { min: 30, max: 45 },
  active,
});

describe("delivery zones", () => {
  it("mide distancias en kilómetros", () => {
    expect(distanceKm(arrecife, arrecife)).toBe(0);
    // Arrecife → Playa Honda, unos 4–5 km
    const playaHonda = { lat: 28.9545, lng: -13.5946 };
    expect(distanceKm(arrecife, playaHonda)).toBeGreaterThan(4);
    expect(distanceKm(arrecife, playaHonda)).toBeLessThan(5.5);
  });

  it("elige la zona activa más pequeña que cubre el punto", () => {
    const zones = [zone(3, 10), zone(1, 2), zone(2, 5, false)];
    expect(findDeliveryZone(zones, { lat: 28.964, lng: -13.548 })?.id).toBe(1);
    expect(findDeliveryZone(zones, { lat: 28.99, lng: -13.548 })?.id).toBe(3);
  });

  it("devuelve null fuera de cobertura", () => {
    expect(findDeliveryZone([zone(1, 2)], { lat: 29.2, lng: -13.5 })).toBeNull();
  });
});
