import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadBranches } from "../repositories/branches";
import { CONFIG_KEY, loadConfig } from "../repositories/restaurants";
import { setConfig } from "./panel-settings";

/**
 * Mesas (módulo «tables», plan Premium): tables.view para ver el plano y tables.manage para
 * configurarlo, ocuparlas y liberarlas. Reutiliza las tablas del dashboard antiguo (zona_mesa,
 * mesa) con su sucursal_id (0003). Cada usuario solo ve y gestiona las mesas de sus locales.
 *
 * Ocupación (0013): una mesa se ocupa a mano o al tomar su primer pedido (`ocupada_desde`) y
 * sigue ocupada hasta que el equipo la libera, aunque sus pedidos ya estén entregados: los
 * clientes siguen sentados y pagan al final. Los pedidos de la mesa desde `ocupada_desde` son su
 * cuenta. No se libera una mesa con pedidos en marcha (entregarlos o cancelarlos antes).
 */

type Ctx = Context<AppEnv>;

/** Estados en los que el pedido ya no está en marcha. */
const CLOSED_STATES = [
  ORDER_STATUS.Delivered,
  ORDER_STATUS.Cancelled,
  ORDER_STATUS.Expired,
  ORDER_STATUS.InCart,
];

/** Pedidos que no suman a la cuenta de la mesa. */
const NOT_BILLED = [ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

type TableOrder = {
  id: number;
  codigo: string | null;
  estado: string;
  estado_pago: string;
  metodo_pago: string | null;
  tipo_despacho: string;
  total: number;
  items: unknown;
  desde: string;
  /** Cambios de estado (pedido_estado_log), del más antiguo al más reciente. */
  historial: { estado: string; at: string }[] | null;
};

/** Minutos de aviso guardados en restaurante_config; null = sin aviso. */
export function alertMinutes(value: string | undefined): number | null {
  const minutes = Number.parseInt(value ?? "", 10);
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}

/** Desde cuándo está el pedido en su estado actual (último cambio a ese estado, o su creación). */
export function stateSince(order: Pick<TableOrder, "estado" | "desde" | "historial">): string {
  const changes = order.historial ?? [];
  for (let index = changes.length - 1; index >= 0; index -= 1) {
    const change = changes[index];
    if (change && change.estado === order.estado) return change.at;
  }
  return order.desde;
}

const alertsSchema = z.object({
  espera_minutos: z.number().int().min(1).max(600).nullable(),
  estancia_minutos: z.number().int().min(1).max(1440).nullable(),
});

/** Pedidos en marcha de una mesa (los que impiden liberarla). */
export async function activeTableOrders(
  sql: AppDeps["sql"],
  restauranteId: number,
  mesaId: number,
): Promise<{ id: number; codigo: string | null }[]> {
  return sql<{ id: number; codigo: string | null }[]>`
    SELECT id, pedido_codigo AS codigo FROM public.pedidos
    WHERE  mesa_id = ${mesaId} AND restaurante_id = ${restauranteId}
      AND  estado NOT IN ${sql(CLOSED_STATES)}
    ORDER  BY created_at
  `;
}

/**
 * Marca la mesa como ocupada. Si ya lo estaba, conserva la hora de inicio; si no, empieza en
 * `since` (la hora del pedido que la ocupa) o ahora.
 */
export async function occupyTable(
  sql: AppDeps["sql"],
  restauranteId: number,
  mesaId: number,
  sinceOrderId: number | null = null,
) {
  await sql`
    UPDATE public.mesa
    SET    ocupada_manual = true,
           ocupada_desde  = COALESCE(
             ocupada_desde,
             (SELECT created_at FROM public.pedidos
              WHERE  id = ${sinceOrderId} AND restaurante_id = ${restauranteId}),
             now() AT TIME ZONE 'UTC')
    WHERE  id = ${mesaId} AND restaurante_id = ${restauranteId}
  `;
}

const zoneSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  sucursal_id: z.number().int().positive(),
  activa: z.boolean().default(true),
});

const tableSchema = z.object({
  numero: z.number().int().min(1).max(9999),
  nombre: z
    .string()
    .trim()
    .max(80)
    .default("")
    .transform((value) => value || null),
  capacidad: z.number().int().min(1).max(99).nullable().default(null),
  zona_id: z.number().int().positive().nullable().default(null),
  sucursal_id: z.number().int().positive(),
  activa: z.boolean().default(true),
});

