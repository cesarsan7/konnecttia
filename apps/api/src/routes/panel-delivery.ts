import { ALL_BRANCHES, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { WEEKDAYS_ES } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { centsToEuros, eurosToCents, UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadBranches } from "../repositories/branches";

/**
 * Reparto y tiempos desde el panel:
 * - Zonas de reparto (delivery_zone): delivery.view / delivery.manage. Cada zona es de un local;
 *   solo la ve y la cambia quien tiene ese local.
 * - Horas punta (franja_pico): settings.view / settings.update. Una franja general (todos los
 *   locales) exige alcance sobre todos.
 * Importes en céntimos hacia el panel; en la base siguen en euros porque n8n los lee así.
 */

type Ctx = Context<AppEnv>;

export const COVERAGE = {
  Radius: "radio",
  PostalCode: "codigo_postal",
  WholeCity: "toda_la_ciudad",
} as const;
export const FEE = { Flat: "fija", PerKm: "por_km" } as const;
const SERVICE = ["recogida", "reparto", "ambos"] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CENTS = 100_000;

const cents = z.number().int().min(0).max(MAX_CENTS);
const minutes = z.number().int().min(1).max(600).nullable();

const zoneSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100),
    sucursal_id: z.number().int().positive(),
    descripcion: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .default(null)
      .transform((value) => value || null),
    activa: z.boolean().default(true),
    cobertura: z.discriminatedUnion("tipo", [
      z.object({
        tipo: z.literal(COVERAGE.Radius),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        radio_km: z.number().positive().max(100),
      }),
      z.object({
        tipo: z.literal(COVERAGE.PostalCode),
        codigo_postal: z
          .string()
          .trim()
          .regex(/^[0-9A-Za-z -]{3,10}$/),
      }),
      z.object({ tipo: z.literal(COVERAGE.WholeCity) }),
    ]),
    tarifa: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal(FEE.Flat), base_centimos: cents }),
      z.object({
        tipo: z.literal(FEE.PerKm),
        base_centimos: cents,
        por_km_centimos: cents,
        maxima_centimos: cents.nullable().default(null),
      }),
    ]),
    pedido_minimo_centimos: cents.default(0),
    envio_gratis_desde_centimos: cents.positive().nullable().default(null),
    minutos_min: minutes.default(null),
    minutos_max: minutes.default(null),
  })
  .refine(
    (zone) =>
      zone.minutos_min === null ||
      zone.minutos_max === null ||
      zone.minutos_min <= zone.minutos_max,
    { path: ["minutos_min"], message: "min_over_max" },
  )
  .refine(
    (zone) =>
      zone.tarifa.tipo !== FEE.PerKm ||
      zone.tarifa.maxima_centimos === null ||
      zone.tarifa.maxima_centimos >= zone.tarifa.base_centimos,
    { path: ["tarifa"], message: "max_below_base" },
  );

const peakSchema = z
  .object({
    /** null = todos los días. */
    dia: z.enum(WEEKDAYS_ES).nullable().default(null),
    desde: z.string().regex(TIME),
    hasta: z.string().regex(TIME),
    servicio: z.enum(SERVICE).default("ambos"),
    minutos_extra: z.number().int().min(1).max(240),
    /** null = todos los locales. */
    sucursal_id: z.number().int().positive().nullable().default(null),
    activo: z.boolean().default(true),
  })
  .refine((peak) => peak.desde !== peak.hasta, { path: ["hasta"], message: "empty_range" });

type ZoneRow = {
  id: number;
  nombre: string;
  sucursal_id: number;
  descripcion: string | null;
  activa: boolean;
  postal_code: string | null;
  lat_center: string | null;
  lng_center: string | null;
  radius_km: string | null;
  cubre_todo: boolean;
  tipo_tarifa: string;
  fee: string;
  tarifa_por_km: string | null;
  tarifa_maxima: string | null;
  min_order_amount: string | null;
  envio_gratis_desde: string | null;
  estimated_minutes_min: number | null;
  estimated_minutes_max: number | null;
};

const optionalCents = (value: string | null) => (value === null ? null : eurosToCents(value));

