import { ALL_BRANCHES, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";

/**
 * Clientes del restaurante (customers.view / customers.export). Un cliente es una fila de
 * `usuarios` (la crean la web, el pedido manual y n8n por teléfono). Las cifras salen de
 * `pedidos` (mismo restaurante y teléfono), sin contar carritos, cancelados ni caducados.
 * Un usuario limitado a unos locales solo ve clientes con pedidos en ellos y solo esos pedidos.
 * No se expone `usuarios.contexto` (memoria del agente).
 * Borrar los datos de un cliente (customers.delete) anonimiza su perfil y sus pedidos; ver
 * `anonymizeCustomer`.
 */

type Ctx = Context<AppEnv>;

const PAGE_SIZE = 50;
const HISTORY_SIZE = 50;
const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];
/** Estados en los que el pedido ya no se toca: solo con todos así se pueden borrar los datos. */
const CLOSED_ORDER = [ORDER_STATUS.Delivered, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];
/** Marcador del teléfono de un perfil anonimizado (`usuarios.telefono` es NOT NULL y único). */
const ANONYMIZED_PHONE_PREFIX = "anonimizado-";
/** Tope del motivo (nota interna) al bloquear a un cliente; coincide con la tabla. */
const MAX_BLOCK_REASON = 300;
const blockBodySchema = z.object({
  motivo: z.string().trim().max(MAX_BLOCK_REASON).optional(),
});
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
    onlyBlocked = false,
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
        bloqueado: boolean;
        acepta_promociones: boolean | null;
        total_filas: number;
      }[]
    >`
      SELECT u.id, u.nombre, u.telefono, u.direccion_frecuente,
             u.created_at AS creado, (b.id IS NOT NULL) AS bloqueado,
             u.acepta_promociones,
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
      LEFT   JOIN public.cliente_bloqueado b
             ON b.restaurante_id = u.restaurante_id
            AND b.telefono = public.fn_telefono_normalizado(u.telefono)
      WHERE  u.restaurante_id = ${restauranteId}
        AND  u.anonimizado_at IS NULL
        ${onlyBlocked ? sql`AND b.id IS NOT NULL` : sql``}
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
      c.req.query("bloqueados") === "1",
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
        "acepta_promociones",
        "bloqueado",
      ];
      const lines = rows.map((row) =>
        [
          row.nombre,
          row.telefono,
          row.direccion_frecuente,
          row.pedidos,
          Number(row.gastado).toFixed(2),
          row.ultimo_pedido,
          row.acepta_promociones ? "Sí" : "No",
          row.bloqueado ? "Sí" : "No",
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
        acepta_promociones: boolean | null;
        acepta_promociones_at: string | null;
      }[]
    >`
      SELECT id, nombre, telefono, direccion_frecuente, created_at AS creado,
             acepta_promociones, acepta_promociones_at
      FROM   public.usuarios
      WHERE  id = ${id} AND restaurante_id = ${restauranteId} AND anonimizado_at IS NULL
    `;
    if (!customer) return fail(c, 404, API_ERROR.NotFound);
    const [block] = await sql<{ motivo: string | null; created_at: string }[]>`
      SELECT motivo, created_at FROM public.cliente_bloqueado
      WHERE  restaurante_id = ${restauranteId}
        AND  telefono = public.fn_telefono_normalizado(${customer.telefono})
    `;
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
      bloqueo: block ? { motivo: block.motivo, desde: block.created_at } : null,
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
  /**
   * Cliente visible para el usuario: de este restaurante, sin anonimizar y, si está limitado a
   * unos locales, con pedidos en ellos (igual que la ficha). Devuelve su teléfono.
   */
  const visibleCustomer = async (c: Ctx, id: number) => {
    const [customer] = await sql<{ telefono: string }[]>`
      SELECT u.telefono FROM public.usuarios u
      WHERE  u.id = ${id} AND u.restaurante_id = ${c.get("restaurant").id}
        AND  u.anonimizado_at IS NULL
        ${
          limited(c)
            ? sql`AND EXISTS (
                SELECT 1 FROM public.pedidos p
                WHERE  p.restaurante_id = u.restaurante_id AND p.telefono = u.telefono
                  ${branchClause(c)}
              )`
            : sql``
        }
    `;
    return customer ?? null;
  };

  // Bloquear el teléfono: sus pedidos web se rechazan sin decirle por qué (pieza Q, antifraude).
  // El bloqueo vale para todo el restaurante, no solo para los locales del usuario.
  app.put(
    "/:slug/clientes/:id/bloqueo",
    requirePermission(deps, PERMISSION.CustomersBlock),
    async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id) || id < 1) return fail(c, 400, API_ERROR.InvalidBody);
      const parsed = blockBodySchema.safeParse((await c.req.json().catch(() => ({}))) ?? {});
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const customer = await visibleCustomer(c, id);
      if (!customer) return fail(c, 404, API_ERROR.NotFound);
      const restauranteId = c.get("restaurant").id;
      const reason = parsed.data.motivo || null;
      const [saved] = await sql<{ motivo: string | null; created_at: string }[]>`
        INSERT INTO public.cliente_bloqueado (restaurante_id, telefono, motivo, bloqueado_por)
        VALUES (
          ${restauranteId}, public.fn_telefono_normalizado(${customer.telefono}), ${reason},
          ${c.get("user").userId}
        )
        ON CONFLICT (restaurante_id, telefono)
        DO UPDATE SET motivo = EXCLUDED.motivo, bloqueado_por = EXCLUDED.bloqueado_por
        RETURNING motivo, created_at
      `;
      // Sin teléfono ni motivo en el detalle: la auditoría es inmutable.
      await audit(sql, {
        restauranteId,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: PERMISSION.CustomersBlock,
        recursoTipo: "cliente",
        recursoId: String(id),
        resultado: "ok",
        detalle: { operacion: "bloquear", con_motivo: reason !== null },
        requestId: c.get("requestId"),
      });
      return c.json({
        ok: true,
        bloqueo: { motivo: saved?.motivo ?? null, desde: saved?.created_at },
      });
    },
  );

  app.delete(
    "/:slug/clientes/:id/bloqueo",
    requirePermission(deps, PERMISSION.CustomersBlock),
    async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id) || id < 1) return fail(c, 400, API_ERROR.InvalidBody);
      const customer = await visibleCustomer(c, id);
      if (!customer) return fail(c, 404, API_ERROR.NotFound);
      const restauranteId = c.get("restaurant").id;
      await sql`
        DELETE FROM public.cliente_bloqueado
        WHERE  restaurante_id = ${restauranteId}
          AND  telefono = public.fn_telefono_normalizado(${customer.telefono})
      `;
      await audit(sql, {
        restauranteId,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: PERMISSION.CustomersBlock,
        recursoTipo: "cliente",
        recursoId: String(id),
        resultado: "ok",
        detalle: { operacion: "desbloquear" },
        requestId: c.get("requestId"),
      });
      return c.json({ ok: true });
    },
  );

  // Borrar los datos del cliente que lo pide: anonimiza el perfil y sus pedidos (no los elimina).
  app.delete(
    "/:slug/clientes/:id",
    requirePermission(deps, PERMISSION.CustomersDelete),
    async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id) || id < 1) return fail(c, 400, API_ERROR.InvalidBody);
      const access = c.get("access");
      const restauranteId = c.get("restaurant").id;
      const result = await sql.begin(async (tx) => {
        const [customer] = await tx<{ telefono: string }[]>`
          SELECT telefono FROM public.usuarios
          WHERE  id = ${id} AND restaurante_id = ${restauranteId} AND anonimizado_at IS NULL
          FOR UPDATE
        `;
        if (!customer) return { ok: false, status: 404, reason: null } as const;
        const orders = await tx<
          {
            id: number;
            estado: string | null;
            sucursal_id: number | null;
            chatwoot_conversation_id: string | null;
          }[]
        >`
          SELECT id, estado, sucursal_id, chatwoot_conversation_id
          FROM   public.pedidos
          WHERE  restaurante_id = ${restauranteId}
            AND  (usuario_id = ${id} OR telefono = ${customer.telefono})
          FOR UPDATE
        `;
        if (limited(c)) {
          const inScope = (order: { sucursal_id: number | null }) =>
            order.sucursal_id !== null && canAccessBranch(access, order.sucursal_id);
          // Igual que en la ficha: sin pedidos en sus locales, el cliente no existe para él.
          if (!orders.some(inScope)) return { ok: false, status: 404, reason: null } as const;
          // Borrar el perfil afectaría a pedidos de locales que no gestiona.
          if (!orders.every(inScope)) {
            return { ok: false, status: 403, reason: "customer_out_of_scope" } as const;
          }
        }
        // Un pedido vivo lo sigue usando el local (o el agente): se borra cuando termine.
        if (orders.some((order) => !CLOSED_ORDER.some((state) => state === order.estado))) {
          return { ok: false, status: 409, reason: "open_orders" } as const;
        }
        const anonymized = await anonymizeCustomer(tx, {
          restauranteId,
          usuarioId: id,
          telefono: customer.telefono,
          pedidoIds: orders.map((order) => order.id),
          conversationIds: orders.flatMap((order) =>
            order.chatwoot_conversation_id ? [order.chatwoot_conversation_id] : [],
          ),
        });
        // Sin datos personales en el detalle: la auditoría es inmutable.
        await audit(tx as unknown as Sql, {
          restauranteId,
          actorTipo: "usuario",
          actorId: c.get("user").userId,
          accion: PERMISSION.CustomersDelete,
          recursoTipo: "cliente",
          recursoId: String(id),
          resultado: "ok",
          detalle: { pedidos: anonymized.pedidos },
          requestId: c.get("requestId"),
        });
        return { ok: true, pedidos: anonymized.pedidos } as const;
      });
      if (!result.ok) {
        const status = result.status;
        return status === 404
          ? fail(c, 404, API_ERROR.NotFound)
          : status === 403
            ? fail(c, 403, API_ERROR.Forbidden, { reason: result.reason })
            : fail(c, 409, API_ERROR.Conflict, { reason: result.reason });
      }
      return c.json({ ok: true, pedidos_anonimizados: result.pedidos });
    },
  );
}

type Tx = Parameters<Parameters<Sql["begin"]>[1]>[0];

/**
 * Anonimiza a un cliente sin romper lo que lee n8n ni los importes del restaurante:
 * - `usuarios`: sin nombre, direcciones ni contexto; el teléfono (NOT NULL y único) pasa a un
 *   marcador y se registra que ya no acepta promociones. Queda `anonimizado_at`.
 * - `pedidos`: conservan importes, estado y fechas; pierden nombre, teléfono (cadena vacía, como
 *   en mesa), dirección, coordenadas, notas y las notas de cada línea. `session_id` pasa a un
 *   marcador por pedido (la unicidad con `pedido_numero` se mantiene).
 * - Memoria del agente de ese teléfono (`contexto`, historial de chat, escalaciones).
 */
async function anonymizeCustomer(
  tx: Tx,
  input: {
    readonly restauranteId: number;
    readonly usuarioId: number;
    readonly telefono: string;
    readonly pedidoIds: readonly number[];
    readonly conversationIds: readonly string[];
  },
): Promise<{ pedidos: number }> {
  const { restauranteId, usuarioId, telefono, pedidoIds, conversationIds } = input;
  if (pedidoIds.length > 0) {
    await tx`
      UPDATE public.pedidos
      SET    telefono = '', nombre_pedido = NULL, direccion = NULL, lat = NULL, lng = NULL,
             notas = NULL, chatwoot_conversation_id = NULL,
             session_id = ${ANONYMIZED_PHONE_PREFIX} || id::text,
             items = CASE WHEN jsonb_typeof(items) = 'array' THEN COALESCE((
                 SELECT jsonb_agg(CASE WHEN jsonb_typeof(line) = 'object' THEN line - 'nota' ELSE line END)
                 FROM   jsonb_array_elements(items) AS line
               ), '[]'::jsonb) ELSE items END
      WHERE  restaurante_id = ${restauranteId} AND id IN ${tx([...pedidoIds])}
    `;
  }
  await tx`
    UPDATE public.usuarios
    SET    nombre = NULL, direccion_frecuente = NULL, lat_frecuente = NULL, long_frecuente = NULL,
           contexto = NULL, telefono = ${ANONYMIZED_PHONE_PREFIX} || id::text,
           acepta_promociones = false, acepta_promociones_at = now(),
           anonimizado_at = now(), updated_at = now()
    WHERE  id = ${usuarioId} AND restaurante_id = ${restauranteId}
  `;
  // El bloqueo antifraude se conserva (interés legítimo: prevenir fraude), con el mínimo de datos:
  // el teléfono normalizado y la fecha; el motivo, que puede describir a la persona, se borra.
  // Si vuelve a pedir desde el panel, su nueva ficha aparece como bloqueada y se puede desbloquear.
  await tx`
    UPDATE public.cliente_bloqueado
    SET    motivo = NULL
    WHERE  restaurante_id = ${restauranteId}
      AND  telefono = public.fn_telefono_normalizado(${telefono})
  `;
  await tx`
    DELETE FROM public.contexto WHERE restaurante_id = ${restauranteId} AND telefono = ${telefono}
  `;
  await tx`
    UPDATE public.escalaciones
    SET    telefono = '', problema = NULL, contexto = NULL, conversation_id = NULL,
           contact_id = NULL, account_id = NULL
    WHERE  restaurante_id = ${restauranteId} AND telefono = ${telefono}
  `;
  if (conversationIds.length > 0) {
    // El historial del agente usa el id de conversación de Chatwoot, con o sin prefijo de tenant.
    const sessions = conversationIds.flatMap((conversation) => [
      conversation,
      `${restauranteId}_${conversation}`,
    ]);
    await tx`
      DELETE FROM public.n8n_chat_histories
      WHERE  restaurante_id = ${restauranteId} AND session_id IN ${tx(sessions)}
    `;
  }
  return { pedidos: pedidoIds.length };
}
