import type { Id } from "./menu";
import type { Cents } from "./money";

export const FULFILLMENT = {
  Pickup: "retiro",
  Delivery: "delivery",
} as const;

export type Fulfillment = (typeof FULFILLMENT)[keyof typeof FULFILLMENT];

export type GeoPoint = { readonly lat: number; readonly lng: number };

export type DeliveryZone = {
  readonly id: Id;
  readonly name: string;
  readonly center: GeoPoint;
  readonly radiusKm: number;
  readonly feeCents: Cents;
  readonly minOrderCents: Cents;
  readonly etaMinutes: { readonly min: number; readonly max: number };
  readonly active: boolean;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Devuelve la zona activa más pequeña que contiene el punto, o `null` si ninguna lo cubre.
 * Con zonas concéntricas, gana la más cercana al local (menor radio).
 */
export function findDeliveryZone(
  zones: readonly DeliveryZone[],
  point: GeoPoint,
): DeliveryZone | null {
  const covering = zones
    .filter((zone) => zone.active && distanceKm(zone.center, point) <= zone.radiusKm)
    .sort((a, b) => a.radiusKm - b.radiusKm);
  return covering[0] ?? null;
}
