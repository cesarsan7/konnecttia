import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";

const PAGE_SIZE = 50;
/** `contexto.origen` con el que el agente de WhatsApp registra sus derivaciones. */
const HANDOFF_ORIGIN = "agente_whatsapp";
const STATE = { Pending: "pendiente", Resolved: "resuelta" } as const;

const updateSchema = z.object({
  estado: z.enum([STATE.Resolved, STATE.Pending]),
  /** Al resolver, el agente vuelve a atender esa conversación (por defecto sí). */
  reanudar_agente: z.boolean().optional(),
});

/**
 * Derivaciones del agente de WhatsApp a una persona (pestaña «Derivaciones» de Incidencias): se ven
 * con `agent.handoffs.view` y se atienden con `agent.handoffs.manage`. Son del restaurante entero
 * (no cuelgan de un pedido ni de un local). Al atenderlas se reanuda al agente en esa conversación.
 */
export function registerHandoffRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  app.get(
    "/:slug/derivaciones",
    requirePermission(deps, PERMISSION.AgentHandoffsView),
    async (c) => {
      const restauranteId = c.get("restaurant").id;
      const filter = c.req.query("estado");
      const estado = filter === STATE.Pending || filter === STATE.Resolved ? filter : null;
      const page = Math.max(1, Number.parseInt(c.req.query("pagina") ?? "1", 10) || 1);
      const rows = await sql`
        SELECT e.id, e.telefono, e.problema AS resumen, e.tipo_escalacion AS motivo, e.estado,
               e.created_at, e.resolved_at, e.resolved_by,
               w.pausado_hasta AS agente_pausado_hasta,
               count(*) OVER ()::int AS total_filas
        FROM   public.escalaciones e
        LEFT   JOIN public.whatsapp_conversacion w
               ON  w.restaurante_id = e.restaurante_id
               AND w.telefono = e.telefono
               AND w.canal_id::text = e.contexto->>'canal_id'
        WHERE  e.restaurante_id = ${restauranteId}
          AND  e.contexto->>'origen' = ${HANDOFF_ORIGIN}
          AND  (${estado}::text IS NULL OR e.estado = ${estado})
        ORDER  BY (e.estado = ${STATE.Pending}) DESC, e.created_at DESC
        LIMIT  ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      `;
      const [open] = await sql<{ n: number }[]>`
        SELECT count(*)::int AS n
        FROM   public.escalaciones e
        WHERE  e.restaurante_id = ${restauranteId}
          AND  e.contexto->>'origen' = ${HANDOFF_ORIGIN}
          AND  e.estado = ${STATE.Pending}
      `;
      return c.json({
        derivaciones: rows.map(({ total_filas: _total, ...row }) => row),
        total: rows[0]?.total_filas ?? 0,
        abiertas: open?.n ?? 0,
        pagina: page,
        por_pagina: PAGE_SIZE,
      });
    },
  );

  app.patch(
    "/:slug/derivaciones/:id",
    requirePermission(deps, PERMISSION.AgentHandoffsManage),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const id = Number.parseInt(c.req.param("id"), 10);
      if (!Number.isSafeInteger(id) || id < 1) {
        return fail(c, 400, API_ERROR.InvalidBody, { field: "id" });
      }
      const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "estado" });
      const { estado } = parsed.data;
      const resolving = estado === STATE.Resolved;
      const resume = resolving && parsed.data.reanudar_agente !== false;

      const found = await sql.begin(async (tx) => {
        const [row] = await tx<{ telefono: string; canal_id: string | null }[]>`
          UPDATE public.escalaciones
          SET    estado = ${estado},
                 resolved_at = ${resolving ? sql`now()` : null},
                 resolved_by = ${resolving ? (user.email ?? user.userId) : null}
          WHERE  id = ${id} AND restaurante_id = ${restaurant.id}
            AND  contexto->>'origen' = ${HANDOFF_ORIGIN}
          RETURNING telefono, contexto->>'canal_id' AS canal_id
        `;
        if (!row) return false;
        if (resume && row.canal_id && /^[0-9]+$/.test(row.canal_id)) {
          // Solo la pausa puesta al derivar; si el personal pausó a mano, se respeta.
          await tx`
            UPDATE public.whatsapp_conversacion
            SET    pausado_hasta = NULL, pausado_por = NULL, updated_at = now()
            WHERE  restaurante_id = ${restaurant.id} AND canal_id = ${Number(row.canal_id)}
              AND  telefono = ${row.telefono} AND pausado_por = 'derivar_humano'
          `;
        }
        return true;
      });
      if (!found) return fail(c, 404, API_ERROR.NotFound);
      await audit(sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: resolving ? "agent.handoff.resolve" : "agent.handoff.reopen",
        recursoTipo: "escalacion",
        recursoId: String(id),
        resultado: "ok",
        detalle: { agente_reanudado: resume },
        requestId: c.get("requestId"),
      });
      return c.json({ id, estado, agente_reanudado: resume });
    },
  );
}
