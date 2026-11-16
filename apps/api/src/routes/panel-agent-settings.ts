import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import {
  checkChanges,
  loadParamDefs,
  loadParamViews,
  saveParamValues,
} from "../repositories/agent-config";
import { STANDARD_TEMPLATE } from "../repositories/restaurants";

const patchSchema = z.object({
  /** clave → valor nuevo; `null` borra la personalización y vuelve a heredar el estándar. */
  valores: z.record(z.string(), z.unknown()).refine((v) => Object.keys(v).length > 0),
});

/**
 * Ajustes → «Agente de WhatsApp» (ADR 0013). Cada parámetro hereda el valor de la plantilla
 * estándar hasta que el restaurante lo personaliza. Solo con el módulo del agente (el permiso
 * `agent.configure` pertenece a él); los parámetros premium además piden `whatsapp.agent_pro`.
 */
export function registerAgentSettingsRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  app.get(
    "/:slug/ajustes/agente",
    requirePermission(deps, PERMISSION.AgentConfigure),
    async (c) => {
      const restauranteId = c.get("restaurant").id;
      const views = await loadParamViews(
        sql,
        restauranteId,
        c.get("access").activeModules,
        STANDARD_TEMPLATE,
      );
      return c.json({
        parametros: views
          .filter((view) => view.editablePor === "restaurante")
          .map((view) => ({
            clave: view.clave,
            etiqueta: view.etiqueta,
            descripcion: view.descripcion,
            tipo: view.tipo,
            unidad: view.unidad,
            minimo: view.minimo,
            maximo: view.maximo,
            opciones: view.opciones,
            nivel: view.moduloCode === null ? "basico" : "premium",
            bloqueado: view.bloqueado,
            valor: view.valor,
            valor_plantilla: view.valorPlantilla,
            origen: view.origen,
          })),
      });
    },
  );

  app.patch(
    "/:slug/ajustes/agente",
    requirePermission(deps, PERMISSION.AgentConfigure),
    async (c) => {
      const restauranteId = c.get("restaurant").id;
      const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const defs = new Map((await loadParamDefs(sql)).map((def) => [def.clave, def]));
      const active = c.get("access").activeModules;
      const checked = checkChanges(defs, parsed.data.valores, (def) =>
        def.editablePor !== "restaurante" ? "unknown_param" : null,
      );
      if (!checked.ok) {
        return fail(c, 422, API_ERROR.InvalidBody, {
          reason: checked.reason,
          field: checked.field,
        });
      }
      const changes = checked.changes;
      for (const key of changes.keys()) {
        const module = defs.get(key)?.moduloCode;
        if (module && !active.has(module as never)) {
          return fail(c, 403, API_ERROR.Forbidden, {
            reason: "module_required",
            modulos: [module],
            field: key,
          });
        }
      }
      await saveParamValues(sql, restauranteId, changes);
      await audit(sql, {
        restauranteId,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: "agent.settings.update",
        recursoTipo: "restaurante",
        recursoId: String(restauranteId),
        resultado: "ok",
        detalle: { claves: [...changes.keys()] },
        requestId: c.get("requestId"),
      });
      return c.json({ ok: true, claves: [...changes.keys()] });
    },
  );
}
