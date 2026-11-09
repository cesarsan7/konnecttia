import { ALL_BRANCHES, PERMISSION } from "@konnecttia/access";
import { INCIDENT_NOTE_MAX, INCIDENT_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";

type Ctx = Context<AppEnv>;

const PAGE_SIZE = 50;

const resolveSchema = z.object({
  estado: z.enum([INCIDENT_STATUS.Resolved, INCIDENT_STATUS.Open]),
  nota: z.string().trim().max(INCIDENT_NOTE_MAX).optional(),
});

/**
 * Incidencias del cliente (pieza P) en el panel: se ven con `orders.view` y se resuelven o
 * reabren con `orders.update`. Cada una dice quién repartió o atendió el pedido (pieza U) para
 * poder seguirla. Un usuario limitado a unos locales solo ve las de esos locales.
 */
export function registerIncidentRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const branchClause = (c: Ctx) => {
    const scope = c.get("access").branchScope;
    return scope === ALL_BRANCHES ? sql`` : sql`AND p.sucursal_id IN ${sql([...scope])}`;
  };

  app.get("/:slug/incidencias", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const restauranteId = c.get("restaurant").id;
    const filter = c.req.query("estado");
    const estado =
      filter === INCIDENT_STATUS.Resolved || filter === INCIDENT_STATUS.Open ? filter : null;
    const page = Math.max(1, Number.parseInt(c.req.query("pagina") ?? "1", 10) || 1);
    const rows = await sql`
      SELECT i.id, i.pedido_id, p.pedido_codigo, i.tipo, i.descripcion, i.estado,
             i.nota_resolucion, i.resuelta_por, i.resuelta_at, i.created_at,
             p.tipo_despacho, p.estado AS pedido_estado, p.nombre_pedido, p.telefono,
             s.nombre AS local_nombre, mw.nombre AS mesero_nombre,
             COALESCE(dm.apodo, dm.nombre) AS repartidor_nombre,
             count(*) OVER ()::int AS total_filas
      FROM   public.pedido_incidencia i
      JOIN   public.pedidos p ON p.id = i.pedido_id
      LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
      LEFT   JOIN public.meseros mw ON mw.id = p.mesero_id AND mw.restaurante_id = p.restaurante_id
      LEFT   JOIN public.pedido_reparto pr ON pr.pedido_id = p.id
      LEFT   JOIN public.local_memberships dm ON dm.id = pr.membership_id
      WHERE  i.restaurante_id = ${restauranteId}
        AND  (${estado}::text IS NULL OR i.estado = ${estado})
        ${branchClause(c)}
      ORDER  BY (i.estado = ${INCIDENT_STATUS.Open}) DESC, i.created_at DESC
      LIMIT  ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    `;
    const [open] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n
      FROM   public.pedido_incidencia i
      JOIN   public.pedidos p ON p.id = i.pedido_id
      WHERE  i.restaurante_id = ${restauranteId} AND i.estado = ${INCIDENT_STATUS.Open}
        ${branchClause(c)}
    `;
    return c.json({
      incidencias: rows.map(({ total_filas: _total, ...row }) => row),
      total: rows[0]?.total_filas ?? 0,
      abiertas: open?.n ?? 0,
      pagina: page,
      por_pagina: PAGE_SIZE,
    });
  });

  app.patch(
    "/:slug/incidencias/:id",
    requirePermission(deps, PERMISSION.OrdersUpdate),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const id = Number.parseInt(c.req.param("id"), 10);
      if (!Number.isSafeInteger(id) || id < 1)
        return fail(c, 400, API_ERROR.InvalidBody, { field: "id" });
      const parsed = resolveSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "estado" });
      const { estado, nota } = parsed.data;
      const resolving = estado === INCIDENT_STATUS.Resolved;
      // La fila solo se toca si es de este restaurante y de un local al que el usuario tiene acceso.
      const rows = await sql<{ id: number }[]>`
      UPDATE public.pedido_incidencia i
      SET    estado = ${estado},
             nota_resolucion = ${resolving ? (nota ?? null) : null},
             resuelta_por = ${resolving ? (user.email ?? user.userId) : null},
             resuelta_at = ${resolving ? sql`now()` : null}
      FROM   public.pedidos p
      WHERE  i.id = ${id} AND i.restaurante_id = ${restaurant.id} AND p.id = i.pedido_id
        ${branchClause(c)}
      RETURNING i.id
    `;
      if (rows.length === 0) return fail(c, 404, API_ERROR.NotFound);
      await audit(sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: resolving ? "orders.incident.resolve" : "orders.incident.reopen",
        recursoTipo: "pedido_incidencia",
        recursoId: String(id),
        resultado: "ok",
        detalle: {},
        requestId: c.get("requestId"),
      });
      return c.json({ id, estado });
    },
  );
}
