import { PERMISSION } from "@konnecttia/access";
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
    const rows = await deps.sql`
      SELECT id, pedido_codigo, estado, estado_pago, tipo_despacho, canal, nombre_pedido,
             telefono, direccion, items, subtotal, costo_envio, total, metodo_pago,
             tiempo_estimado, notas, created_at, updated_at
      FROM   public.pedidos
      WHERE  restaurante_id = ${restaurant.id}
        AND  (${estado ?? null}::text IS NULL OR estado = ${estado ?? null})
        AND  estado <> ${ORDER_STATUS.InCart}
      ORDER  BY created_at DESC
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
          { id: number; estado: string; estado_pago: string; tipo_despacho: Fulfillment }[]
        >`
          SELECT id, estado, estado_pago, tipo_despacho
          FROM   public.pedidos
          WHERE  id = ${id} AND restaurante_id = ${restaurant.id}
          FOR UPDATE
        `;
        const order = rows[0];
        if (!order) return { kind: "not_found" as const };

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

  return app;
}
