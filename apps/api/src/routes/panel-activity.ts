import { branchFilter, can, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { FULFILLMENT, ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { canSeeMemberEmails } from "../lib/member-name";
import { parseReportRange } from "../repositories/reports";

/**
 * Ficha de actividad de repartidores y meseros (solo lectura, post-MVP, pieza U).
 * - Responde a incidencias: «¿quién llevó el pedido E-1043 y a qué hora salió?».
 * - Reutiliza `pedido_reparto`, `pedido_foto_entrega`, `pedido_estado_log`, `meseros` y
 *   `pedidos.mesero_id`. No crea tablas ni escribe nada.
 * - Quién ve qué: el repartidor o el mesero ve SOLO lo suyo. Ven a cualquiera quien gestiona el
 *   equipo (team.manage) y el encargado: delivery.assign para repartidores, tables.manage para
 *   meseros. Una persona ajena se trata como inexistente (404). Los gestores solo ven los
 *   locales de su alcance.
 * - Filtros: desde/hasta (días del restaurante, por defecto los últimos 7) y sucursal_id.
 */

type Ctx = Context<AppEnv>;

const DEFAULT_DAYS = 7;
const MAX_ROWS = 200;
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

async function ownMembership(sql: Sql, restauranteId: number, userId: string) {
  const [row] = await sql<{ id: number }[]>`
    SELECT id::int AS id FROM public.local_memberships
    WHERE  restaurante_id = ${restauranteId} AND user_id = ${userId}::uuid
  `;
  return row?.id ?? null;
}

/** Filtros comunes: rango de días del restaurante y local pedido (dentro del alcance). */
function readFilters(c: Ctx):
  | {
      ok: true;
      desde: string | null;
      hasta: string | null;
      sucursal: number | null;
    }
  | { ok: false; field: string } {
  const desde = c.req.query("desde") || undefined;
  const hasta = c.req.query("hasta") || undefined;
  if (desde || hasta) {
    if (!parseReportRange(desde, hasta)) return { ok: false, field: "desde" };
  }
  const raw = c.req.query("sucursal_id");
  let sucursal: number | null = null;
  if (raw) {
    sucursal = Number(raw);
    if (!Number.isSafeInteger(sucursal) || sucursal < 1) return { ok: false, field: "sucursal_id" };
  }
  return { ok: true, desde: desde ?? null, hasta: hasta ?? null, sucursal };
}

export function registerActivityRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  /** Condición SQL sobre `p.created_at` en horario del restaurante. */
  const dayRange = (tz: string, desde: string | null, hasta: string | null) =>
    desde && hasta
      ? sql`p.created_at >= ((${desde}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
            AND p.created_at < ((${hasta}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`
      : sql`p.created_at >= ((now() AT TIME ZONE ${tz})::date - ${DEFAULT_DAYS - 1}::int) ::timestamp
              AT TIME ZONE ${tz} AT TIME ZONE 'UTC'`;

  /** Locales visibles: los pedidos de un gestor se limitan a su alcance. */
  const branchCondition = (c: Ctx, requested: number | null, unrestricted: boolean) => {
    if (unrestricted) return requested === null ? sql`TRUE` : sql`p.sucursal_id = ${requested}`;
    const ids = branchFilter(c.get("access"), requested);
    if (ids === null) return sql`TRUE`;
    return ids.length === 0 ? sql`FALSE` : sql`p.sucursal_id IN ${sql(ids)}`;
  };

  // ------------------------------------------------------------------ Personas visibles

  app.get("/:slug/actividad/personas", async (c) => {
    const restaurant = c.get("restaurant");
    const access = c.get("access");
    const me = await ownMembership(sql, restaurant.id, c.get("user").userId);
    const seeDrivers = can(access, PERMISSION.TeamManage) || can(access, PERMISSION.DeliveryAssign);
    const seeWaiters = can(access, PERMISSION.TeamManage) || can(access, PERMISSION.TablesManage);
    const isDriver = can(access, PERMISSION.OrdersDeliverAssigned);
    const emails = canSeeMemberEmails(access);

    const drivers =
      seeDrivers || (isDriver && me !== null)
        ? await sql<{ membership_id: number; nombre: string | null; email: string | null }[]>`
            SELECT m.id::int AS membership_id, COALESCE(m.apodo, m.nombre) AS nombre, m.email
            FROM   public.local_memberships m
            WHERE  m.restaurante_id = ${restaurant.id}
              AND  EXISTS (SELECT 1 FROM public.membresia_rol mr
                           JOIN   public.rol_permiso rp ON rp.rol_id = mr.rol_id
                           WHERE  mr.membership_id = m.id
                             AND  rp.permiso_code = ${PERMISSION.OrdersDeliverAssigned})
              AND  (${seeDrivers} OR m.id = ${me})
            ORDER  BY COALESCE(m.apodo, m.nombre, m.email) NULLS LAST
          `
        : [];
    const waiters = await sql<
      {
        id: number;
        nombre: string;
        activo: boolean;
        sucursal_id: number | null;
        membership_id: number | null;
      }[]
    >`
      SELECT w.id, w.nombre, COALESCE(w.activo, true) AS activo, w.sucursal_id::int AS sucursal_id,
             w.membership_id::int AS membership_id
      FROM   public.meseros w
      WHERE  w.restaurante_id = ${restaurant.id}
        AND  (${seeWaiters} OR (${me}::bigint IS NOT NULL AND w.membership_id = ${me}))
      ORDER  BY w.nombre
    `;
    return c.json({
      repartidores: drivers.map((row) => ({ ...row, email: emails ? row.email : null })),
      meseros: waiters,
    });
  });

  // ----------------------------------------------------------------------- Repartidor

  app.get("/:slug/actividad/repartidor/:membershipId", async (c) => {
    const restaurant = c.get("restaurant");
    const access = c.get("access");
    const target = Number(c.req.param("membershipId"));
    if (!Number.isSafeInteger(target) || target < 1) return fail(c, 400, API_ERROR.InvalidBody);
    const filters = readFilters(c);
    if (!filters.ok) return fail(c, 400, API_ERROR.InvalidBody, { field: filters.field });

    const manager = can(access, PERMISSION.TeamManage) || can(access, PERMISSION.DeliveryAssign);
    const me = await ownMembership(sql, restaurant.id, c.get("user").userId);
    const own = me !== null && me === target && can(access, PERMISSION.OrdersDeliverAssigned);
    if (!manager && !own) return fail(c, 404, API_ERROR.NotFound);

    const [person] = await sql<{ nombre: string | null; email: string | null }[]>`
      SELECT COALESCE(apodo, nombre) AS nombre, email FROM public.local_memberships
      WHERE  id = ${target} AND restaurante_id = ${restaurant.id}
    `;
    if (!person) return fail(c, 404, API_ERROR.NotFound);

    const tz = restaurant.zonaHoraria;
    const where = sql`
      pr.restaurante_id = ${restaurant.id} AND pr.membership_id = ${target}
      AND ${dayRange(tz, filters.desde, filters.hasta)}
      AND ${branchCondition(c, filters.sucursal, own && !manager)}
    `;
    const [summary] = await sql`
      SELECT count(*)::int AS repartos,
             count(*) FILTER (WHERE pr.entregado_at IS NOT NULL)::int AS entregados,
             count(*) FILTER (WHERE p.estado = ${ORDER_STATUS.Cancelled})::int AS cancelados,
             count(*) FILTER (WHERE p.estado NOT IN ${sql([ORDER_STATUS.Delivered, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired])})::int AS en_curso,
             COALESCE(sum(p.total) FILTER (WHERE pr.entregado_at IS NOT NULL), 0)::float8 AS importe_entregado,
             COALESCE(sum(p.total) FILTER (WHERE p.estado_pago = ${PAYMENT_STATUS.Pending}), 0)::float8 AS por_cobrar,
             round((avg(extract(epoch FROM (pr.salida_at - pr.asignado_at)) / 60)
                    FILTER (WHERE pr.salida_at IS NOT NULL))::numeric, 1)::float8 AS min_hasta_salida,
             round((avg(extract(epoch FROM (pr.entregado_at - pr.salida_at)) / 60)
                    FILTER (WHERE pr.entregado_at IS NOT NULL AND pr.salida_at IS NOT NULL))::numeric, 1)::float8 AS min_en_ruta
      FROM   public.pedido_reparto pr
      JOIN   public.pedidos p ON p.id = pr.pedido_id
      WHERE  ${where}
    `;
    const rows = await sql`
      SELECT p.id, p.pedido_codigo, p.estado, p.estado_pago, p.metodo_pago, p.total::float8 AS total,
             p.direccion, s.nombre AS local_nombre,
             p.created_at AT TIME ZONE 'UTC' AS created_at,
             pr.asignado_por, pr.asignado_at, pr.salida_at, pr.entregado_at,
             (SELECT count(*)::int FROM public.pedido_foto_entrega f WHERE f.pedido_id = p.id)
               AS fotos_entrega
      FROM   public.pedido_reparto pr
      JOIN   public.pedidos p       ON p.id = pr.pedido_id
      LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
      WHERE  ${where}
      ORDER  BY pr.asignado_at DESC
      LIMIT  ${MAX_ROWS}
    `;
    return c.json({
      persona: {
        membership_id: target,
        nombre: person.nombre,
        email: canSeeMemberEmails(access) ? person.email : null,
      },
      resumen: summary,
      repartos: rows,
      truncado: (summary?.repartos ?? 0) > rows.length,
    });
  });

  // ------------------------------------------------------------------------- Mesero

  app.get("/:slug/actividad/mesero/:id", async (c) => {
    const restaurant = c.get("restaurant");
    const access = c.get("access");
    const target = Number(c.req.param("id"));
    if (!Number.isSafeInteger(target) || target < 1) return fail(c, 400, API_ERROR.InvalidBody);
    const filters = readFilters(c);
    if (!filters.ok) return fail(c, 400, API_ERROR.InvalidBody, { field: filters.field });

    const [waiter] = await sql<
      {
        nombre: string;
        activo: boolean;
        membership_id: number | null;
        sucursal_id: number | null;
      }[]
    >`
      SELECT nombre, COALESCE(activo, true) AS activo, membership_id::int AS membership_id,
             sucursal_id::int AS sucursal_id
      FROM   public.meseros WHERE id = ${target} AND restaurante_id = ${restaurant.id}
    `;
    const manager = can(access, PERMISSION.TeamManage) || can(access, PERMISSION.TablesManage);
    const me = await ownMembership(sql, restaurant.id, c.get("user").userId);
    const own = me !== null && waiter?.membership_id === me;
    if (!waiter || (!manager && !own)) return fail(c, 404, API_ERROR.NotFound);

    const tz = restaurant.zonaHoraria;
    const where = sql`
      p.restaurante_id = ${restaurant.id} AND p.mesero_id = ${target}
      AND ${dayRange(tz, filters.desde, filters.hasta)}
      AND ${branchCondition(c, filters.sucursal, own && !manager)}
    `;
    const [summary] = await sql`
      SELECT count(*) FILTER (WHERE p.estado NOT IN ${sql(NOT_A_SALE)})::int AS pedidos,
             count(DISTINCT p.mesa_numero) FILTER (WHERE p.estado NOT IN ${sql(NOT_A_SALE)})::int AS mesas,
             COALESCE(sum(p.total) FILTER (WHERE p.estado NOT IN ${sql(NOT_A_SALE)}), 0)::float8 AS importe,
             count(*) FILTER (WHERE p.estado = ${ORDER_STATUS.Cancelled})::int AS cancelados
      FROM   public.pedidos p
      WHERE  ${where}
    `;
    const rows = await sql`
      SELECT p.id, p.pedido_codigo, p.estado, p.estado_pago, p.metodo_pago, p.total::float8 AS total,
             p.mesa_numero, p.tipo_despacho, s.nombre AS local_nombre,
             p.created_at AT TIME ZONE 'UTC' AS created_at
      FROM   public.pedidos p
      LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
      WHERE  ${where}
      ORDER  BY p.created_at DESC
      LIMIT  ${MAX_ROWS}
    `;
    const total = rows.length;
    return c.json({
      persona: { id: target, nombre: waiter.nombre, activo: waiter.activo },
      resumen: summary,
      pedidos: rows,
      truncado: total >= MAX_ROWS,
    });
  });

  // --------------------------------------------------------- Quién atendió un pedido

  app.get("/:slug/actividad/pedido/:id", async (c) => {
    const restaurant = c.get("restaurant");
    const access = c.get("access");
    const orderId = Number(c.req.param("id"));
    if (!Number.isSafeInteger(orderId) || orderId < 1) return fail(c, 400, API_ERROR.InvalidBody);

    const [order] = await sql<
      {
        id: number;
        pedido_codigo: string | null;
        estado: string;
        tipo_despacho: string | null;
        sucursal_id: number | null;
        mesero_id: number | null;
        mesa_numero: string | null;
        repartidor_id: number | null;
        repartidor_nombre: string | null;
        asignado_por: string | null;
        asignado_at: string | null;
        salida_at: string | null;
        entregado_at: string | null;
        mesero_nombre: string | null;
        mesero_membership_id: number | null;
        fotos_entrega: number;
      }[]
    >`
      SELECT p.id, p.pedido_codigo, p.estado, p.tipo_despacho, p.sucursal_id::int AS sucursal_id,
             p.mesero_id, p.mesa_numero,
             pr.membership_id::int AS repartidor_id,
             (SELECT COALESCE(m.apodo, m.nombre, m.email) FROM public.local_memberships m
              WHERE m.id = pr.membership_id) AS repartidor_nombre,
             pr.asignado_por, pr.asignado_at, pr.salida_at, pr.entregado_at,
             w.nombre AS mesero_nombre, w.membership_id::int AS mesero_membership_id,
             (SELECT count(*)::int FROM public.pedido_foto_entrega f WHERE f.pedido_id = p.id)
               AS fotos_entrega
      FROM   public.pedidos p
      LEFT   JOIN public.pedido_reparto pr ON pr.pedido_id = p.id
      LEFT   JOIN public.meseros w         ON w.id = p.mesero_id
      WHERE  p.id = ${orderId} AND p.restaurante_id = ${restaurant.id}
    `;
    if (!order) return fail(c, 404, API_ERROR.OrderNotFound);

    const me = await ownMembership(sql, restaurant.id, c.get("user").userId);
    const manager =
      can(access, PERMISSION.TeamManage) ||
      (order.tipo_despacho === FULFILLMENT.Delivery && can(access, PERMISSION.DeliveryAssign)) ||
      (order.mesero_id !== null && can(access, PERMISSION.TablesManage));
    const own = me !== null && (order.repartidor_id === me || order.mesero_membership_id === me);
    // Un gestor solo ve pedidos de los locales de su alcance; la persona del pedido, el suyo.
    if (!own && !(manager && canAccessBranch(access, order.sucursal_id))) {
      return fail(c, 404, API_ERROR.OrderNotFound);
    }

    const log = await sql`
      SELECT estado_anterior, estado_nuevo, origen, actor, motivo,
             created_at AT TIME ZONE 'UTC' AS created_at
      FROM   public.pedido_estado_log
      WHERE  pedido_id = ${orderId} AND restaurante_id = ${restaurant.id}
      ORDER  BY created_at, id
    `;
    return c.json({
      pedido: { id: order.id, codigo: order.pedido_codigo, estado: order.estado },
      repartidor:
        order.repartidor_id === null
          ? null
          : {
              membership_id: order.repartidor_id,
              nombre: order.repartidor_nombre,
              asignado_por: order.asignado_por,
              asignado_at: order.asignado_at,
              salida_at: order.salida_at,
              entregado_at: order.entregado_at,
              fotos_entrega: order.fotos_entrega,
            },
      mesero:
        order.mesero_id === null
          ? null
          : { id: order.mesero_id, nombre: order.mesero_nombre, mesa: order.mesa_numero },
      historial: log,
    });
  });
}
