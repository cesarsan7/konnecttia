import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import type { Restaurant } from "./restaurants";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const MAX_REPORT_DAYS = 366;
const TOP_PRODUCTS = 10;

/** Estados que no cuentan como venta. */
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

export type ReportRange = {
  readonly desde: string;
  readonly hasta: string;
  /** Periodo anterior de la misma duración, para comparar. */
  readonly anteriorDesde: string;
  readonly anteriorHasta: string;
  readonly dias: number;
};

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Valida un rango de fechas (ambas incluidas, máximo un año) y calcula el periodo anterior. */
export function parseReportRange(
  desde: string | undefined,
  hasta: string | undefined,
): ReportRange | null {
  if (!desde || !hasta || !DATE_PATTERN.test(desde) || !DATE_PATTERN.test(hasta)) return null;
  const from = Date.parse(`${desde}T00:00:00Z`);
  const to = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  // Date.parse acepta «2026-02-31»: se exige que la fecha exista.
  if (isoDate(from) !== desde || isoDate(to) !== hasta) return null;
  const dias = (to - from) / DAY_MS + 1;
  if (dias > MAX_REPORT_DAYS) return null;
  return {
    desde,
    hasta,
    anteriorDesde: isoDate(from - dias * DAY_MS),
    anteriorHasta: isoDate(from - DAY_MS),
    dias,
  };
}

type Totals = {
  ventas: number;
  pedidos: number;
  ticket_medio: number;
  cancelados: number;
  pendientes_pago: number;
  clientes: number;
};

/**
 * Resumen de ventas de un periodo. Las fechas y horas son las del restaurante
 * (`restaurante.zona_horaria`); en la base se guardan en UTC.
 */
