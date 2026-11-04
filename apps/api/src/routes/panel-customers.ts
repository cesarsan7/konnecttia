import { ALL_BRANCHES, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";

/**
 * Clientes del restaurante (customers.view / customers.export). Un cliente es una fila de
 * `usuarios` (la crean la web, el pedido manual y n8n por teléfono). Las cifras salen de
 * `pedidos` (mismo restaurante y teléfono), sin contar carritos, cancelados ni caducados.
 * Un usuario limitado a unos locales solo ve clientes con pedidos en ellos y solo esos pedidos.
 * No se expone `usuarios.contexto` (memoria del agente).
 */

type Ctx = Context<AppEnv>;

const PAGE_SIZE = 50;
const HISTORY_SIZE = 50;
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];
const SORT = { Recent: "recientes", Orders: "pedidos", Spent: "gasto" } as const;
type Sort = (typeof SORT)[keyof typeof SORT];

/** Evita que una celda del CSV se interprete como fórmula al abrirla en Excel. */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function registerCustomerRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  /** Filtro de pedidos por los locales del usuario (fragmento SQL sobre el alias p). */
  const branchClause = (c: Ctx) => {
    const scope = c.get("access").branchScope;
    return scope === ALL_BRANCHES ? sql`` : sql`AND p.sucursal_id IN ${sql([...scope])}`;
  };
  const limited = (c: Ctx) => c.get("access").branchScope !== ALL_BRANCHES;

  const listQuery = (
    c: Ctx,
    search: string | null,
    sort: Sort,
    limit: number | null,
    offset: number,
  ) => {
    const restauranteId = c.get("restaurant").id;
    const pattern = search ? `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
    const order =
      sort === SORT.Orders
        ? sql`pedidos DESC, ultimo_pedido DESC NULLS LAST`
        : sort === SORT.Spent
          ? sql`gastado DESC, ultimo_pedido DESC NULLS LAST`
          : sql`ultimo_pedido DESC NULLS LAST, u.id DESC`;
    return sql<
      {
        id: number;
        nombre: string | null;
        telefono: string;
        direccion_frecuente: string | null;
        creado: string | null;
        pedidos: number;
        gastado: string;
        ultimo_pedido: string | null;
        total_filas: number;
      }[]
    >`
      SELECT u.id, u.nombre, u.telefono, u.direccion_frecuente,
             u.created_at AS creado,
             COALESCE(s.pedidos, 0)::int AS pedidos,
             COALESCE(s.gastado, 0) AS gastado,
             s.ultimo_pedido,
             count(*) OVER ()::int AS total_filas
      FROM   public.usuarios u
      LEFT   JOIN LATERAL (
        SELECT count(*) AS pedidos, sum(p.total) AS gastado,
               max(p.created_at) AT TIME ZONE 'UTC' AS ultimo_pedido
        FROM   public.pedidos p
        WHERE  p.restaurante_id = u.restaurante_id AND p.telefono = u.telefono
          AND  p.estado NOT IN ${sql(NOT_A_SALE)}
          ${branchClause(c)}
      ) s ON true
      WHERE  u.restaurante_id = ${restauranteId}
        AND  (${pattern}::text IS NULL OR u.nombre ILIKE ${pattern} OR u.telefono ILIKE ${pattern})
        ${limited(c) ? sql`AND COALESCE(s.pedidos, 0) > 0` : sql``}
      ORDER  BY ${order}
      ${limit === null ? sql`` : sql`LIMIT ${limit} OFFSET ${offset}`}
    `;
  };

  const parseSort = (value: string | undefined): Sort =>
    value === SORT.Orders || value === SORT.Spent ? value : SORT.Recent;

  app.get("/:slug/clientes", requirePermission(deps, PERMISSION.CustomersView), async (c) => {
    const page = Math.max(1, Number.parseInt(c.req.query("pagina") ?? "1", 10) || 1);
    const search = c.req.query("q")?.trim().slice(0, 60) || null;
    const rows = await listQuery(
      c,
      search,
      parseSort(c.req.query("orden")),
      PAGE_SIZE,
      (page - 1) * PAGE_SIZE,
    );
    return c.json({
      clientes: rows.map(({ total_filas: _, gastado, ...row }) => ({
        ...row,
        gastado: Number(gastado),
      })),
      total: rows[0]?.total_filas ?? 0,
      pagina: page,
      por_pagina: PAGE_SIZE,
    });
  });

  app.get(
    "/:slug/clientes/exportar",
    requirePermission(deps, PERMISSION.CustomersExport),
    async (c) => {
      const rows = await listQuery(c, null, SORT.Recent, null, 0);
      const header = [
        "nombre",
        "telefono",
        "direccion_frecuente",
        "pedidos",
        "gastado_eur",
        "ultimo_pedido",
      ];
      const lines = rows.map((row) =>
        [
          row.nombre,
          row.telefono,
          row.direccion_frecuente,
          row.pedidos,
          Number(row.gastado).toFixed(2),
          row.ultimo_pedido,
        ]
          .map(csvCell)
          .join(";"),
      );
      await audit(sql, {
        restauranteId: c.get("restaurant").id,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: PERMISSION.CustomersExport,
        recursoTipo: "clientes",
        recursoId: null,
        resultado: "ok",
        detalle: { filas: rows.length },
        requestId: c.get("requestId"),
      });
      // BOM para que Excel abra bien las tildes; separador «;» (configuración regional española).
      return new Response(`﻿${[header.join(";"), ...lines].join("\r\n")}\r\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="clientes-${c.get("restaurant").slug}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    },
  );

  app.get("/:slug/clientes/:id", requirePermission(deps, PERMISSION.CustomersView), async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) return fail(c, 400, API_ERROR.InvalidBody);
    const restauranteId = c.get("restaurant").id;
    const [customer] = await sql<
      {
        id: number;
        nombre: string | null;
        telefono: string;
        direccion_frecuente: string | null;
        creado: string | null;
      }[]
    >`
      SELECT id, nombre, telefono, direccion_frecuente, created_at AS creado
      FROM   public.usuarios
      WHERE  id = ${id} AND restaurante_id = ${restauranteId}
    `;
    if (!customer) return fail(c, 404, API_ERROR.NotFound);
    const orders = await sql<
      {
        id: number;
        pedido_codigo: string | null;
        estado: string;
        canal: string;
        tipo_despacho: string | null;
        total: string;
        metodo_pago: string | null;
        items: unknown;
        created_at: string;
        local_nombre: string | null;
      }[]
    >`
      SELECT p.id, p.pedido_codigo, p.estado, p.canal, p.tipo_despacho, p.total, p.metodo_pago,
             p.items, p.created_at AT TIME ZONE 'UTC' AS created_at, s.nombre AS local_nombre
      FROM   public.pedidos p
      LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
      WHERE  p.restaurante_id = ${restauranteId} AND p.telefono = ${customer.telefono}
        AND  p.estado <> ${ORDER_STATUS.InCart}
        ${branchClause(c)}
      ORDER  BY p.created_at DESC
      LIMIT  ${HISTORY_SIZE}
    `;
    if (limited(c) && orders.length === 0) return fail(c, 404, API_ERROR.NotFound);
    const [summary] = await sql<
      {
        pedidos: number;
        gastado: string | null;
        primer_pedido: string | null;
        ultimo_pedido: string | null;
      }[]
    >`
      SELECT count(*)::int AS pedidos, sum(p.total) AS gastado,
             min(p.created_at) AT TIME ZONE 'UTC' AS primer_pedido,
             max(p.created_at) AT TIME ZONE 'UTC' AS ultimo_pedido
      FROM   public.pedidos p
      WHERE  p.restaurante_id = ${restauranteId} AND p.telefono = ${customer.telefono}
        AND  p.estado NOT IN ${sql(NOT_A_SALE)}
        ${branchClause(c)}
    `;
    const count = summary?.pedidos ?? 0;
    const spent = Number(summary?.gastado ?? 0);
    const sales = orders.filter(
      (order) => !NOT_A_SALE.includes(order.estado as (typeof NOT_A_SALE)[number]),
    );
    // Productos que más pide (en sus últimos pedidos), a partir de la copia de líneas del pedido.
    const favorites = new Map<string, number>();
    for (const order of sales) {
      if (!Array.isArray(order.items)) continue;
      for (const line of order.items as { item_name?: unknown; quantity?: unknown }[]) {
        if (typeof line.item_name !== "string") continue;
        const quantity = typeof line.quantity === "number" ? line.quantity : 1;
        favorites.set(line.item_name, (favorites.get(line.item_name) ?? 0) + quantity);
      }
    }
    return c.json({
      cliente: customer,
      resumen: {
        pedidos: count,
        gastado: Math.round(spent * 100) / 100,
        ticket_medio: count === 0 ? 0 : Math.round((spent / count) * 100) / 100,
        primer_pedido: summary?.primer_pedido ?? null,
        ultimo_pedido: summary?.ultimo_pedido ?? null,
      },
      favoritos: [...favorites.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([nombre, cantidad]) => ({ nombre, cantidad })),
      pedidos: orders.map(({ items: _, total, ...order }) => ({ ...order, total: Number(total) })),
    });
  });
}
