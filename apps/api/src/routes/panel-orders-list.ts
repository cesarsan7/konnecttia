import { branchFilter, PERMISSION } from "@konnecttia/access";
import { FULFILLMENT, isOrderStatus, ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import type { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { canSeeMemberEmails } from "../lib/member-name";
import { requirePermission } from "../middleware/auth";
import { parseReportRange } from "../repositories/reports";

/**
 * Historial de pedidos para la vista «Tabla» del panel (orders.view): filtros, orden y páginas en
 * el servidor. El tablero (kanban) sigue usando GET /:slug/orders?vista=tablero.
 *
 * Filtros (todos opcionales; las listas van separadas por comas):
 *   desde, hasta  días del restaurante (YYYY-MM-DD), máximo 366 días
 *   estado        estados o «activos» (en marcha)
 *   tipo          retiro | delivery | mesa
 *   canal         web | whatsapp | telefono | mostrador | …
 *   pago          estado del cobro: no_aplica | pendiente | pagado | rechazado
 *   metodo        efectivo | tarjeta | …
 *   local         id de local (debe ser de los del usuario)
 *   mesero        id de `meseros` (entero positivo)
 *   repartidor    membership_id del repartidor asignado en `pedido_reparto` (entero positivo)
 *   q             código, nombre o teléfono
 *   orden, dir    fecha | codigo | cliente | estado | total | tipo ; asc | desc
 *   pagina        desde 1
 */

export const ORDERS_PAGE_SIZE = 50;

const ACTIVE = "activos";
const ACTIVE_STATES = [
  ORDER_STATUS.Received,
  ORDER_STATUS.PendingPayment,
  ORDER_STATUS.Confirmed,
  ORDER_STATUS.Paid,
  ORDER_STATUS.Preparing,
  ORDER_STATUS.Ready,
  ORDER_STATUS.OnTheWay,
];
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];
const FULFILLMENTS = new Set<string>(Object.values(FULFILLMENT));
const PAYMENT_STATES = new Set<string>(Object.values(PAYMENT_STATUS));
const TOKEN = /^[a-z_]{2,30}$/;

export const ORDER_SORT = {
  fecha: "p.created_at",
  codigo: "p.pedido_codigo",
  cliente: "lower(COALESCE(p.nombre_pedido, ''))",
  estado: "p.estado",
  total: "p.total",
  tipo: "p.tipo_despacho",
} as const;
type SortKey = keyof typeof ORDER_SORT;

/** Id entero positivo opcional: undefined si no viene, null si no es válido. */
export function parsePositiveId(raw: string | undefined): number | null | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  if (!/^[0-9]{1,15}$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/** Lista separada por comas, sin vacíos ni repetidos. null si algún valor no es válido. */
export function parseList(
  raw: string | undefined,
  valid: (value: string) => boolean,
): string[] | null {
  if (raw === undefined || raw.trim() === "") return [];
  const values = [
    ...new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  return values.length <= 20 && values.every(valid) ? values : null;
}

export function registerOrderListRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  app.get("/:slug/orders/historial", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const restaurant = c.get("restaurant");
    const query = (name: string) => c.req.query(name);
    const invalid = (field: string) => fail(c, 400, API_ERROR.InvalidBody, { field });

    // Fechas: o las dos o ninguna.
    const desde = query("desde");
    const hasta = query("hasta");
    const range = desde || hasta ? parseReportRange(desde, hasta) : null;
    if ((desde || hasta) && !range) return invalid("desde");

    const estadoRaw = query("estado");
    const onlyActive = estadoRaw === ACTIVE;
    const estados = onlyActive ? [] : parseList(estadoRaw, isOrderStatus);
    if (estados === null) return invalid("estado");
    const tipos = parseList(query("tipo"), (value) => FULFILLMENTS.has(value));
    if (tipos === null) return invalid("tipo");
    const canales = parseList(query("canal"), (value) => TOKEN.test(value));
    if (canales === null) return invalid("canal");
    const pagos = parseList(query("pago"), (value) => PAYMENT_STATES.has(value));
    if (pagos === null) return invalid("pago");
    const metodos = parseList(query("metodo"), (value) => TOKEN.test(value));
    if (metodos === null) return invalid("metodo");

    const localRaw = query("local");
    const requested = localRaw === undefined ? null : Number(localRaw);
    if (requested !== null && (!Number.isSafeInteger(requested) || requested < 1)) {
      return invalid("local");
    }
    const branches = branchFilter(c.get("access"), requested);
    if (branches !== null && branches.length === 0) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_out_of_scope" });
    }

    const mesero = parsePositiveId(query("mesero"));
    if (mesero === null) return invalid("mesero");
    const repartidor = parsePositiveId(query("repartidor"));
    if (repartidor === null) return invalid("repartidor");

    const search = query("q")?.trim().slice(0, 60) || null;
    const pattern = search ? `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const digits = search?.replace(/[^0-9]/g, "") ?? "";

    const ordenRaw = query("orden") ?? "fecha";
    if (!Object.hasOwn(ORDER_SORT, ordenRaw)) return invalid("orden");
    const orden = ordenRaw as SortKey;
    const dir = query("dir") === "asc" ? sql`ASC` : sql`DESC`;
    const pagina = Math.max(1, Number.parseInt(query("pagina") ?? "1", 10) || 1);
    const tz = restaurant.zonaHoraria;

    const where = sql`
      p.restaurante_id = ${restaurant.id}
      AND p.estado <> ${ORDER_STATUS.InCart}
      ${
        range
          ? sql`AND p.created_at >= ((${range.desde}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
                AND p.created_at < ((${range.hasta}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'`
          : sql``
      }
      ${onlyActive ? sql`AND p.estado IN ${sql(ACTIVE_STATES)}` : sql``}
      ${estados.length > 0 ? sql`AND p.estado IN ${sql(estados)}` : sql``}
      ${tipos.length > 0 ? sql`AND p.tipo_despacho IN ${sql(tipos)}` : sql``}
      ${canales.length > 0 ? sql`AND p.canal IN ${sql(canales)}` : sql``}
      ${pagos.length > 0 ? sql`AND p.estado_pago IN ${sql(pagos)}` : sql``}
      ${metodos.length > 0 ? sql`AND p.metodo_pago IN ${sql(metodos)}` : sql``}
      ${branches === null ? sql`` : sql`AND p.sucursal_id IN ${sql(branches)}`}
      ${mesero === undefined ? sql`` : sql`AND p.mesero_id = ${mesero}`}
      ${
        repartidor === undefined
          ? sql``
          : sql`AND EXISTS (SELECT 1 FROM public.pedido_reparto prf
                            WHERE prf.pedido_id = p.id AND prf.membership_id = ${repartidor})`
      }
      ${
        pattern
          ? sql`AND (p.pedido_codigo ILIKE ${pattern} OR p.nombre_pedido ILIKE ${pattern}
                     ${digits.length >= 3 ? sql`OR regexp_replace(p.telefono, '[^0-9]', '', 'g') LIKE ${`%${digits}%`}` : sql``})`
          : sql``
      }
    `;

    const [rows, [summary]] = await Promise.all([
      sql`
        SELECT p.id, p.pedido_codigo, p.estado, p.estado_pago, p.tipo_despacho, p.canal,
               p.nombre_pedido, p.telefono, p.direccion, p.items, p.subtotal, p.costo_envio,
               p.total, p.metodo_pago, p.tiempo_estimado, p.notas,
               p.created_at AT TIME ZONE 'UTC' AS created_at,
               p.updated_at AT TIME ZONE 'UTC' AS updated_at,
               p.sucursal_id, s.nombre AS local_nombre, p.mesa_id, me.nombre AS mesa_nombre, p.mesero_id, mw.nombre AS mesero_nombre,
               pr.membership_id::int AS repartidor_id, pr.repartidor_email,
               COALESCE(dm.apodo, dm.nombre) AS repartidor_nombre,
               pr.salida_at, pr.entregado_at,
               (SELECT count(*)::int FROM public.pedido_foto_entrega f WHERE f.pedido_id = p.id)
                 AS fotos_entrega
        FROM   public.pedidos p
        LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
        LEFT   JOIN public.mesa me    ON me.id = p.mesa_id
        LEFT   JOIN public.meseros mw ON mw.id = p.mesero_id AND mw.restaurante_id = p.restaurante_id
        LEFT   JOIN public.pedido_reparto pr ON pr.pedido_id = p.id
        LEFT   JOIN public.local_memberships dm ON dm.id = pr.membership_id
        WHERE  ${where}
        ORDER  BY ${sql.unsafe(ORDER_SORT[orden])} ${dir} NULLS LAST, p.id ${dir}
        LIMIT  ${ORDERS_PAGE_SIZE} OFFSET ${(pagina - 1) * ORDERS_PAGE_SIZE}
      `,
      sql<{ total: number; importe: string | null }[]>`
        SELECT count(*)::int AS total,
               sum(p.total) FILTER (WHERE p.estado NOT IN ${sql(NOT_A_SALE)}) AS importe
        FROM   public.pedidos p
        WHERE  ${where}
      `,
    ]);
    // El email del repartidor solo lo ven quienes pueden ver el equipo; el resto ve su nombre.
    const emails = canSeeMemberEmails(c.get("access"));
    return c.json({
      pedidos: emails ? rows : rows.map((row) => ({ ...row, repartidor_email: null })),
      total: summary?.total ?? 0,
      importe: Number(summary?.importe ?? 0),
      pagina,
      por_pagina: ORDERS_PAGE_SIZE,
    });
  });
}
