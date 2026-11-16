import { PLATFORM_ROLE } from "@konnecttia/domain";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import {
  checkChanges,
  countOverrides,
  loadParamDefs,
  loadParamViews,
  saveParamValues,
  saveTemplateValues,
} from "../repositories/agent-config";
import { STANDARD_TEMPLATE } from "../repositories/restaurants";

const bodySchema = z.object({
  valores: z.record(z.string(), z.unknown()).refine((v) => Object.keys(v).length > 0),
});

/**
 * Interno → parámetros del agente (ADR 0013): la plantilla estándar y, por restaurante, la
 * personalización (incluidos los parámetros solo internos, como el modelo y el límite diario).
 * «soporte» lee y «admin» escribe; toda escritura se audita.
 */
export function registerPlatformAgentRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  app.get("/agente/plantilla", reader, async (c) => {
    const [defs, counts, values, totals] = await Promise.all([
      loadParamDefs(sql),
      countOverrides(sql),
      sql<{ clave: string; valor: string }[]>`
        SELECT clave, valor FROM public.config_plantilla WHERE plantilla_code = ${STANDARD_TEMPLATE}
      `,
      sql<{ total: number }[]>`
        SELECT count(DISTINCT restaurante_id)::int AS total FROM public.restaurante_modulo
        WHERE  modulo_code = 'whatsapp.agent'
      `,
    ]);
    const shared = new Map(values.map((row) => [row.clave, row.valor]));
    return c.json({
      plantilla: STANDARD_TEMPLATE,
      restaurantes_con_agente: totals[0]?.total ?? 0,
      parametros: defs.map((def) => ({
        clave: def.clave,
        etiqueta: def.etiqueta,
        descripcion: def.descripcion,
        tipo: def.tipo,
        unidad: def.unidad,
        minimo: def.minimo,
        maximo: def.maximo,
        opciones: def.opciones,
        nivel: def.moduloCode === null ? "basico" : "premium",
        editable_por: def.editablePor,
        valor: shared.get(def.clave) ?? null,
        personalizan: counts.get(def.clave) ?? 0,
      })),
    });
  });

  app.put("/agente/plantilla", writer, async (c) => {
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const defs = new Map((await loadParamDefs(sql)).map((def) => [def.clave, def]));
    const checked = checkChanges(defs, parsed.data.valores, () => null);
    if (!checked.ok) {
      return fail(c, 422, API_ERROR.InvalidBody, { reason: checked.reason, field: checked.field });
    }
    await saveTemplateValues(sql, STANDARD_TEMPLATE, checked.changes);
    await audit(sql, {
      restauranteId: null,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion: "agent.template.update",
      recursoTipo: "config_plantilla",
      recursoId: STANDARD_TEMPLATE,
      resultado: "ok",
      detalle: { claves: [...checked.changes.keys()] },
      requestId: c.get("requestId"),
    });
    return c.json({ ok: true, claves: [...checked.changes.keys()] });
  });

  const restaurantId = async (raw: string | undefined) => {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const [row] = await sql<{ id: number }[]>`SELECT id FROM public.restaurante WHERE id = ${id}`;
    return row?.id ?? null;
  };

  app.get("/restaurantes/:id/agente", reader, async (c) => {
    const id = await restaurantId(c.req.param("id"));
    if (id === null) return fail(c, 404, API_ERROR.NotFound);
    const modules = await sql<{ modulo_code: string }[]>`
      SELECT modulo_code FROM public.restaurante_modulo WHERE restaurante_id = ${id}
    `;
    const active = new Set(modules.map((row) => row.modulo_code));
    const views = await loadParamViews(sql, id, active, STANDARD_TEMPLATE);
    return c.json({
      agente_contratado: active.has("whatsapp.agent"),
      premium_contratado: active.has("whatsapp.agent_pro"),
      parametros: views.map((view) => ({
        clave: view.clave,
        etiqueta: view.etiqueta,
        descripcion: view.descripcion,
        tipo: view.tipo,
        unidad: view.unidad,
        minimo: view.minimo,
        maximo: view.maximo,
        opciones: view.opciones,
        nivel: view.moduloCode === null ? "basico" : "premium",
        editable_por: view.editablePor,
        bloqueado: view.bloqueado,
        valor: view.valor,
        valor_plantilla: view.valorPlantilla,
        origen: view.origen,
      })),
    });
  });

  app.put("/restaurantes/:id/agente", writer, async (c) => {
    const id = await restaurantId(c.req.param("id"));
    if (id === null) return fail(c, 404, API_ERROR.NotFound);
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const defs = new Map((await loadParamDefs(sql)).map((def) => [def.clave, def]));
    const checked = checkChanges(defs, parsed.data.valores, () => null);
    if (!checked.ok) {
      return fail(c, 422, API_ERROR.InvalidBody, { reason: checked.reason, field: checked.field });
    }
    await saveParamValues(sql, id, checked.changes);
    await audit(sql, {
      restauranteId: id,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion: "agent.settings.update",
      recursoTipo: "restaurante",
      recursoId: String(id),
      resultado: "ok",
      detalle: { claves: [...checked.changes.keys()], origen: "interno" },
      requestId: c.get("requestId"),
    });
    return c.json({ ok: true, claves: [...checked.changes.keys()] });
  });
}