function zoneOut(row: ZoneRow) {
  return {
    id: row.id,
    nombre: row.nombre,
    sucursal_id: row.sucursal_id,
    descripcion: row.descripcion,
    activa: row.activa,
    cobertura: row.cubre_todo
      ? { tipo: COVERAGE.WholeCity }
      : row.postal_code !== null
        ? { tipo: COVERAGE.PostalCode, codigo_postal: row.postal_code }
        : {
            tipo: COVERAGE.Radius,
            lat: Number(row.lat_center),
            lng: Number(row.lng_center),
            radio_km: Number(row.radius_km),
          },
    tarifa:
      row.tipo_tarifa === FEE.PerKm
        ? {
            tipo: FEE.PerKm,
            base_centimos: eurosToCents(row.fee),
            por_km_centimos: eurosToCents(row.tarifa_por_km),
            maxima_centimos: optionalCents(row.tarifa_maxima),
          }
        : { tipo: FEE.Flat, base_centimos: eurosToCents(row.fee) },
    pedido_minimo_centimos: eurosToCents(row.min_order_amount),
    envio_gratis_desde_centimos: optionalCents(row.envio_gratis_desde),
    minutos_min: row.estimated_minutes_min,
    minutos_max: row.estimated_minutes_max,
  };
}

/** Columnas de delivery_zone a partir del cuerpo validado. */
function zoneColumns(zone: z.infer<typeof zoneSchema>) {
  const coverage = zone.cobertura;
  const fee = zone.tarifa;
  return {
    zone_name: zone.nombre,
    sucursal_id: zone.sucursal_id,
    description: zone.descripcion,
    is_active: zone.activa,
    cubre_todo: coverage.tipo === COVERAGE.WholeCity,
    postal_code:
      coverage.tipo === COVERAGE.PostalCode ? coverage.codigo_postal.toUpperCase() : null,
    lat_center: coverage.tipo === COVERAGE.Radius ? coverage.lat : null,
    lng_center: coverage.tipo === COVERAGE.Radius ? coverage.lng : null,
    radius_km: coverage.tipo === COVERAGE.Radius ? coverage.radio_km : null,
    tipo_tarifa: fee.tipo,
    fee: centsToEuros(fee.base_centimos),
    tarifa_por_km: fee.tipo === FEE.PerKm ? centsToEuros(fee.por_km_centimos) : null,
    tarifa_maxima:
      fee.tipo === FEE.PerKm && fee.maxima_centimos !== null
        ? centsToEuros(fee.maxima_centimos)
        : null,
    min_order_amount: centsToEuros(zone.pedido_minimo_centimos),
    envio_gratis_desde:
      zone.envio_gratis_desde_centimos === null
        ? null
        : centsToEuros(zone.envio_gratis_desde_centimos),
    estimated_minutes_min: zone.minutos_min,
    estimated_minutes_max: zone.minutos_max,
  };
}

async function parse<T extends z.ZodType>(c: Ctx, schema: T) {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success
    ? ({ ok: true, data: parsed.data } as const)
    : ({
        ok: false,
        field: parsed.error.issues[0]?.path.join("."),
        reason: parsed.error.issues[0]?.message,
      } as const);
}

function invalid(c: Ctx, field?: string, reason?: string) {
  const known = reason && /^[a-z_]+$/.test(reason) ? { reason } : {};
  return fail(c, 400, API_ERROR.InvalidBody, { ...(field ? { field } : {}), ...known });
}