export function registerTableRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    recursoTipo: string,
    recursoId: number | null,
    detalle = {},
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  const visibleBranchIds = async (c: Ctx) =>
    (await loadBranches(sql, c.get("restaurant").id))
      .filter((branch) => canAccessBranch(c.get("access"), branch.id))
      .map((branch) => branch.id);

  /** Fila (zona o mesa) del restaurante y de un local del usuario, o null. */
  const ownRow = async (c: Ctx, table: "zona_mesa" | "mesa", id: number) => {
    const [row] = await sql<{ id: number; sucursal_id: number | null }[]>`
      SELECT id, sucursal_id FROM ${sql(`public.${table}`)}
      WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
    `;
    if (!row || row.sucursal_id === null) return null;
    return (await visibleBranchIds(c)).includes(row.sucursal_id) ? row : null;
  };

  const paramId = (c: Ctx) => {
    const id = Number(c.req.param("id"));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  app.get("/:slug/mesas", requirePermission(deps, PERMISSION.TablesView), async (c) => {
    const restauranteId = c.get("restaurant").id;
    const branches = (await loadBranches(sql, restauranteId)).filter((branch) =>
      canAccessBranch(c.get("access"), branch.id),
    );
    const ids = branches.map((branch) => branch.id);
    const config = await loadConfig(sql, restauranteId);
    const avisos = {
      espera_minutos: alertMinutes(config.get(CONFIG_KEY.TableWaitAlert)),
      estancia_minutos: alertMinutes(config.get(CONFIG_KEY.TableStayAlert)),
    };
    if (ids.length === 0) return c.json({ locales: [], zonas: [], mesas: [], avisos });
    const [zones, tables] = await Promise.all([
      sql<{ id: number; nombre: string; orden: number; activa: boolean; sucursal_id: number }[]>`
        SELECT id, nombre, orden, activa, sucursal_id FROM public.zona_mesa
        WHERE  restaurante_id = ${restauranteId} AND sucursal_id IN ${sql(ids)}
        ORDER  BY orden, nombre
      `,
      sql<
        {
          id: number;
          numero: number;
          nombre: string;
          capacidad: number | null;
          activa: boolean;
          zona_id: number | null;
          sucursal_id: number;
          ocupada_manual: boolean;
          ocupada_desde: string | null;
          mesero_id: number | null;
          mesero_nombre: string | null;
          pedidos: TableOrder[] | null;
        }[]
      >`
        SELECT m.id, m.numero, m.nombre, m.capacidad, m.activa, m.zona_id, m.sucursal_id,
               m.ocupada_manual, m.mesero_id, ms.nombre AS mesero_nombre,
               to_char(m.ocupada_desde, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ocupada_desde,
               -- Cuenta de la mesa: pedidos en marcha y los de la ocupación actual.
               (SELECT json_agg(json_build_object(
                         'id', p.id, 'codigo', p.pedido_codigo, 'estado', p.estado,
                         'estado_pago', p.estado_pago, 'metodo_pago', p.metodo_pago,
                         'tipo_despacho', p.tipo_despacho, 'total', p.total, 'items', p.items,
                         'mesero_nombre', (SELECT w.nombre FROM public.meseros w WHERE w.id = p.mesero_id),
                         'desde', to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                         'historial', (
                           SELECT json_agg(json_build_object(
                                    'estado', l.estado_nuevo,
                                    'at', to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                                  ORDER BY l.created_at)
                           FROM   public.pedido_estado_log l
                           WHERE  l.pedido_id = p.id))
                       ORDER BY p.created_at)
                FROM   public.pedidos p
                WHERE  p.mesa_id = m.id AND p.restaurante_id = ${restauranteId}
                  AND  p.estado <> ${ORDER_STATUS.InCart}
                  AND  (p.estado NOT IN ${sql(CLOSED_STATES)}
                        OR (m.ocupada_desde IS NOT NULL AND p.created_at >= m.ocupada_desde))
               ) AS pedidos
        FROM   public.mesa m
        LEFT   JOIN public.meseros ms ON ms.id = m.mesero_id
        WHERE  m.restaurante_id = ${restauranteId} AND m.sucursal_id IN ${sql(ids)}
        ORDER  BY m.numero
      `,
    ]);
    return c.json({
      avisos,
      locales: branches.map((branch) => ({ id: branch.id, nombre: branch.name })),
      zonas: zones,
      mesas: tables.map(({ pedidos, ...table }) => {
        const orders = (pedidos ?? []).map((order) => ({
          ...order,
          total: Number(order.total),
          historial: order.historial ?? [],
          estado_desde: stateSince(order),
        }));
        const active = orders.filter(
          (order) => !(CLOSED_STATES as readonly string[]).includes(order.estado),
        );
        const billed = orders.filter(
          (order) => !(NOT_BILLED as readonly string[]).includes(order.estado),
        );
        const cents = (list: typeof orders) =>
          list.reduce((sum, order) => sum + Math.round(order.total * 100), 0) / 100;
        return {
          ...table,
          nombre: table.nombre || `Mesa ${table.numero}`,
          ocupada: active.length > 0 || table.ocupada_manual,
          // Inicio de la ocupación: la marca de la mesa o, si no hay, su primer pedido en marcha.
          ocupada_desde: table.ocupada_desde ?? active[0]?.desde ?? null,
          pedidos: orders,
          /** Último pedido en marcha (el que se muestra en el plano). */
          pedido: active.at(-1) ?? null,
          en_marcha: active.length,
          cuenta: cents(billed),
          por_cobrar: cents(billed.filter((order) => order.estado_pago === PAYMENT_STATUS.Pending)),
        };
      }),
    });
  });

  /** Avisos de tiempo del plano (null = sin aviso). */
  app.put("/:slug/mesas/avisos", requirePermission(deps, PERMISSION.TablesManage), async (c) => {
    const parsed = alertsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const restauranteId = c.get("restaurant").id;
    const body = parsed.data;
    await sql.begin(async (tx) => {
      await setConfig(
        tx,
        restauranteId,
        CONFIG_KEY.TableWaitAlert,
        body.espera_minutos === null ? null : String(body.espera_minutos),
        "Aviso de espera en mesas (minutos)",
      );
      await setConfig(
        tx,
        restauranteId,
        CONFIG_KEY.TableStayAlert,
        body.estancia_minutos === null ? null : String(body.estancia_minutos),
        "Aviso de estancia en mesas (minutos)",
      );
    });
    await record(c, "tables.avisos", "restaurante", restauranteId, body);
    return c.json(body);
  });

  // ---------------------------------------------------------------------------------- zonas

  app.post("/:slug/mesas/zonas", requirePermission(deps, PERMISSION.TablesManage), async (c) => {
    const parsed = zoneSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    if (!(await visibleBranchIds(c)).includes(body.sucursal_id))
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    try {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO public.zona_mesa (restaurante_id, nombre, activa, sucursal_id, orden)
        SELECT ${c.get("restaurant").id}, ${body.nombre}, ${body.activa}, ${body.sucursal_id},
               COALESCE(max(orden), 0) + 1
        FROM   public.zona_mesa WHERE restaurante_id = ${c.get("restaurant").id}
        RETURNING id
      `;
      await record(c, "tables.zona.crear", "zona_mesa", row?.id ?? null, body);
      return c.json({ id: row?.id }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
  });

  app.put("/:slug/mesas/zonas/:id", requirePermission(deps, PERMISSION.TablesManage), async (c) => {
    const id = paramId(c);
    const parsed = zoneSchema.safeParse(await c.req.json().catch(() => null));
    if (!id || !parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    if (!(await ownRow(c, "zona_mesa", id))) return fail(c, 404, API_ERROR.NotFound);
    if (!(await visibleBranchIds(c)).includes(body.sucursal_id))
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    try {
      await sql`
        UPDATE public.zona_mesa SET nombre = ${body.nombre}, activa = ${body.activa}, sucursal_id = ${body.sucursal_id}
        WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
      `;
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
    await record(c, "tables.zona.editar", "zona_mesa", id, body);
    return c.json({ id });
  });

  app.delete(
    "/:slug/mesas/zonas/:id",
    requirePermission(deps, PERMISSION.TablesManage),
    async (c) => {
      const id = paramId(c);
      if (!id || !(await ownRow(c, "zona_mesa", id))) return fail(c, 404, API_ERROR.NotFound);
      // Las mesas de la zona quedan sin zona (FK ON DELETE SET NULL).
      await sql`DELETE FROM public.zona_mesa WHERE id = ${id} AND restaurante_id = ${c.get("restaurant").id}`;
      await record(c, "tables.zona.borrar", "zona_mesa", id);
      return c.json({ id });
    },
  );

  // ---------------------------------------------------------------------------------- mesas

  const zoneMatches = async (c: Ctx, zoneId: number | null, branchId: number) => {
    if (zoneId === null) return true;
    const [zone] = await sql<{ sucursal_id: number | null }[]>`
      SELECT sucursal_id FROM public.zona_mesa
      WHERE  id = ${zoneId} AND restaurante_id = ${c.get("restaurant").id}
    `;
    return zone?.sucursal_id === branchId;
  };

  const saveTable = (mode: "create" | "update") => async (c: Ctx) => {
    const id = mode === "update" ? paramId(c) : null;
    const parsed = tableSchema.safeParse(await c.req.json().catch(() => null));
    if ((mode === "update" && !id) || !parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    if (!(await visibleBranchIds(c)).includes(body.sucursal_id))
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    if (!(await zoneMatches(c, body.zona_id, body.sucursal_id))) {
      return fail(c, 400, API_ERROR.InvalidBody, { reason: "zone_other_branch" });
    }
    if (id !== null && !(await ownRow(c, "mesa", id))) return fail(c, 404, API_ERROR.NotFound);
    const restauranteId = c.get("restaurant").id;
    const name = body.nombre ?? `Mesa ${body.numero}`;
    try {
      if (id === null) {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO public.mesa (restaurante_id, numero, nombre, capacidad, zona_id, sucursal_id, activa)
          VALUES (${restauranteId}, ${body.numero}, ${name}, ${body.capacidad}, ${body.zona_id},
                  ${body.sucursal_id}, ${body.activa})
          RETURNING id
        `;
        await record(c, "tables.mesa.crear", "mesa", row?.id ?? null, body);
        return c.json({ id: row?.id }, 201);
      }
      await sql`
        UPDATE public.mesa
        SET    numero = ${body.numero}, nombre = ${name}, capacidad = ${body.capacidad},
               zona_id = ${body.zona_id}, sucursal_id = ${body.sucursal_id}, activa = ${body.activa}
        WHERE  id = ${id} AND restaurante_id = ${restauranteId}
      `;
      await record(c, "tables.mesa.editar", "mesa", id, body);
      return c.json({ id });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_number" });
      }
      throw error;
    }
  };

  app.post("/:slug/mesas", requirePermission(deps, PERMISSION.TablesManage), saveTable("create"));
  app.put(
    "/:slug/mesas/:id",
    requirePermission(deps, PERMISSION.TablesManage),
    saveTable("update"),
  );

  app.delete("/:slug/mesas/:id", requirePermission(deps, PERMISSION.TablesManage), async (c) => {
    const id = paramId(c);
    if (!id || !(await ownRow(c, "mesa", id))) return fail(c, 404, API_ERROR.NotFound);
    // Los pedidos antiguos conservan su mesa_numero; mesa_id pasa a NULL (FK ON DELETE SET NULL).
    await sql`DELETE FROM public.mesa WHERE id = ${id} AND restaurante_id = ${c.get("restaurant").id}`;
    await record(c, "tables.mesa.borrar", "mesa", id);
    return c.json({ id });
  });

  /**
   * Ocupar (clientes que se sientan) o liberar (la mesa se va) una mesa. Liberar exige que no
   * queden pedidos en marcha: se entregan o cancelan antes, desde la mesa o el tablero.
   */
  app.patch(
    "/:slug/mesas/:id/estado",
    requirePermission(deps, PERMISSION.TablesManage),
    async (c) => {
      const id = paramId(c);
      const parsed = z
        .object({ ocupada: z.boolean() })
        .safeParse(await c.req.json().catch(() => null));
      if (!id || !parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      if (!(await ownRow(c, "mesa", id))) return fail(c, 404, API_ERROR.NotFound);
      const restauranteId = c.get("restaurant").id;
      if (parsed.data.ocupada) {
        await occupyTable(sql, restauranteId, id);
      } else {
        const active = await activeTableOrders(sql, restauranteId, id);
        if (active.length > 0) {
          return fail(c, 409, API_ERROR.Conflict, {
            reason: "orders_in_progress",
            pedidos: active.map((order) => order.codigo ?? `#${order.id}`),
          });
        }
        await sql`
          UPDATE public.mesa SET ocupada_manual = false, ocupada_desde = NULL, mesero_id = NULL
          WHERE  id = ${id} AND restaurante_id = ${restauranteId}
        `;
      }
      await record(
        c,
        parsed.data.ocupada ? "tables.mesa.ocupar" : "tables.mesa.liberar",
        "mesa",
        id,
      );
      return c.json({ id, ocupada: parsed.data.ocupada });
    },
  );
}
