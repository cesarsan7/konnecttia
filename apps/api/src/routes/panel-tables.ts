import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadBranches } from "../repositories/branches";

/**
 * Mesas (módulo «tables», plan Premium): tables.view para ver el plano y tables.manage para
 * configurarlo y marcar mesas. Reutiliza las tablas del dashboard antiguo (zona_mesa, mesa) con
 * su sucursal_id (0003). Una mesa está ocupada si tiene un pedido en marcha o se marcó a mano.
 * Cada usuario solo ve y gestiona las mesas de sus locales.
 */

type Ctx = Context<AppEnv>;

/** Estados que liberan la mesa. */
const CLOSED_STATES = [
  ORDER_STATUS.Delivered,
  ORDER_STATUS.Cancelled,
  ORDER_STATUS.Expired,
  ORDER_STATUS.InCart,
];

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
    if (ids.length === 0) return c.json({ locales: [], zonas: [], mesas: [] });
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
          pedido: {
            id: number;
            codigo: string | null;
            estado: string;
            total: number;
            desde: string;
          } | null;
        }[]
      >`
        SELECT m.id, m.numero, m.nombre, m.capacidad, m.activa, m.zona_id, m.sucursal_id,
               m.ocupada_manual,
               (SELECT json_build_object('id', p.id, 'codigo', p.pedido_codigo, 'estado', p.estado,
                                         'total', p.total,
                                         'desde', to_char(p.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
                FROM   public.pedidos p
                WHERE  p.mesa_id = m.id AND p.restaurante_id = ${restauranteId}
                  AND  p.estado NOT IN ${sql(CLOSED_STATES)}
                ORDER  BY p.created_at DESC
                LIMIT  1) AS pedido
        FROM   public.mesa m
        WHERE  m.restaurante_id = ${restauranteId} AND m.sucursal_id IN ${sql(ids)}
        ORDER  BY m.numero
      `,
    ]);
    return c.json({
      locales: branches.map((branch) => ({ id: branch.id, nombre: branch.name })),
      zonas: zones,
      mesas: tables.map((table) => ({
        ...table,
        nombre: table.nombre || `Mesa ${table.numero}`,
        pedido: table.pedido ? { ...table.pedido, total: Number(table.pedido.total) } : null,
        ocupada: table.pedido !== null || table.ocupada_manual,
      })),
    });
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

  /** Ocupar o liberar una mesa a mano (clientes sentados sin pedido, o mesa que se va). */
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
      await sql`
      UPDATE public.mesa SET ocupada_manual = ${parsed.data.ocupada}
      WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
    `;
      await record(c, "tables.mesa.estado", "mesa", id, parsed.data);
      return c.json({ id, ocupada_manual: parsed.data.ocupada });
    },
  );
}
