import type { Id } from "./menu";
import { type Cents, cents } from "./money";

export const FULFILLMENT = {
  Pickup: "retiro",
  Delivery: "delivery",
  /** Consumo en el local (servicio de mesa). Solo desde el panel; la web pública no lo ofrece. */
  DineIn: "mesa",
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

/** Cómo se calcula el envío de una zona. */
export const DELIVERY_FEE_KIND = {
  /** Importe fijo. */
  Flat: "fija",
  /** Importe base más un importe por km desde el local, con tope opcional. */
  PerKm: "por_km",
} as const;

export type DeliveryFeeKind = (typeof DELIVERY_FEE_KIND)[keyof typeof DELIVERY_FEE_KIND];

export type DeliveryFeeRule = {
  readonly kind: DeliveryFeeKind;
  readonly baseCents: Cents;
  readonly perKmCents: Cents | null;
  readonly maxCents: Cents | null;
};

export type DeliveryFeeResult =
  | { readonly ok: true; readonly feeCents: Cents }
  | { readonly ok: false; readonly reason: "DISTANCE_REQUIRED" | "INVALID_RULE" };

/**
 * Envío de una zona. Por km: la distancia (en línea recta desde el local) se redondea hacia
 * arriba a la décima de km; el resultado nunca supera el tope si lo hay.
 */
export function deliveryFee(rule: DeliveryFeeRule, distanceKm: number | null): DeliveryFeeResult {
  if (rule.kind === DELIVERY_FEE_KIND.Flat) {
    return { ok: true, feeCents: rule.baseCents };
  }
  if (rule.perKmCents === null) return { ok: false, reason: "INVALID_RULE" };
  if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 0) {
    return { ok: false, reason: "DISTANCE_REQUIRED" };
  }
  const tenths = Math.ceil(Number((distanceKm * 10).toFixed(6)));
  const variable = Math.round((rule.perKmCents * tenths) / 10);
  const total = rule.baseCents + variable;
  return {
    ok: true,
    feeCents: cents(rule.maxCents === null ? total : Math.min(total, rule.maxCents)),
  };
}