export function registerDeliveryRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    recursoTipo: string,
    recursoId: number | null,
    detalle: Record<string, unknown> = {},
    resultado: "ok" | "denegado" = "ok",
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado,
      detalle,
      requestId: c.get("requestId"),
    });

  const visibleBranches = async (c: Ctx) => {
    const branches = await loadBranches(sql, c.get("restaurant").id);
    return branches.filter((branch) => canAccessBranch(c.get("access"), branch.id));
  };

  const zoneSelect = () => sql`
    SELECT delivery_zone_id AS id, zone_name AS nombre, sucursal_id, description AS descripcion,
           is_active AS activa, postal_code, lat_center, lng_center, radius_km, cubre_todo,
           tipo_tarifa, fee, tarifa_por_km, tarifa_maxima, min_order_amount, envio_gratis_desde,
           estimated_minutes_min, estimated_minutes_max
    FROM   public.delivery_zone
  `;

  // ---------------------------------------------------------------------------------- zonas

  app.get("/:slug/reparto/zonas", requirePermission(deps, PERMISSION.DeliveryView), async (c) => {
    const branches = await visibleBranches(c);
    const ids = branches.map((branch) => branch.id);
    const rows =
      ids.length === 0
        ? []
        : await sql<ZoneRow[]>`
            ${zoneSelect()}
            WHERE  restaurante_id = ${c.get("restaurant").id} AND sucursal_id IN ${sql(ids)}
            ORDER  BY sucursal_id, cubre_todo, zone_name
          `;
    return c.json({
      zonas: rows.map(zoneOut),
      locales: branches.map((branch) => ({
        id: branch.id,
        nombre: branch.name,
        lat: branch.location?.lat ?? null,
        lng: branch.location?.lng ?? null,
        reparto: branch.acceptsDelivery,
      })),
    });
  });

  const saveZone = (mode: "create" | "update") => async (c: Ctx) => {
    const parsed = await parse(c, zoneSchema);
    if (!parsed.ok) return invalid(c, parsed.field, parsed.reason);
    const zone = parsed.data;
    const restauranteId = c.get("restaurant").id;
    const branchIds = (await visibleBranches(c)).map((branch) => branch.id);
    if (!branchIds.includes(zone.sucursal_id)) return fail(c, 404, API_ERROR.BranchNotAvailable);
    const columns = zoneColumns(zone);
    const keys = Object.keys(columns) as (keyof typeof columns)[];
    try {
      if (mode === "create") {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO public.delivery_zone ${sql({ ...columns, restaurante_id: restauranteId })}
          RETURNING delivery_zone_id AS id
        `;
        await record(c, "reparto.zona.crear", "delivery_zone", row?.id ?? null, zone);
        return c.json({ id: row?.id }, 201);
      }
      const zoneId = Number(c.req.param("id"));
      if (!Number.isSafeInteger(zoneId)) return invalid(c);
      // La zona debe ser de un local del usuario (antes y después del cambio).
      const updated = await sql`
        UPDATE public.delivery_zone SET ${sql(columns, keys)}
        WHERE  delivery_zone_id = ${zoneId} AND restaurante_id = ${restauranteId}
          AND  sucursal_id IN ${sql(branchIds)}
      `;
      if (updated.count === 0) return fail(c, 404, API_ERROR.NotFound);
      await record(c, "reparto.zona.editar", "delivery_zone", zoneId, zone);
      return c.json({ id: zoneId });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_postal_code" });
      }
      throw error;
    }
  };

  app.post(
    "/:slug/reparto/zonas",
    requirePermission(deps, PERMISSION.DeliveryManage),
    saveZone("create"),
  );
  app.put(
    "/:slug/reparto/zonas/:id",
    requirePermission(deps, PERMISSION.DeliveryManage),
    saveZone("update"),
  );

  app.delete(
    "/:slug/reparto/zonas/:id",
    requirePermission(deps, PERMISSION.DeliveryManage),
    async (c) => {
      const zoneId = Number(c.req.param("id"));
      if (!Number.isSafeInteger(zoneId)) return invalid(c);
      const branchIds = (await visibleBranches(c)).map((branch) => branch.id);
      const deleted =
        branchIds.length === 0
          ? []
          : await sql<{ nombre: string }[]>`
              DELETE FROM public.delivery_zone
              WHERE  delivery_zone_id = ${zoneId} AND restaurante_id = ${c.get("restaurant").id}
                AND  sucursal_id IN ${sql(branchIds)}
              RETURNING zone_name AS nombre
            `;
      if (deleted.length === 0) return fail(c, 404, API_ERROR.NotFound);
      await record(c, "reparto.zona.borrar", "delivery_zone", zoneId, {
        nombre: deleted[0]?.nombre,
      });
      return c.json({ id: zoneId });
    },
  );

  // ----------------------------------------------------------------------------- horas punta

  app.get("/:slug/ajustes/franjas", requirePermission(deps, PERMISSION.SettingsView), async (c) => {
    const branchIds = (await visibleBranches(c)).map((branch) => branch.id);
    const rows = await sql<
      {
        id: number;
        dia: string | null;
        desde: string;
        hasta: string;
        servicio: string;
        minutos_extra: number;
        sucursal_id: number | null;
        activo: boolean;
      }[]
    >`
      SELECT id, dia, to_char(desde, 'HH24:MI') AS desde, to_char(hasta, 'HH24:MI') AS hasta,
             servicio, minutos_extra, sucursal_id, activo
      FROM   public.franja_pico
      WHERE  restaurante_id = ${c.get("restaurant").id}
      ORDER  BY desde, id
    `;
    return c.json({
      franjas: rows.filter(
        (row) => row.sucursal_id === null || branchIds.includes(row.sucursal_id),
      ),
    });
  });

  /** Una franja general exige alcance sobre todos los locales; la de un local, ese local. */
  const checkPeakScope = async (c: Ctx, branchId: number | null) => {
    if (branchId === null) {
      if (c.get("access").branchScope === ALL_BRANCHES) return null;
      await record(
        c,
        "ajustes.franja",
        "franja_pico",
        null,
        { motivo: "branch_scope_limited" },
        "denegado",
      );
      return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_scope_limited" });
    }
    const branchIds = (await visibleBranches(c)).map((branch) => branch.id);
    return branchIds.includes(branchId) ? null : fail(c, 404, API_ERROR.BranchNotAvailable);
  };

  app.post(
    "/:slug/ajustes/franjas",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const parsed = await parse(c, peakSchema);
      if (!parsed.ok) return invalid(c, parsed.field, parsed.reason);
      const peak = parsed.data;
      const denied = await checkPeakScope(c, peak.sucursal_id);
      if (denied) return denied;
      const [row] = await sql<{ id: number }[]>`
      INSERT INTO public.franja_pico
        (restaurante_id, sucursal_id, dia, desde, hasta, servicio, minutos_extra, activo)
      VALUES (${c.get("restaurant").id}, ${peak.sucursal_id}, ${peak.dia}, ${peak.desde}::time,
              ${peak.hasta}::time, ${peak.servicio}, ${peak.minutos_extra}, ${peak.activo})
      RETURNING id
    `;
      await record(c, "ajustes.franja.crear", "franja_pico", row?.id ?? null, peak);
      return c.json({ id: row?.id }, 201);
    },
  );

  const findPeak = async (c: Ctx) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id)) return null;
    const [row] = await sql<{ id: number; sucursal_id: number | null }[]>`
      SELECT id, sucursal_id FROM public.franja_pico
      WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
    `;
    return row ?? null;
  };

  app.put(
    "/:slug/ajustes/franjas/:id",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const current = await findPeak(c);
      if (!current) return fail(c, 404, API_ERROR.NotFound);
      const parsed = await parse(c, peakSchema);
      if (!parsed.ok) return invalid(c, parsed.field, parsed.reason);
      const peak = parsed.data;
      for (const branchId of new Set([current.sucursal_id, peak.sucursal_id])) {
        const denied = await checkPeakScope(c, branchId);
        if (denied) return denied;
      }
      await sql`
      UPDATE public.franja_pico
      SET    sucursal_id = ${peak.sucursal_id}, dia = ${peak.dia}, desde = ${peak.desde}::time,
             hasta = ${peak.hasta}::time, servicio = ${peak.servicio},
             minutos_extra = ${peak.minutos_extra}, activo = ${peak.activo}
      WHERE  id = ${current.id} AND restaurante_id = ${c.get("restaurant").id}
    `;
      await record(c, "ajustes.franja.editar", "franja_pico", current.id, peak);
      return c.json({ id: current.id });
    },
  );

  app.delete(
    "/:slug/ajustes/franjas/:id",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const current = await findPeak(c);
      if (!current) return fail(c, 404, API_ERROR.NotFound);
      const denied = await checkPeakScope(c, current.sucursal_id);
      if (denied) return denied;
      await sql`
        DELETE FROM public.franja_pico
        WHERE  id = ${current.id} AND restaurante_id = ${c.get("restaurant").id}
      `;
      await record(c, "ajustes.franja.borrar", "franja_pico", current.id);
      return c.json({ id: current.id });
    },
  );
}
