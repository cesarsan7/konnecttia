import { MODULE } from "@konnecttia/access";
import {
  type Branch,
  type DaySchedule,
  distanceKm,
  type GeoPoint,
  type Holiday,
  isOpenAt,
  type OpenOverride,
  type ZoneCoverage,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { loadSchedule, type Restaurant } from "./restaurants";

/** Local con los datos necesarios para decidir si atiende ahora. */
export type BranchRecord = Branch & {
  readonly slug: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly forcedOpen: OpenOverride;
};

type BranchRow = {
  id: number;
  nombre: string;
  slug: string;
  direccion: string | null;
  telefono: string | null;
  lat: string | null;
  lng: string | null;
  es_principal: boolean;
  activo: boolean;
  acepta_recogida: boolean;
  acepta_reparto: boolean;
  forzar_abierto: boolean | null;
};

async function multiLocationEnabled(sql: Sql, restauranteId: number): Promise<boolean> {
  const rows = await sql<{ ok: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM public.restaurante_modulo
      WHERE  restaurante_id = ${restauranteId}
        AND  modulo_code    = ${MODULE.MultiLocation}
        AND  estado         = 'activo'
    ) AS ok
  `;
  return rows[0]?.ok ?? false;
}

/**
 * Locales del restaurante. Sin el módulo «varios locales» solo existe la principal: los demás
 * quedan guardados pero no reciben pedidos ni aparecen en la web.
 */
export async function loadBranches(sql: Sql, restauranteId: number): Promise<BranchRecord[]> {
  const [rows, multi] = await Promise.all([
    sql<BranchRow[]>`
      SELECT id, nombre, slug, direccion, telefono, lat, lng, es_principal, activo,
             acepta_recogida, acepta_reparto, forzar_abierto
      FROM   public.sucursal
      WHERE  restaurante_id = ${restauranteId}
      ORDER  BY es_principal DESC, nombre
    `,
    multiLocationEnabled(sql, restauranteId),
  ]);
  return rows
    .filter((row) => multi || row.es_principal)
    .map((row) => ({
      id: row.id,
      name: row.nombre,
      slug: row.slug,
      address: row.direccion,
      phone: row.telefono,
      location:
        row.lat !== null && row.lng !== null
          ? { lat: Number(row.lat), lng: Number(row.lng) }
          : null,
      isPrincipal: row.es_principal,
      active: row.activo,
      acceptsPickup: row.acepta_recogida,
      acceptsDelivery: row.acepta_reparto,
      forcedOpen: row.forzar_abierto,
    }));
}

/** Horario propio de cada local; los locales sin filas usan el horario del restaurante. */
async function loadBranchSchedules(
  sql: Sql,
  branchIds: readonly number[],
): Promise<Map<number, DaySchedule[]>> {
  if (branchIds.length === 0) return new Map();
  const rows = await sql<(DaySchedule & { sucursal_id: number })[]>`
    SELECT sucursal_id, dia, disponible,
           to_char(apertura_1, 'HH24:MI') AS apertura_1,
           to_char(cierre_1,   'HH24:MI') AS cierre_1,
           to_char(apertura_2, 'HH24:MI') AS apertura_2,
           to_char(cierre_2,   'HH24:MI') AS cierre_2
    FROM   public.sucursal_horario
    WHERE  sucursal_id IN ${sql(branchIds)}
  `;
  const byBranch = new Map<number, DaySchedule[]>();
  for (const { sucursal_id, ...day } of rows) {
    byBranch.set(sucursal_id, [...(byBranch.get(sucursal_id) ?? []), day]);
  }
  return byBranch;
}

/**
 * Devuelve una función que dice si un local está abierto en `now`. El cierre manual del local
 * manda; si no, el del restaurante; si no, el horario (propio o general).
 */
export async function openChecker(
  sql: Sql,
  restaurant: Restaurant,
  branches: readonly BranchRecord[],
  restaurantOverride: OpenOverride,
  now: Date,
): Promise<(branch: Branch) => boolean> {
  const [general, own, holidays] = await Promise.all([
    loadSchedule(sql, restaurant.id),
    loadBranchSchedules(
      sql,
      branches.map((branch) => branch.id),
    ),
    loadHolidays(sql, restaurant.id, now),
  ]);
  const forced = new Map(branches.map((branch) => [branch.id, branch.forcedOpen]));
  return (branch) =>
    isOpenAt(
      own.get(branch.id) ?? general,
      restaurant.zonaHoraria,
      now,
      forced.get(branch.id) ?? restaurantOverride,
      holidaysFor(holidays, branch.id),
    );
}

type HolidayRow = { fecha: string; cerrado: boolean; sucursal_id: number | null };

/** Festivos alrededor de `now` (basta ±2 días para cubrir cualquier zona horaria). */
async function loadHolidays(sql: Sql, restauranteId: number, now: Date): Promise<HolidayRow[]> {
  return sql<HolidayRow[]>`
    SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha, cerrado, sucursal_id
    FROM   public.festivo
    WHERE  restaurante_id = ${restauranteId}
      AND  fecha BETWEEN ${now.toISOString()}::date - 2 AND ${now.toISOString()}::date + 2
  `;
}

/** Festivos de un local: los del restaurante, salvo que el local tenga uno propio esa fecha. */
function holidaysFor(rows: readonly HolidayRow[], branchId: number): Holiday[] {
  const byDate = new Map<string, Holiday>();
  for (const row of rows) {
    if (row.sucursal_id === null && !byDate.has(row.fecha)) {
      byDate.set(row.fecha, { date: row.fecha, closed: row.cerrado });
    }
  }
  for (const row of rows) {
    if (row.sucursal_id === branchId) {
      byDate.set(row.fecha, { date: row.fecha, closed: row.cerrado });
    }
  }
  return [...byDate.values()];
}

/** Productos que un local no ofrece ahora mismo (agotados o no servidos allí). */
export async function unavailableItems(sql: Sql, branchId: number): Promise<Set<number>> {
  const rows = await sql<{ menu_item_id: number }[]>`
    SELECT menu_item_id FROM public.sucursal_item_no_disponible WHERE sucursal_id = ${branchId}
  `;
  return new Set(rows.map((row) => row.menu_item_id));
}

type ZoneRow = {
  delivery_zone_id: number;
  sucursal_id: number;
  postal_code: string | null;
  lat_center: string | null;
  lng_center: string | null;
  radius_km: string | null;
};

/**
 * Zonas activas que cubren al cliente: por coordenadas (centro + radio) o, si se indica, por
 * código postal. Cada zona pertenece a un local.
 */
export async function coveringZones(
  sql: Sql,
  restauranteId: number,
  customer: { readonly point: GeoPoint | null; readonly postalCode: string | null },
): Promise<ZoneCoverage[]> {
  const rows = await sql<ZoneRow[]>`
    SELECT delivery_zone_id, sucursal_id, postal_code, lat_center, lng_center, radius_km
    FROM   public.delivery_zone
    WHERE  restaurante_id = ${restauranteId} AND is_active = true
  `;
  return rows.flatMap((zone): ZoneCoverage[] => {
    const radiusKm = zone.radius_km === null ? null : Number(zone.radius_km);
    if (customer.point && zone.lat_center !== null && zone.lng_center !== null && radiusKm) {
      const distance = distanceKm(customer.point, {
        lat: Number(zone.lat_center),
        lng: Number(zone.lng_center),
      });
      if (distance <= radiusKm) {
        return [
          {
            zoneId: zone.delivery_zone_id,
            branchId: zone.sucursal_id,
            distanceToCenterKm: distance,
            radiusKm,
          },
        ];
      }
    }
    if (customer.postalCode && zone.postal_code === customer.postalCode) {
      return [
        {
          zoneId: zone.delivery_zone_id,
          branchId: zone.sucursal_id,
          distanceToCenterKm: null,
          radiusKm,
        },
      ];
    }
    return [];
  });
}

/** Local al que pertenece una zona concreta (cuando el cliente elige la zona en la web). */
export async function zoneBranch(
  sql: Sql,
  restauranteId: number,
  zoneId: number,
): Promise<number | null> {
  const rows = await sql<{ sucursal_id: number }[]>`
    SELECT sucursal_id FROM public.delivery_zone
    WHERE  delivery_zone_id = ${zoneId} AND restaurante_id = ${restauranteId} AND is_active = true
  `;
  return rows[0]?.sucursal_id ?? null;
}
