import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import { FULFILLMENT, ORDER_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { changeOrderStatus } from "../repositories/order-status";

/**
 * Repartos asignados (módulo «delivery»):
 * - delivery.assign: asignar (o quitar) el repartidor de un pedido de reparto en marcha.
 *   Repartidor = miembro con orders.deliver_assigned y acceso al local del pedido.
 * - orders.deliver_assigned: «Mis repartos». El repartidor solo ve los pedidos que tiene
 *   asignados y solo los marca «en camino» y «entregado» (misma máquina de estados).
 * Trazabilidad: pedido_reparto (quién, quién asignó, horas) + pedido_estado_log con el actor.
 */

type Ctx = Context<AppEnv>;

const CLOSED = [
  ORDER_STATUS.Delivered,
  ORDER_STATUS.Cancelled,
  ORDER_STATUS.Expired,
  ORDER_STATUS.InCart,
];

type DriverRow = {
  membership_id: number;
  email: string | null;
  roles: string[];
  locales: number[];
  en_curso: number;
};

/** Miembros del restaurante que pueden repartir (tienen orders.deliver_assigned). */
async function loadDrivers(sql: Sql, restauranteId: number): Promise<DriverRow[]> {
  return sql<DriverRow[]>`
    SELECT m.id::int AS membership_id, m.email,
           array_agg(DISTINCT r.nombre ORDER BY r.nombre) AS roles,
           COALESCE((SELECT array_agg(ms.sucursal_id::int) FROM public.membresia_sucursal ms
                     WHERE ms.membership_id = m.id), '{}') AS locales,
           (SELECT count(*)::int FROM public.pedido_reparto pr
            JOIN   public.pedidos p ON p.id = pr.pedido_id
            WHERE  pr.membership_id = m.id AND p.estado NOT IN ${sql(CLOSED)}) AS en_curso
    FROM   public.local_memberships m
    JOIN   public.membresia_rol mr ON mr.membership_id = m.id
    JOIN   public.rol r            ON r.id = mr.rol_id
    WHERE  m.restaurante_id = ${restauranteId}
      AND  EXISTS (SELECT 1 FROM public.membresia_rol mr2
                   JOIN   public.rol_permiso rp ON rp.rol_id = mr2.rol_id
                   WHERE  mr2.membership_id = m.id AND rp.permiso_code = ${PERMISSION.OrdersDeliverAssigned})
    GROUP  BY m.id
    ORDER  BY m.email NULLS LAST
  `;
}

const serves = (driver: Pick<DriverRow, "locales">, branchId: number | null) =>
  driver.locales.length === 0 || (branchId !== null && driver.locales.includes(branchId));

async function ownMembership(sql: Sql, restauranteId: number, userId: string) {
  const [row] = await sql<{ id: number }[]>`
    SELECT id::int AS id FROM public.local_memberships
    WHERE  restaurante_id = ${restauranteId} AND user_id = ${userId}::uuid
  `;
  return row?.id ?? null;
}

export function registerDriverRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    orderId: number,
    detalle: Record<string, unknown>,
    resultado: "ok" | "denegado" = "ok",
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo: "pedido",
      recursoId: String(orderId),
      resultado,
      detalle,
      requestId: c.get("requestId"),
    });

  app.get("/:slug/repartidores", requirePermission(deps, PERMISSION.DeliveryAssign), async (c) => {
    const drivers = await loadDrivers(sql, c.get("restaurant").id);
    const access = c.get("access");
    // Solo los que pueden repartir en algún local del usuario.
    const visible = drivers.filter(
      (driver) =>
        driver.locales.length === 0 || driver.locales.some((id) => canAccessBranch(access, id)),
    );
    return c.json({
      repartidores: visible.map((driver) => ({
        ...driver,
        locales: driver.locales.length === 0 ? "todos" : driver.locales,
      })),
    });
  });

  app.put(
    "/:slug/orders/:id/repartidor",
    requirePermission(deps, PERMISSION.DeliveryAssign),
    async (c) => {
      const orderId = Number(c.req.param("id"));
      const parsed = z
        .object({ membership_id: z.number().int().positive().nullable() })
        .safeParse(await c.req.json().catch(() => null));
      if (!Number.isSafeInteger(orderId) || orderId < 1 || !parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody);
      }
      const restauranteId = c.get("restaurant").id;
      const [order] = await sql<
        { estado: string; tipo_despacho: string | null; sucursal_id: number | null }[]
      >`
        SELECT estado, tipo_despacho, sucursal_id FROM public.pedidos
        WHERE  id = ${orderId} AND restaurante_id = ${restauranteId}
      `;
      if (!order || !canAccessBranch(c.get("access"), order.sucursal_id)) {
        return fail(c, 404, API_ERROR.OrderNotFound);
      }
      if (order.tipo_despacho !== FULFILLMENT.Delivery) {
        return fail(c, 422, API_ERROR.InvalidBody, { reason: "not_delivery" });
      }
      if ((CLOSED as readonly string[]).includes(order.estado)) {
        return fail(c, 422, API_ERROR.InvalidBody, { reason: "order_closed" });
      }
      const target = parsed.data.membership_id;
      if (target === null) {
        await sql`DELETE FROM public.pedido_reparto WHERE pedido_id = ${orderId} AND restaurante_id = ${restauranteId}`;
        await record(c, "delivery.assign", orderId, { repartidor: null });
        return c.json({ id: orderId, repartidor: null });
      }
      const driver = (await loadDrivers(sql, restauranteId)).find(
        (row) => row.membership_id === target,
      );
      if (!driver || !serves(driver, order.sucursal_id)) {
        return fail(c, 422, API_ERROR.InvalidBody, { reason: "not_a_driver" });
      }
      await sql`
        INSERT INTO public.pedido_reparto
          (pedido_id, restaurante_id, membership_id, repartidor_email, asignado_por)
        VALUES (${orderId}, ${restauranteId}, ${target}, ${driver.email}, ${c.get("user").email ?? c.get("user").userId})
        ON CONFLICT (pedido_id) DO UPDATE
        SET    membership_id = EXCLUDED.membership_id, repartidor_email = EXCLUDED.repartidor_email,
               asignado_por = EXCLUDED.asignado_por, asignado_at = now(), salida_at = NULL
      `;
      await record(c, "delivery.assign", orderId, { repartidor: target, email: driver.email });
      return c.json({ id: orderId, repartidor: { membership_id: target, email: driver.email } });
    },
  );

  // --------------------------------------------------------------------- Mis repartos

  app.get(
    "/:slug/mis-repartos",
    requirePermission(deps, PERMISSION.OrdersDeliverAssigned),
    async (c) => {
      const restaurant = c.get("restaurant");
      const member = await ownMembership(sql, restaurant.id, c.get("user").userId);
      if (member === null) return c.json({ repartos: [] });
      const tz = restaurant.zonaHoraria;
      const rows = await sql`
        SELECT p.id, p.pedido_codigo, p.estado, p.estado_pago, p.metodo_pago, p.total,
               p.nombre_pedido, p.telefono, p.direccion, p.lat, p.lng, p.items, p.notas,
               p.tiempo_estimado, s.nombre AS local_nombre,
               p.created_at AT TIME ZONE 'UTC' AS created_at,
               pr.asignado_at, pr.salida_at, pr.entregado_at
        FROM   public.pedido_reparto pr
        JOIN   public.pedidos p       ON p.id = pr.pedido_id
        LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
        WHERE  pr.restaurante_id = ${restaurant.id} AND pr.membership_id = ${member}
          AND  (p.estado NOT IN ${sql(CLOSED)}
                OR (pr.entregado_at AT TIME ZONE ${tz})::date = (now() AT TIME ZONE ${tz})::date)
        ORDER  BY (p.estado IN ${sql(CLOSED)}), pr.asignado_at
      `;
      return c.json({ repartos: rows });
    },
  );

  const step = (accion: "salida" | "entregado") => async (c: Ctx) => {
    const orderId = Number(c.req.param("id"));
    if (!Number.isSafeInteger(orderId) || orderId < 1) return fail(c, 400, API_ERROR.InvalidBody);
    const restaurant = c.get("restaurant");
    const user = c.get("user");
    const member = await ownMembership(sql, restaurant.id, user.userId);
    const [assigned] = await sql<{ membership_id: number | null }[]>`
      SELECT membership_id::int AS membership_id FROM public.pedido_reparto
      WHERE  pedido_id = ${orderId} AND restaurante_id = ${restaurant.id}
    `;
    // Un pedido que no es suyo se trata como inexistente.
    if (!assigned || member === null || assigned.membership_id !== member) {
      await record(c, `delivery.${accion}`, orderId, { motivo: "not_assigned" }, "denegado");
      return fail(c, 404, API_ERROR.OrderNotFound);
    }
    const target = accion === "salida" ? ORDER_STATUS.OnTheWay : ORDER_STATUS.Delivered;
    const result = await changeOrderStatus(sql, {
      restaurantId: restaurant.id,
      orderId,
      target,
      origin: "reparto",
      actor: user.email ?? user.userId,
      allowed: (order) => order.tipo_despacho === FULFILLMENT.Delivery,
      after: async (tx) => {
        if (accion === "salida") {
          await tx`UPDATE public.pedido_reparto SET salida_at = now() WHERE pedido_id = ${orderId}`;
        } else {
          await tx`
            UPDATE public.pedido_reparto
            SET    entregado_at = now(), salida_at = COALESCE(salida_at, now())
            WHERE  pedido_id = ${orderId}
          `;
        }
      },
    });
    if (result.kind === "not_found" || result.kind === "out_of_scope") {
      return fail(c, 404, API_ERROR.OrderNotFound);
    }
    await record(
      c,
      `delivery.${accion}`,
      orderId,
      {
        desde: result.from,
        hacia: target,
        ...(result.kind === "rejected" ? { motivo: result.error } : {}),
      },
      result.kind === "updated" ? "ok" : "denegado",
    );
    if (result.kind === "rejected") {
      return fail(c, 422, API_ERROR.InvalidTransition, {
        from: result.from,
        to: target,
        reason: result.error,
      });
    }
    return c.json({ id: orderId, estado: target });
  };

  app.post(
    "/:slug/mis-repartos/:id/salida",
    requirePermission(deps, PERMISSION.OrdersDeliverAssigned),
    step("salida"),
  );
  app.post(
    "/:slug/mis-repartos/:id/entregado",
    requirePermission(deps, PERMISSION.OrdersDeliverAssigned),
    step("entregado"),
  );
}