export async function loadSalesOverview(
  sql: Sql,
  restaurant: Restaurant,
  range: ReportRange,
  branches: readonly number[] | null,
) {
  const tz = restaurant.zonaHoraria;
  // Límites del periodo en UTC, para que la consulta use el índice por fecha.
  const bounds = (desde: string, hasta: string) => sql`
    p.created_at >= ((${desde}::date)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
    AND p.created_at < ((${hasta}::date + 1)::timestamp AT TIME ZONE ${tz}) AT TIME ZONE 'UTC'
  `;
  const scope = (from: string, to: string) => sql`
    p.restaurante_id = ${restaurant.id}
    AND p.estado <> ${ORDER_STATUS.InCart}
    AND ${bounds(from, to)}
    ${branches === null ? sql`` : sql`AND p.sucursal_id IN ${sql(branches)}`}
  `;
  const sale = sql`p.estado NOT IN ${sql(NOT_A_SALE)}`;
  const localTime = sql`((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;

  const totals = (from: string, to: string) => sql<
    {
      ventas: string;
      pedidos: number;
      cancelados: number;
      pendientes_pago: number;
      clientes: number;
    }[]
  >`
    SELECT COALESCE(sum(p.total) FILTER (WHERE ${sale}), 0)                        AS ventas,
           count(*) FILTER (WHERE ${sale})::int                                     AS pedidos,
           count(*) FILTER (WHERE p.estado = ${ORDER_STATUS.Cancelled})::int        AS cancelados,
           count(*) FILTER (WHERE ${sale} AND p.estado_pago = 'pendiente')::int     AS pendientes_pago,
           count(DISTINCT p.telefono) FILTER (WHERE ${sale})::int                   AS clientes
    FROM   public.pedidos p
    WHERE  ${scope(from, to)}
  `;

  const [current, previous, byDay, byHour, products, mix, payments, byBranch] = await Promise.all([
    totals(range.desde, range.hasta),
    totals(range.anteriorDesde, range.anteriorHasta),
    sql<{ fecha: string; ventas: string; pedidos: number }[]>`
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS fecha,
             COALESCE(sum(p.total), 0)    AS ventas,
             count(p.id)::int             AS pedidos
      FROM   generate_series(${range.desde}::date, ${range.hasta}::date, interval '1 day') AS d(dia)
      LEFT   JOIN public.pedidos p
             ON  ${scope(range.desde, range.hasta)} AND ${sale}
             AND ${localTime}::date = d.dia::date
      GROUP  BY d.dia
      ORDER  BY d.dia
    `,
    sql<{ hora: number; ventas: string; pedidos: number }[]>`
      SELECT h.hora, COALESCE(sum(p.total), 0) AS ventas, count(p.id)::int AS pedidos
      FROM   generate_series(0, 23) AS h(hora)
      LEFT   JOIN public.pedidos p
             ON  ${scope(range.desde, range.hasta)} AND ${sale}
             AND extract(hour FROM ${localTime})::int = h.hora
      GROUP  BY h.hora
      ORDER  BY h.hora
    `,
    // Los pedidos de la web y los de n8n guardan las líneas con nombres de campo distintos.
    sql<{ nombre: string; cantidad: string; ventas: string }[]>`
      SELECT COALESCE(NULLIF(i->>'item_name', ''), NULLIF(i->>'nombre', ''), NULLIF(i->>'name', ''),
                      'Sin nombre')                                                    AS nombre,
             sum(q.cantidad)                                                           AS cantidad,
             sum(COALESCE(
               CASE WHEN i->>'line_total' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (i->>'line_total')::numeric END,
               CASE WHEN i->>'subtotal'   ~ '^[0-9]+(\\.[0-9]+)?$' THEN (i->>'subtotal')::numeric END,
               q.cantidad * COALESCE(
                 CASE WHEN i->>'unit_price' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (i->>'unit_price')::numeric END,
                 CASE WHEN i->>'precio_unitario' ~ '^[0-9]+(\\.[0-9]+)?$'
                      THEN (i->>'precio_unitario')::numeric END,
                 0)))                                                                 AS ventas
      FROM   public.pedidos p
      CROSS  JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(p.items) = 'array' THEN p.items ELSE '[]'::jsonb END) AS i
      CROSS  JOIN LATERAL (
               SELECT COALESCE(
                 CASE WHEN i->>'quantity' ~ '^[0-9]+$' THEN (i->>'quantity')::int END,
                 CASE WHEN i->>'cantidad' ~ '^[0-9]+$' THEN (i->>'cantidad')::int END,
                 1) AS cantidad) AS q
      WHERE  ${scope(range.desde, range.hasta)} AND ${sale}
      GROUP  BY 1
      ORDER  BY cantidad DESC, ventas DESC, nombre
      LIMIT  ${TOP_PRODUCTS}
    `,
    sql<{ recogida: number; reparto: number; web: number; whatsapp: number; otros: number }[]>`
      SELECT count(*) FILTER (WHERE p.tipo_despacho = 'retiro')::int                AS recogida,
             count(*) FILTER (WHERE p.tipo_despacho = 'delivery')::int              AS reparto,
             count(*) FILTER (WHERE p.canal = 'web')::int                           AS web,
             count(*) FILTER (WHERE p.canal = 'whatsapp')::int                      AS whatsapp,
             count(*) FILTER (WHERE p.canal NOT IN ('web', 'whatsapp'))::int        AS otros
      FROM   public.pedidos p
      WHERE  ${scope(range.desde, range.hasta)} AND ${sale}
    `,
    sql<{ metodo: string; pedidos: number; ventas: string }[]>`
      SELECT COALESCE(NULLIF(p.metodo_pago, ''), 'sin_indicar') AS metodo,
             count(*)::int AS pedidos, sum(p.total) AS ventas
      FROM   public.pedidos p
      WHERE  ${scope(range.desde, range.hasta)} AND ${sale}
      GROUP  BY 1
      ORDER  BY pedidos DESC
    `,
    sql<{ sucursal_id: number; local: string; pedidos: number; ventas: string }[]>`
      SELECT s.id AS sucursal_id, s.nombre AS local,
             count(p.id)::int AS pedidos, COALESCE(sum(p.total), 0) AS ventas
      FROM   public.sucursal s
      LEFT   JOIN public.pedidos p
             ON  p.sucursal_id = s.id AND ${scope(range.desde, range.hasta)} AND ${sale}
      WHERE  s.restaurante_id = ${restaurant.id}
        ${branches === null ? sql`` : sql`AND s.id IN ${sql(branches)}`}
      GROUP  BY s.id, s.nombre, s.es_principal
      ORDER  BY s.es_principal DESC, s.nombre
    `,
  ]);

  const money = (value: string | number) => Math.round(Number(value) * 100) / 100;
  const summarize = (row: (typeof current)[number] | undefined): Totals => {
    const ventas = money(row?.ventas ?? 0);
    const pedidos = row?.pedidos ?? 0;
    return {
      ventas,
      pedidos,
      ticket_medio: pedidos > 0 ? money(ventas / pedidos) : 0,
      cancelados: row?.cancelados ?? 0,
      pendientes_pago: row?.pendientes_pago ?? 0,
      clientes: row?.clientes ?? 0,
    };
  };

  return {
    desde: range.desde,
    hasta: range.hasta,
    anterior: { desde: range.anteriorDesde, hasta: range.anteriorHasta },
    zona_horaria: tz,
    resumen: summarize(current[0]),
    resumen_anterior: summarize(previous[0]),
    por_dia: byDay.map((row) => ({
      fecha: row.fecha,
      ventas: money(row.ventas),
      pedidos: row.pedidos,
    })),
    por_hora: byHour.map((row) => ({
      hora: row.hora,
      ventas: money(row.ventas),
      pedidos: row.pedidos,
    })),
    productos: products.map((row) => ({
      nombre: row.nombre,
      cantidad: Number(row.cantidad),
      ventas: money(row.ventas),
    })),
    despacho: { recogida: mix[0]?.recogida ?? 0, reparto: mix[0]?.reparto ?? 0 },
    canal: { web: mix[0]?.web ?? 0, whatsapp: mix[0]?.whatsapp ?? 0, otros: mix[0]?.otros ?? 0 },
    metodos_pago: payments.map((row) => ({
      metodo: row.metodo,
      pedidos: row.pedidos,
      ventas: money(row.ventas),
    })),
    locales: byBranch.map((row) => ({
      sucursal_id: row.sucursal_id,
      local: row.local,
      pedidos: row.pedidos,
      ventas: money(row.ventas),
    })),
  };
}
