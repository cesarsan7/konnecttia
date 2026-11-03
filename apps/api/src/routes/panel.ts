import { branchFilter, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { checkTransition, type Fulfillment, isOrderStatus, ORDER_STATUS } from "@konnecttia/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requireMember, requirePermission } from "../middleware/auth";
import { resolveRestaurant } from "../middleware/tenant";
import { audit } from "../repositories/access";
import { OUTBOX_EVENT } from "../repositories/orders";

const PAGE_SIZE = 100;

const statusBodySchema = z.object({ estado: z.string().refine(isOrderStatus) });

const busyModeSchema = z.object({
  minutos_extra: z.number().int().min(1).max(240),
  duracion_minutos: z.number().int().min(5).max(720),
  servicio: z.enum(["recogida", "reparto", "ambos"]).default("ambos"),
  motivo: z.string().trim().max(200).optional(),
});

/** Estados que no cuentan como venta. */
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_DAYS = 366;

function parseBranchQuery(value: string | undefined): number | null | "invalid" {
  if (value === undefined) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : "invalid";
}

/** Panel del restaurante. Toda ruta exige membresía y un permiso concreto. */
export function panelRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use("/:slug/*", resolveRestaurant(deps), requireMember(deps));

  app.get("/:slug/orders", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const restaurant = c.get("restaurant");
    const estado = c.req.query("estado");
    if (estado !== undefined && !isOrderStatus(estado)) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: "estado" });
    }
    const requested = parseBranchQuery(c.req.query("local"));
    if (requested === "invalid") {
      return fail(c, 400, API_ERROR.InvalidBody, { field: "local" });
    }
    // Cada usuario solo ve los pedidos de sus locales.
    const branches = branchFilter(c.get("access"), requested);
    if (branches !== null && branches.length === 0) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_out_of_scope" });
    }
    const rows = await deps.sql`
      SELECT p.id, p.pedido_codigo, p.estado, p.estado_pago, p.tipo_despacho, p.canal,
             p.nombre_pedido, p.telefono, p.direccion, p.items, p.subtotal, p.costo_envio,
             p.total, p.metodo_pago, p.tiempo_estimado, p.notas, p.created_at, p.updated_at,
             p.sucursal_id, s.nombre AS local_nombre
      FROM   public.pedidos p
      LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
      WHERE  p.restaurante_id = ${restaurant.id}
        AND  (${estado ?? null}::text IS NULL OR p.estado = ${estado ?? null})
        AND  p.estado <> ${ORDER_STATUS.InCart}
        ${branches === null ? deps.sql`` : deps.sql`AND p.sucursal_id IN ${deps.sql(branches)}`}
      ORDER  BY p.created_at DESC
      LIMIT  ${PAGE_SIZE}
    `;
    return c.json({ pedidos: rows });
  });

  app.patch(
    "/:slug/orders/:id/status",
    requirePermission(deps, PERMISSION.OrdersChangeStatus),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const id = Number.parseInt(c.req.param("id"), 10);
      if (!Number.isSafeInteger(id) || id < 1) {
        return fail(c, 400, API_ERROR.InvalidBody, { field: "id" });
      }
      const parsed = statusBodySchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody, { field: "estado" });
      }
      const target = parsed.data.estado;

      const result = await deps.sql.begin(async (tx) => {
        const rows = await tx<
          {
            id: number;
            estado: string;
            estado_pago: string;
            tipo_despacho: Fulfillment;
            sucursal_id: number | null;
          }[]
        >`
          SELECT id, estado, estado_pago, tipo_despacho, sucursal_id
          FROM   public.pedidos
          WHERE  id = ${id} AND restaurante_id = ${restaurant.id}
          FOR UPDATE
        `;
        const order = rows[0];
        if (!order) return { kind: "not_found" as const };
        // Un pedido de otro local se trata como inexistente para no revelar nada.
        if (!canAccessBranch(c.get("access"), order.sucursal_id)) {
          return { kind: "out_of_scope" as const, from: order.estado };
        }

        const check = checkTransition({
          from: order.estado,
          to: target,
          fulfillment: order.tipo_despacho,
          paymentStatus: order.estado_pago,
        });
        if (!check.ok) return { kind: "rejected" as const, from: order.estado, error: check.error };

        // El trigger fn_log_estado_pedido lee estos valores para el historial de estados.
        await tx`SELECT set_config('app.origen', 'panel', true), set_config('app.actor', ${user.email ?? user.userId}, true)`;
        await tx`
          UPDATE public.pedidos SET estado = ${target}, updated_at = now()
          WHERE  id = ${id} AND restaurante_id = ${restaurant.id}
        `;
        await tx`
          INSERT INTO public.outbox_evento
            (restaurante_id, tipo, agregado_tipo, agregado_id, payload, clave_idempotencia)
          VALUES (
            ${restaurant.id}, ${OUTBOX_EVENT.OrderStatusChanged}, 'pedido', ${String(id)},
            ${tx.json({ pedido_id: id, desde: order.estado, hacia: target })},
            ${`${OUTBOX_EVENT.OrderStatusChanged}:${id}:${order.estado}:${target}`}
          )
          ON CONFLICT (clave_idempotencia) DO NOTHING
        `;
        return { kind: "updated" as const, from: order.estado };
      });

      if (result.kind === "not_found") {
        return fail(c, 404, API_ERROR.OrderNotFound);
      }
      if (result.kind === "out_of_scope") {
        await audit(deps.sql, {
          restauranteId: restaurant.id,
          actorTipo: "usuario",
          actorId: user.userId,
          accion: "orders.change_status",
          recursoTipo: "pedido",
          recursoId: String(id),
          resultado: "denegado",
          detalle: { motivo: "branch_out_of_scope" },
          requestId: c.get("requestId"),
        });
        return fail(c, 404, API_ERROR.OrderNotFound);
      }
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: "orders.change_status",
        recursoTipo: "pedido",
        recursoId: String(id),
        resultado: result.kind === "updated" ? "ok" : "denegado",
        detalle: { desde: result.from, hacia: target },
        requestId: c.get("requestId"),
      });
      if (result.kind === "rejected") {
        return fail(c, 422, API_ERROR.InvalidTransition, {
          from: result.from,
          to: target,
          reason: result.error,
        });
      }
      return c.json({ id, estado: target });
    },
  );

  // Locales que el usuario puede ver (para el selector de local del panel).
  app.get("/:slug/locales", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const restaurant = c.get("restaurant");
    const branches = branchFilter(c.get("access"));
    const rows = await deps.sql`
      SELECT id, nombre, slug, direccion, telefono, es_principal AS principal, activo,
             acepta_recogida AS recogida, acepta_reparto AS reparto
      FROM   public.sucursal
      WHERE  restaurante_id = ${restaurant.id}
        ${branches === null ? deps.sql`` : deps.sql`AND id IN ${deps.sql(branches)}`}
      ORDER  BY es_principal DESC, nombre
    `;
    return c.json({ locales: rows });
  });

  /**
   * Ventas por local entre dos fechas (ambas incluidas). Base para analítica, inventario y
   * compras por local. Respeta el alcance por locales del usuario.
   */
  app.get("/:slug/reports/sales", requirePermission(deps, PERMISSION.AnalyticsView), async (c) => {
    const restaurant = c.get("restaurant");
    const desde = c.req.query("desde") ?? "";
    const hasta = c.req.query("hasta") ?? "";
    const from = Date.parse(`${desde}T00:00:00Z`);
    const to = Date.parse(`${hasta}T00:00:00Z`);
    if (
      !DATE_PATTERN.test(desde) ||
      !DATE_PATTERN.test(hasta) ||
      Number.isNaN(from) ||
      Number.isNaN(to) ||
      to < from ||
      (to - from) / 86_400_000 > MAX_REPORT_DAYS
    ) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: "desde/hasta" });
    }
    const requested = parseBranchQuery(c.req.query("local"));
    if (requested === "invalid") {
      return fail(c, 400, API_ERROR.InvalidBody, { field: "local" });
    }
    const branches = branchFilter(c.get("access"), requested);
    if (branches !== null && branches.length === 0) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_out_of_scope" });
    }
    const rows = await deps.sql<
      {
        sucursal_id: number;
        local: string;
        pedidos: number;
        ventas: string;
        ticket_medio: string;
        pendientes_pago: number;
        recogida: number;
        reparto: number;
        web: number;
        whatsapp: number;
      }[]
    >`
      SELECT s.id AS sucursal_id, s.nombre AS local,
             count(p.id)::int                                            AS pedidos,
             COALESCE(sum(p.total), 0)                                   AS ventas,
             COALESCE(round(avg(p.total), 2), 0)                         AS ticket_medio,
             count(p.id) FILTER (WHERE p.estado_pago = 'pendiente')::int AS pendientes_pago,
             count(p.id) FILTER (WHERE p.tipo_despacho = 'retiro')::int   AS recogida,
             count(p.id) FILTER (WHERE p.tipo_despacho = 'delivery')::int AS reparto,
             count(p.id) FILTER (WHERE p.canal = 'web')::int              AS web,
             count(p.id) FILTER (WHERE p.canal = 'whatsapp')::int         AS whatsapp
      FROM   public.sucursal s
      LEFT   JOIN public.pedidos p
             ON  p.sucursal_id = s.id
             AND p.restaurante_id = ${restaurant.id}
             AND p.estado NOT IN ${deps.sql(NOT_A_SALE)}
             AND p.created_at >= ${desde}::date
             AND p.created_at <  ${hasta}::date + 1
      WHERE  s.restaurante_id = ${restaurant.id}
        ${branches === null ? deps.sql`` : deps.sql`AND s.id IN ${deps.sql(branches)}`}
      GROUP  BY s.id, s.nombre, s.es_principal
      ORDER  BY s.es_principal DESC, s.nombre
    `;
    const locales = rows.map((row) => ({
      ...row,
      ventas: Number(row.ventas),
      ticket_medio: Number(row.ticket_medio),
    }));
    return c.json({
      desde,
      hasta,
      locales,
      total: {
        pedidos: locales.reduce((sum, row) => sum + row.pedidos, 0),
        ventas: Math.round(locales.reduce((sum, row) => sum + row.ventas, 0) * 100) / 100,
      },
    });
  });

  /**
   * «Modo ocupado» de un local: suma minutos al tiempo estimado durante un rato (como el de
   * Deliveroo). Solo para usuarios con alcance sobre ese local.
   */
  app.post(
    "/:slug/locales/:id/modo-ocupado",
    requirePermission(deps, PERMISSION.OrdersChangeStatus),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const branchId = Number(c.req.param("id"));
      if (!Number.isSafeInteger(branchId) || !canAccessBranch(c.get("access"), branchId)) {
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      const parsed = busyModeSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody, {
          field: parsed.error.issues[0]?.path.join("."),
        });
      }
      const body = parsed.data;
      const now = deps.now();
      const until = new Date(now.getTime() + body.duracion_minutos * 60_000);
      const rows = await deps.sql<{ id: number }[]>`
        INSERT INTO public.modo_ocupado
          (restaurante_id, sucursal_id, servicio, minutos_extra, desde, hasta, motivo, creado_por)
        SELECT ${restaurant.id}, s.id, ${body.servicio}, ${body.minutos_extra}, ${now}, ${until},
               ${body.motivo ?? null}, ${user.email ?? user.userId}
        FROM   public.sucursal s
        WHERE  s.id = ${branchId} AND s.restaurante_id = ${restaurant.id}
        RETURNING id
      `;
      if (rows.length === 0) {
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: "locales.modo_ocupado.activar",
        recursoTipo: "sucursal",
        recursoId: String(branchId),
        resultado: "ok",
        detalle: { minutos_extra: body.minutos_extra, hasta: until.toISOString() },
        requestId: c.get("requestId"),
      });
      return c.json(
        { id: rows[0]?.id, minutos_extra: body.minutos_extra, hasta: until.toISOString() },
        201,
      );
    },
  );

  app.delete(
    "/:slug/locales/:id/modo-ocupado",
    requirePermission(deps, PERMISSION.OrdersChangeStatus),
    async (c) => {
      const restaurant = c.get("restaurant");
      const user = c.get("user");
      const branchId = Number(c.req.param("id"));
      if (!Number.isSafeInteger(branchId) || !canAccessBranch(c.get("access"), branchId)) {
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      const ended = await deps.sql`
        UPDATE public.modo_ocupado SET finalizado_at = ${deps.now()}
        WHERE  restaurante_id = ${restaurant.id} AND sucursal_id = ${branchId}
          AND  finalizado_at IS NULL AND hasta > ${deps.now()}
      `;
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: "locales.modo_ocupado.finalizar",
        recursoTipo: "sucursal",
        recursoId: String(branchId),
        resultado: "ok",
        detalle: { finalizados: ended.count },
        requestId: c.get("requestId"),
      });
      return c.json({ finalizados: ended.count });
    },
  );

  return app;
}
