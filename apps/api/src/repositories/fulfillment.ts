import {
  type Branch,
  branchServes,
  type Cents,
  chooseDeliveryZone,
  deliveryFee,
  distanceKm,
  ETA_SERVICE,
  type EtaService,
  FULFILLMENT,
  type Fulfillment,
  type GeoPoint,
  rankBranches,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { API_ERROR, type ApiError } from "../lib/http";
import { type BranchRecord, coveringZones, zoneBranch } from "./branches";
import { type EtaBase, findDeliveryZone, pickupEta } from "./restaurants";

export type FulfillmentRequest = {
  readonly fulfillment: Fulfillment;
  /** Local elegido para recoger. */
  readonly branchId?: number;
  /** Zona elegida en la web. */
  readonly zoneId?: number;
  readonly point: GeoPoint | null;
  /** Código postal y nombre de zona detectados en el texto (WhatsApp). */
  readonly postalCode?: string | null;
  readonly zoneName?: string | null;
  /** Texto libre con el local donde recoge («el de Carlos V», «Siempre Juntos 1»). */
  readonly branchHint?: string | null;
};

export type DeliveryResolution = {
  readonly zoneId: number;
  readonly zoneName: string;
  readonly feeCents: Cents;
  readonly minOrderCents: Cents;
  readonly freeFromCents: Cents | null;
  readonly distanceKm: number | null;
};

export type FulfillmentResolution =
  | {
      readonly ok: true;
      readonly branch: BranchRecord;
      readonly delivery: DeliveryResolution | null;
      readonly etaBase: EtaBase | null;
      readonly etaService: EtaService;
      readonly postalCode: string | null;
    }
  | { readonly ok: false; readonly error: ApiError; readonly extra?: Record<string, unknown> };

const failure = (error: ApiError, extra?: Record<string, unknown>): FulfillmentResolution => ({
  ok: false,
  error,
  ...(extra ? { extra } : {}),
});

/** Minúsculas, sin tildes ni signos: para comparar texto escrito por el cliente. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Local que menciona el cliente: su nombre completo, o la calle de su dirección. Solo si
 * coincide exactamente uno (si el texto encaja con varios, se le pregunta).
 */
export function branchFromHint<B extends { name: string; address: string | null }>(
  branches: readonly B[],
  hint: string,
): B | undefined {
  const text = ` ${normalize(hint)} `;
  if (text.trim() === "") return undefined;
  const byName = branches.filter((branch) => text.includes(` ${normalize(branch.name)} `));
  if (byName.length === 1) return byName[0];
  const byStreet = branches.filter((branch) => {
    const street = normalize((branch.address ?? "").split(",")[0] ?? "")
      .replace(/^(c|calle|av|avda|avenida|plaza|pza)\s+/, "")
      .replace(/\s+\d+.*$/, "");
    return street.length >= 4 && text.includes(` ${street} `);
  });
  return byStreet.length === 1 ? byStreet[0] : undefined;
}

async function hasRadiusZones(sql: Sql, restauranteId: number) {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM public.delivery_zone
    WHERE  restaurante_id = ${restauranteId} AND is_active = true AND radius_km IS NOT NULL
  `;
  return (rows[0]?.n ?? 0) > 0;
}

async function zoneIdByName(sql: Sql, restauranteId: number, name: string) {
  const rows = await sql<{ delivery_zone_id: number }[]>`
    SELECT delivery_zone_id FROM public.delivery_zone
    WHERE  restaurante_id = ${restauranteId} AND is_active = true
      AND  lower(zone_name) = lower(${name.trim()})
    LIMIT  1
  `;
  return rows[0]?.delivery_zone_id;
}

/**
 * Decide qué local atiende el pedido, la zona y la tarifa de reparto y la base del tiempo
 * estimado. La usan el checkout web y la cotización (agente de WhatsApp), así las dos aplican
 * las mismas reglas.
 */
export async function resolveFulfillment(
  sql: Sql,
  restauranteId: number,
  branches: readonly BranchRecord[],
  config: ReadonlyMap<string, string>,
  isOpen: (branch: Branch) => boolean,
  request: FulfillmentRequest,
): Promise<FulfillmentResolution> {
  const { point } = request;

  // Mesa: el local es el de la mesa (lo indica el panel). Debe estar abierto.
  if (request.fulfillment === FULFILLMENT.DineIn) {
    const branch = branches.find((candidate) => candidate.id === request.branchId);
    if (!branch || !branchServes(branch, FULFILLMENT.DineIn)) {
      return failure(API_ERROR.BranchNotAvailable);
    }
    if (!isOpen(branch)) return failure(API_ERROR.RestaurantClosed);
    return {
      ok: true,
      branch,
      delivery: null,
      etaBase: pickupEta(config),
      etaService: ETA_SERVICE.Pickup,
      postalCode: null,
    };
  }

  if (request.fulfillment === FULFILLMENT.Pickup) {
    let branch: BranchRecord | undefined;
    const hinted =
      request.branchId === undefined && request.branchHint
        ? branchFromHint(
            branches.filter((candidate) => branchServes(candidate, FULFILLMENT.Pickup)),
            request.branchHint,
          )
        : undefined;
    if (hinted) {
      if (!isOpen(hinted)) return failure(API_ERROR.RestaurantClosed);
      branch = hinted;
    } else if (request.branchId !== undefined) {
      branch = branches.find((candidate) => candidate.id === request.branchId);
      if (!branch || !branchServes(branch, FULFILLMENT.Pickup)) {
        return failure(API_ERROR.BranchNotAvailable);
      }
      if (!isOpen(branch)) return failure(API_ERROR.RestaurantClosed);
    } else {
      const open = rankBranches(branches, FULFILLMENT.Pickup, { from: point, isOpen });
      if (open.length === 0) return failure(API_ERROR.RestaurantClosed);
      // Con varios locales abiertos y sin ubicación, el cliente debe elegir dónde recoge.
      if (open.length > 1 && !point) {
        return failure(API_ERROR.BranchRequired, {
          locales: open.map((candidate) => ({
            id: candidate.branch.id,
            nombre: candidate.branch.name,
            direccion: candidate.branch.address,
          })),
        });
      }
      branch = open[0]?.branch;
    }
    if (!branch) return failure(API_ERROR.BranchNotAvailable);
    return {
      ok: true,
      branch,
      delivery: null,
      etaBase: pickupEta(config),
      etaService: ETA_SERVICE.Pickup,
      postalCode: null,
    };
  }

  let branch: BranchRecord | undefined;
  let zoneId = request.zoneId;
  if (zoneId === undefined && request.zoneName) {
    zoneId = await zoneIdByName(sql, restauranteId, request.zoneName);
  }
  if (zoneId !== undefined) {
    const branchId = await zoneBranch(sql, restauranteId, zoneId);
    branch = branches.find((candidate) => candidate.id === branchId);
    if (!branch) return failure(API_ERROR.DeliveryZoneNotFound);
    if (!branchServes(branch, FULFILLMENT.Delivery)) return failure(API_ERROR.DeliveryNotAvailable);
    if (!isOpen(branch)) return failure(API_ERROR.RestaurantClosed);
  } else {
    // Reparte el local abierto más cercano entre los que cubren la ubicación del cliente.
    const covering = await coveringZones(sql, restauranteId, {
      point,
      postalCode: request.postalCode ?? null,
    });
    const choice = chooseDeliveryZone(covering, branches, point, isOpen);
    if (!choice) {
      const closedOnly = chooseDeliveryZone(covering, branches, point);
      if (closedOnly) return failure(API_ERROR.RestaurantClosed);
      // Zonas por radio y sin ubicación: no se puede saber si llega; se pide la ubicación.
      if (!point && (await hasRadiusZones(sql, restauranteId))) {
        return failure(API_ERROR.LocationRequired);
      }
      return failure(API_ERROR.DeliveryZoneNotFound);
    }
    branch = choice.branch;
    zoneId = choice.zoneId;
  }
  const zone = await findDeliveryZone(sql, restauranteId, zoneId, config);
  if (!zone || !branch) return failure(API_ERROR.DeliveryZoneNotFound);
  // Distancia en línea recta del local al cliente (para tarifas por km).
  const km = point && branch.location ? distanceKm(point, branch.location) : null;
  const fee = deliveryFee(zone.fee, km);
  if (!fee.ok) return failure(API_ERROR.LocationRequired);
  return {
    ok: true,
    branch,
    delivery: {
      zoneId: zone.zoneId,
      zoneName: zone.name,
      feeCents: fee.feeCents,
      minOrderCents: zone.minOrderCents,
      freeFromCents: zone.freeFromCents,
      distanceKm: km,
    },
    etaBase: zone.eta,
    etaService: ETA_SERVICE.Delivery,
    postalCode: zone.postalCode,
  };
}
