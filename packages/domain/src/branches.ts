import { distanceKm, FULFILLMENT, type Fulfillment, type GeoPoint } from "./delivery";
import type { Id } from "./menu";

/** Local físico de un restaurante (tabla `sucursal`). */
export type Branch = {
  readonly id: Id;
  readonly name: string;
  readonly location: GeoPoint | null;
  readonly isPrincipal: boolean;
  readonly active: boolean;
  readonly acceptsPickup: boolean;
  readonly acceptsDelivery: boolean;
};

export type BranchCandidate<B extends Branch = Branch> = {
  readonly branch: B;
  readonly distanceKm: number | null;
};

export function branchServes(branch: Branch, fulfillment: Fulfillment): boolean {
  if (!branch.active) return false;
  return fulfillment === FULFILLMENT.Delivery ? branch.acceptsDelivery : branch.acceptsPickup;
}

/**
 * Locales que pueden atender el pedido, del más cercano al más lejano. Sin punto del cliente,
 * la principal va primero. Los locales sin coordenadas van al final.
 */
export function rankBranches<B extends Branch>(
  branches: readonly B[],
  fulfillment: Fulfillment,
  options: { readonly from?: GeoPoint | null; readonly isOpen?: (branch: Branch) => boolean } = {},
): BranchCandidate<B>[] {
  const { from = null, isOpen = () => true } = options;
  return branches
    .filter((branch) => branchServes(branch, fulfillment) && isOpen(branch))
    .map((branch) => ({
      branch,
      distanceKm: from && branch.location ? distanceKm(from, branch.location) : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
      if (a.distanceKm !== null) return -1;
      if (b.distanceKm !== null) return 1;
      return Number(b.branch.isPrincipal) - Number(a.branch.isPrincipal);
    });
}

export type ZoneCoverage = {
  readonly zoneId: Id;
  readonly branchId: Id;
  /** Distancia del cliente al centro de la zona; `null` si la zona va por código postal. */
  readonly distanceToCenterKm: number | null;
  readonly radiusKm: number | null;
};

/**
 * Elige desde qué local se reparte: entre las zonas que cubren al cliente y cuyo local está
 * abierto y acepta reparto, gana el local más cercano al cliente; a igualdad, la zona menor.
 */
export function chooseDeliveryZone<B extends Branch>(
  covering: readonly ZoneCoverage[],
  branches: readonly B[],
  customer: GeoPoint | null,
  isOpen: (branch: Branch) => boolean = () => true,
): { readonly zoneId: Id; readonly branch: B } | null {
  const byId = new Map(branches.map((branch) => [branch.id, branch]));
  const candidates = covering.flatMap((zone) => {
    const branch = byId.get(zone.branchId);
    if (!branch || !branchServes(branch, FULFILLMENT.Delivery) || !isOpen(branch)) return [];
    const branchDistance =
      customer && branch.location
        ? distanceKm(customer, branch.location)
        : Number.POSITIVE_INFINITY;
    return [{ zone, branch, branchDistance }];
  });
  candidates.sort(
    (a, b) =>
      a.branchDistance - b.branchDistance ||
      (a.zone.radiusKm ?? Number.POSITIVE_INFINITY) - (b.zone.radiusKm ?? Number.POSITIVE_INFINITY),
  );
  const best = candidates[0];
  return best ? { zoneId: best.zone.zoneId, branch: best.branch } : null;
}
