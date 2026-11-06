import { PLATFORM_ROLE, TRIAL_STATE, trialEndOnApproval } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import { applyPlan, planExists } from "../repositories/platform";
import {
  loadPlatformConfig,
  loadTrials,
  PLATFORM_CONFIG_KEY,
  TRIAL_PLAN,
} from "../repositories/trial";

/**
 * Pruebas gratuitas y configuración del alta, dentro del panel interno (ADR 0009). Se registran
 * en las rutas de `/plataforma`: «soporte» lee y «admin» escribe. Toda escritura se audita con
 * actor «plataforma».
 */

type Ctx = Context<AppEnv>;

const MAX_DAYS = 3650;
const MAX_ORDERS = 1_000_000;

const trialActionSchema = z.object({
  accion: z.enum(["aprobar", "rechazar", "ampliar"]),
  /** Solo `ampliar`: días que se suman al fin de la prueba. */
  dias: z.number().int().min(1).max(MAX_DAYS).optional(),
  /** Solo `ampliar`: pedidos que se suman al máximo de la prueba. */
  pedidos: z.number().int().min(1).max(MAX_ORDERS).optional(),
});

const convertSchema = z.object({ plan: z.string().trim().min(1).max(40) });

/** Cada clave conocida con su validación; cualquier otra es un 400. */
const configSchema = z
  .object({
    [PLATFORM_CONFIG_KEY.SignupActive]: z.boolean(),
    [PLATFORM_CONFIG_KEY.RequiresApproval]: z.boolean(),
    [PLATFORM_CONFIG_KEY.TrialDays]: z.number().int().min(1).max(MAX_DAYS).nullable(),
    [PLATFORM_CONFIG_KEY.TrialMaxOrders]: z.number().int().min(1).max(MAX_ORDERS).nullable(),
    [PLATFORM_CONFIG_KEY.ContactEmail]: z.string().trim().toLowerCase().email().max(255).nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const invalid = (c: Ctx, field?: string) =>
  fail(c, 400, API_ERROR.InvalidBody, field ? { field } : {});

const unprocessable = (c: Ctx, reason: string, extra: Record<string, unknown> = {}) =>
  fail(c, 422, API_ERROR.Unprocessable, { reason, ...extra });

async function body<T extends z.ZodType>(c: Ctx, schema: T) {
  return schema.safeParse(await c.req.json().catch(() => null));
}

export function registerPlatformTrialRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  const record = (
    c: Ctx,
    restauranteId: number | null,
    accion: string,
    recursoTipo: string,
    recursoId: string | number | null,
    detalle: Record<string, unknown> = {},
  ) =>
    audit(sql, {
      restauranteId,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  const trialId = (c: Ctx): number | null => {
    const id = Number(c.req.param("restauranteId"));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  const present = (trial: Awaited<ReturnType<typeof loadTrials>>[number]) => ({
    restaurante_id: trial.restauranteId,
    nombre: trial.nombre,
    slug: trial.slug,
    plan: trial.plan,
    email: trial.email,
    estado: trial.estado,
    inicio: trial.inicio.toISOString(),
    fin: trial.fin?.toISOString() ?? null,
    max_pedidos: trial.maxPedidos,
    pedidos_usados: trial.pedidosUsados,
    dias_restantes: trial.diasRestantes,
    pedidos_restantes: trial.pedidosRestantes,
    acepta_pedidos: trial.aceptaPedidos,
  });

  // ---------------------------------------------------------------------------------- pruebas

  app.get("/pruebas", reader, async (c) => {
    const trials = await loadTrials(sql, deps.now());
    const planes = await sql<{ code: string; nombre: string }[]>`
      SELECT code, nombre FROM public.plan WHERE code <> ${TRIAL_PLAN} ORDER BY code
    `;
    return c.json({ pruebas: trials.map(present), planes });
  });

  app.put("/pruebas/:restauranteId", writer, async (c) => {
    const id = trialId(c);
    if (id === null) return fail(c, 404, API_ERROR.NotFound);
    const parsed = await body(c, trialActionSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const { accion, dias, pedidos } = parsed.data;
    if (accion === "ampliar" && dias === undefined && pedidos === undefined) {
      return invalid(c, "dias");
    }
    if (accion !== "ampliar" && (dias !== undefined || pedidos !== undefined)) {
      return invalid(c, "accion");
    }
    const now = deps.now();

    const result = await sql.begin(async (tx) => {
      const [trial] = await tx<
        {
          estado: string;
          inicio: Date;
          fin: Date | null;
          max_pedidos: number | null;
        }[]
      >`
        SELECT estado, inicio, fin, max_pedidos FROM public.restaurante_prueba
        WHERE  restaurante_id = ${id} FOR UPDATE
      `;
      if (!trial) return { kind: "not_found" as const };

      if (accion === "aprobar") {
        // Se aprueba una prueba pendiente (o se reconsidera una rechazada). Empieza al aprobarla
        // y dura lo que se le concedió al crearla.
        if (trial.estado !== TRIAL_STATE.Pending && trial.estado !== TRIAL_STATE.Rejected) {
          return { kind: "invalid_state" as const, estado: trial.estado };
        }
        const end = trialEndOnApproval(trial.inicio, trial.fin, now);
        await tx`
          UPDATE public.restaurante_prueba
          SET    estado = ${TRIAL_STATE.Active}, inicio = ${now}::timestamptz,
                 fin = ${end}::timestamptz, updated_at = ${now}::timestamptz
          WHERE  restaurante_id = ${id}
        `;
        return { kind: "ok" as const, antes: trial.estado, fin: end, max: trial.max_pedidos };
      }

      if (accion === "rechazar") {
        if (trial.estado !== TRIAL_STATE.Pending && trial.estado !== TRIAL_STATE.Active) {
          return { kind: "invalid_state" as const, estado: trial.estado };
        }
        await tx`
          UPDATE public.restaurante_prueba
          SET    estado = ${TRIAL_STATE.Rejected}, updated_at = ${now}::timestamptz
          WHERE  restaurante_id = ${id}
        `;
        return { kind: "ok" as const, antes: trial.estado, fin: trial.fin, max: trial.max_pedidos };
      }

      // ampliar
      if (trial.estado !== TRIAL_STATE.Active) {
        return { kind: "invalid_state" as const, estado: trial.estado };
      }
      if (dias !== undefined && trial.fin === null) return { kind: "no_day_limit" as const };
      if (pedidos !== undefined && trial.max_pedidos === null) {
        return { kind: "no_order_limit" as const };
      }
      // Los días se suman al fin vigente o, si ya venció, a hoy.
      const end =
        dias !== undefined && trial.fin !== null
          ? new Date(Math.max(trial.fin.getTime(), now.getTime()) + dias * 86_400_000)
          : trial.fin;
      const max =
        pedidos !== undefined && trial.max_pedidos !== null
          ? trial.max_pedidos + pedidos
          : trial.max_pedidos;
      await tx`
        UPDATE public.restaurante_prueba
        SET    fin = ${end}::timestamptz, max_pedidos = ${max}, updated_at = ${now}::timestamptz
        WHERE  restaurante_id = ${id}
      `;
      return { kind: "ok" as const, antes: trial.estado, fin: end, max };
    });

    if (result.kind === "not_found") return fail(c, 404, API_ERROR.NotFound);
    if (result.kind === "invalid_state") {
      return fail(c, 409, API_ERROR.Conflict, { reason: "invalid_state", estado: result.estado });
    }
    if (result.kind === "no_day_limit" || result.kind === "no_order_limit") {
      return unprocessable(c, result.kind);
    }
    await record(c, id, `plataforma.prueba.${accion}`, "prueba", id, {
      estado_anterior: result.antes,
      fin: result.fin?.toISOString() ?? null,
      max_pedidos: result.max,
      ...(dias !== undefined ? { dias } : {}),
      ...(pedidos !== undefined ? { pedidos } : {}),
    });
    const [trial] = await loadTrials(sql, deps.now(), id);
    return c.json({ prueba: trial ? present(trial) : null });
  });

  app.post("/pruebas/:restauranteId/convertir", writer, async (c) => {
    const id = trialId(c);
    if (id === null) return fail(c, 404, API_ERROR.NotFound);
    const parsed = await body(c, convertSchema);
    if (!parsed.success) return invalid(c, "plan");
    const plan = parsed.data.plan;
    // Se convierte a un plan de pago que exista; «prueba» no lo es.
    if (plan === TRIAL_PLAN || !(await planExists(sql, plan))) {
      return unprocessable(c, "unknown_plan", { field: "plan" });
    }
    const now = deps.now();
    const result = await sql.begin(async (tx) => {
      const [trial] = await tx<{ estado: string }[]>`
        SELECT estado FROM public.restaurante_prueba WHERE restaurante_id = ${id} FOR UPDATE
      `;
      if (!trial) return { kind: "not_found" as const };
      if (trial.estado === TRIAL_STATE.Converted) return { kind: "already" as const };
      const [before] = await tx<{ plan_code: string }[]>`
        SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${id}
      `;
      // Mismos módulos de origen «plan» que en el cambio de plan del panel interno.
      const sync = await applyPlan(tx, id, plan, now);
      await tx`
        UPDATE public.restaurante_prueba
        SET    estado = ${TRIAL_STATE.Converted}, updated_at = ${now}::timestamptz
        WHERE  restaurante_id = ${id}
      `;
      return {
        kind: "ok" as const,
        antes: trial.estado,
        planAnterior: before?.plan_code ?? null,
        sync,
      };
    });
    if (result.kind === "not_found") return fail(c, 404, API_ERROR.NotFound);
    if (result.kind === "already") {
      return fail(c, 409, API_ERROR.Conflict, {
        reason: "invalid_state",
        estado: TRIAL_STATE.Converted,
      });
    }
    await record(c, id, "plataforma.prueba.convertir", "prueba", id, {
      estado_anterior: result.antes,
      plan_anterior: result.planAnterior,
      plan: plan,
      modulos_anadidos: result.sync.added,
      modulos_quitados: result.sync.removed,
    });
    return c.json({
      estado: TRIAL_STATE.Converted,
      plan,
      modulos_anadidos: result.sync.added,
      modulos_quitados: result.sync.removed,
    });
  });

  // ------------------------------------------------------------------------------ configuración

  const presentConfig = async () => {
    const rows = await sql<{ clave: string; valor: unknown; descripcion: string }[]>`
      SELECT clave, valor, descripcion FROM public.plataforma_config ORDER BY clave
    `;
    const known = new Set<string>(Object.values(PLATFORM_CONFIG_KEY));
    const config: Record<string, unknown> = {};
    const descripciones: Record<string, string> = {};
    for (const row of rows) {
      if (!known.has(row.clave)) continue;
      config[row.clave] = row.valor ?? null;
      descripciones[row.clave] = row.descripcion;
    }
    return { config, descripciones };
  };

  app.get("/config", reader, async (c) => c.json(await presentConfig()));

  app.put("/config", writer, async (c) => {
    const parsed = await body(c, configSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
    const now = deps.now();
    const before = await loadPlatformConfig(sql);
    await sql.begin(async (tx) => {
      for (const [key, value] of entries) {
        await tx`
          UPDATE public.plataforma_config
          SET    valor = ${value === null ? null : tx.json(value as string | number | boolean)},
                 updated_at = ${now}::timestamptz, updated_by = ${c.get("platform").userId}::uuid
          WHERE  clave = ${key}
        `;
      }
    });
    await record(c, null, "plataforma.config.cambiar", "plataforma_config", null, {
      cambios: Object.fromEntries(entries),
      antes: before,
    });
    return c.json(await presentConfig());
  });
}
