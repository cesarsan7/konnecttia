import { MODULE_KIND } from "@konnecttia/access";
import type { TransactionSql } from "postgres";
import type { Sql } from "../lib/db";

type Tx = TransactionSql<{ bigint: number }>;

/** `restaurante_modulo.estado`. */
export const MODULE_STATE = {
  Active: "activo",
  Suspended: "suspendido",
  Cancelled: "cancelado",
} as const;
export type ModuleState = (typeof MODULE_STATE)[keyof typeof MODULE_STATE];

/** `restaurante_modulo.origen`. */
export const MODULE_ORIGIN = {
  Plan: "plan",
  Addon: "complemento",
  Courtesy: "cortesia",
} as const;
export type ModuleOrigin = (typeof MODULE_ORIGIN)[keyof typeof MODULE_ORIGIN];

/** Origen que Konnecttia puede dar a mano (el de plan lo pone la asignación del plan). */
export const MANUAL_ORIGINS = [MODULE_ORIGIN.Addon, MODULE_ORIGIN.Courtesy] as const;

export async function planExists(sql: Sql | Tx, planCode: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM public.plan WHERE code = ${planCode}`;
  return rows.length > 0;
}

/**
 * Asigna un plan a un restaurante y sincroniza sus módulos:
 * - Los de origen `plan` que el plan nuevo ya no incluye se quitan.
 * - Los que el plan nuevo incluye y faltan se añaden con origen `plan`.
 * - Los de origen `complemento` o `cortesia` no se tocan, ni tampoco el estado (suspendido,
 *   cancelado) de los que ya existen.
 */
export async function applyPlan(
  tx: Tx,
  restauranteId: number,
  planCode: string,
  now: Date,
): Promise<{ added: string[]; removed: string[] }> {
  await tx`
    INSERT INTO public.restaurante_plan (restaurante_id, plan_code, desde)
    VALUES (${restauranteId}, ${planCode}, ${now})
    ON CONFLICT (restaurante_id)
    DO UPDATE SET plan_code = EXCLUDED.plan_code, desde = EXCLUDED.desde
  `;
  const removed = await tx<{ modulo_code: string }[]>`
    DELETE FROM public.restaurante_modulo rm
    WHERE  rm.restaurante_id = ${restauranteId} AND rm.origen = ${MODULE_ORIGIN.Plan}
      AND  rm.modulo_code NOT IN (SELECT modulo_code FROM public.plan_modulo WHERE plan_code = ${planCode})
    RETURNING rm.modulo_code
  `;
  const added = await tx<{ modulo_code: string }[]>`
    INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen, activado_at, updated_at)
    SELECT ${restauranteId}::int4, pm.modulo_code, ${MODULE_ORIGIN.Plan}::text,
           ${now}::timestamptz, ${now}::timestamptz
    FROM   public.plan_modulo pm
    WHERE  pm.plan_code = ${planCode}
    ON CONFLICT (restaurante_id, modulo_code) DO NOTHING
    RETURNING modulo_code
  `;
  return {
    added: added.map((row) => row.modulo_code).sort(),
    removed: removed.map((row) => row.modulo_code).sort(),
  };
}

export type ModuleChange =
  | { readonly estado: typeof MODULE_STATE.Active; readonly origen?: ModuleOrigin | undefined }
  | { readonly estado: typeof MODULE_STATE.Suspended | typeof MODULE_STATE.Cancelled };

export type ModuleChangeResult =
  | { readonly ok: true; readonly estado: ModuleState; readonly origen: ModuleOrigin }
  | {
      readonly ok: false;
      readonly status: 404 | 409 | 422;
      readonly reason:
        | "module_not_found"
        | "module_not_manageable"
        | "module_not_active"
        | "module_in_plan"
        | "origin_required"
        | "dependency_missing"
        | "has_dependents";
      readonly modules?: string[];
    };

/**
 * Activa, suspende o cancela un módulo de un restaurante respetando `modulo.depende_de`:
 * - Solo se gestionan módulos de plan o complemento (los básicos siempre están; los futuros no).
 * - Activar exige que sus dependencias estén activas (los básicos cuentan siempre como activos).
 * - Suspender o cancelar se rechaza mientras otro módulo activo dependa de él.
 */
export async function changeModule(
  tx: Tx,
  restauranteId: number,
  code: string,
  change: ModuleChange,
  now: Date,
): Promise<ModuleChangeResult> {
  const [definition] = await tx<{ tipo: string; depende_de: string[] }[]>`
    SELECT tipo, depende_de FROM public.modulo WHERE code = ${code}
  `;
  if (!definition) return { ok: false, status: 404, reason: "module_not_found" };
  if (definition.tipo === MODULE_KIND.Core || definition.tipo === MODULE_KIND.Future) {
    return { ok: false, status: 422, reason: "module_not_manageable" };
  }

  const [current] = await tx<{ estado: ModuleState; origen: ModuleOrigin }[]>`
    SELECT estado, origen FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restauranteId} AND modulo_code = ${code}
    FOR UPDATE
  `;

  if (change.estado === MODULE_STATE.Active) {
    if (
      current?.origen === MODULE_ORIGIN.Plan &&
      change.origen &&
      change.origen !== current.origen
    ) {
      return { ok: false, status: 422, reason: "module_in_plan" };
    }
    const origin = current ? (change.origen ?? current.origen) : change.origen;
    if (!origin) return { ok: false, status: 422, reason: "origin_required" };

    const missing = await tx<{ code: string }[]>`
      SELECT d.code
      FROM   unnest(${definition.depende_de}::text[]) AS d(code)
      JOIN   public.modulo m ON m.code = d.code
      WHERE  m.tipo <> ${MODULE_KIND.Core}
        AND  NOT EXISTS (
               SELECT 1 FROM public.restaurante_modulo rm
               WHERE  rm.restaurante_id = ${restauranteId} AND rm.modulo_code = d.code
                 AND  rm.estado = ${MODULE_STATE.Active})
      ORDER  BY d.code
    `;
    if (missing.length > 0) {
      return {
        ok: false,
        status: 422,
        reason: "dependency_missing",
        modules: missing.map((row) => row.code),
      };
    }
    await tx`
      INSERT INTO public.restaurante_modulo
        (restaurante_id, modulo_code, estado, origen, activado_at, updated_at)
      VALUES (${restauranteId}, ${code}, ${MODULE_STATE.Active}, ${origin}, ${now}, ${now})
      ON CONFLICT (restaurante_id, modulo_code)
      DO UPDATE SET estado = EXCLUDED.estado, origen = EXCLUDED.origen,
                    activado_at = CASE WHEN public.restaurante_modulo.estado = ${MODULE_STATE.Active}
                                       THEN public.restaurante_modulo.activado_at
                                       ELSE EXCLUDED.activado_at END,
                    updated_at = EXCLUDED.updated_at
    `;
    return { ok: true, estado: MODULE_STATE.Active, origen: origin };
  }

  if (!current) return { ok: false, status: 404, reason: "module_not_active" };
  const dependents = await tx<{ modulo_code: string }[]>`
    SELECT rm.modulo_code
    FROM   public.restaurante_modulo rm
    JOIN   public.modulo m ON m.code = rm.modulo_code
    WHERE  rm.restaurante_id = ${restauranteId} AND rm.estado = ${MODULE_STATE.Active}
      AND  ${code} = ANY (m.depende_de)
    ORDER  BY rm.modulo_code
  `;
  if (dependents.length > 0) {
    return {
      ok: false,
      status: 409,
      reason: "has_dependents",
      modules: dependents.map((row) => row.modulo_code),
    };
  }
  await tx`
    UPDATE public.restaurante_modulo SET estado = ${change.estado}, updated_at = ${now}
    WHERE  restaurante_id = ${restauranteId} AND modulo_code = ${code}
  `;
  return { ok: true, estado: change.estado, origen: current.origen };
}
