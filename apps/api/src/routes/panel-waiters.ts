import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { type Sql, UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { canSeeMemberEmails } from "../lib/member-name";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";

/**
 * Meseros (módulo «tables»): quién atiende cada mesa y cada pedido en mesa, base para propinas e
 * informes por mesero. Reutiliza `meseros` y `pedidos.mesero_id` del dashboard antiguo (0016 añade
 * el miembro del panel opcional y `mesa.mesero_id`).
 * - Ver: tables.view. Alta, cambios y baja: tables.manage.
 * - Cada mesero es de un local y puede tener o no usuario del panel (uno por local).
 * - Si tiene pedidos, «borrar» lo desactiva para no perder el historial.
 */

type Ctx = Context<AppEnv>;

const NOT_A_SALE = [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

const waiterSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  /** Cada mesero es de un local (0003 lo exige con trg_meseros_sucursal). */
  sucursal_id: z.number().int().positive(),
  membership_id: z.number().int().positive().nullable().default(null),
  activo: z.boolean().default(true),
});

type WaiterRow = {
  id: number;
  nombre: string;
  activo: boolean;
  sucursal_id: number | null;
  membership_id: number | null;
};

/** Membresía del usuario en el restaurante (para saber si él mismo es mesero). */
async function membershipId(
  sql: Sql,
  restauranteId: number,
  userId: string,
): Promise<number | null> {
  const [row] = await sql<{ id: number }[]>`
    SELECT id FROM public.local_memberships
    WHERE  restaurante_id = ${restauranteId} AND user_id = ${userId}::uuid
  `;
  return row?.id ?? null;
}

/**
 * Mesero para un pedido en mesa: el elegido (debe estar activo y ser de ese local o de todos),
 * si no el que atiende la mesa, y si no el propio usuario cuando es mesero. null = sin mesero.
 */
export async function resolveWaiter(
  sql: Sql,
  input: {
    readonly restauranteId: number;
    readonly branchId: number;
    readonly tableId: number;
    readonly requested: number | null | undefined;
    readonly userId: string;
  },
): Promise<{ ok: true; id: number | null } | { ok: false }> {
  const valid = async (id: number) => {
    const [row] = await sql<{ id: number }[]>`
      SELECT id FROM public.meseros
      WHERE  id = ${id} AND restaurante_id = ${input.restauranteId} AND activo
        AND  (sucursal_id IS NULL OR sucursal_id = ${input.branchId})
    `;
    return row !== undefined;
  };
  if (input.requested === null) return { ok: true, id: null };
  if (input.requested !== undefined) {
    return (await valid(input.requested)) ? { ok: true, id: input.requested } : { ok: false };
  }
  const [table] = await sql<{ mesero_id: number | null }[]>`
    SELECT mesero_id FROM public.mesa WHERE id = ${input.tableId} AND restaurante_id = ${input.restauranteId}
  `;
  if (table?.mesero_id && (await valid(table.mesero_id))) return { ok: true, id: table.mesero_id };
  const member = await membershipId(sql, input.restauranteId, input.userId);
  if (member !== null) {
    const [own] = await sql<{ id: number }[]>`
      SELECT id FROM public.meseros
      WHERE  restaurante_id = ${input.restauranteId} AND membership_id = ${member} AND activo
        AND  (sucursal_id IS NULL OR sucursal_id = ${input.branchId})
    `;
    if (own) return { ok: true, id: own.id };
  }
  return { ok: true, id: null };
}

export function registerWaiterRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (c: Ctx, accion: string, id: number | null, detalle: Record<string, unknown>) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo: "mesero",
      recursoId: id === null ? null : String(id),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  const inScope = (c: Ctx, branchId: number | null) =>
    branchId !== null && canAccessBranch(c.get("access"), branchId);

  const own = async (c: Ctx): Promise<WaiterRow | null> => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const [row] = await sql<WaiterRow[]>`
      SELECT id, nombre, COALESCE(activo, true) AS activo, sucursal_id::int AS sucursal_id, membership_id::int AS membership_id
      FROM   public.meseros WHERE id = ${id} AND restaurante_id = ${c.get("restaurant").id}
    `;
    return row && inScope(c, row.sucursal_id) ? row : null;
  };

  app.get("/:slug/mesas/meseros", requirePermission(deps, PERMISSION.TablesView), async (c) => {
    const restaurant = c.get("restaurant");
    const access = c.get("access");
    const tz = restaurant.zonaHoraria;
    const [rows, member] = await Promise.all([
      sql<
        (WaiterRow & {
          email: string | null;
          nombre_mostrar: string | null;
          pedidos_hoy: number;
          importe_hoy: string | null;
        })[]
      >`
        SELECT w.id, w.nombre, COALESCE(w.activo, true) AS activo, w.sucursal_id::int AS sucursal_id,
               w.membership_id::int AS membership_id, m.email,
               COALESCE(m.apodo, m.nombre) AS nombre_mostrar,
               (SELECT count(*)::int FROM public.pedidos p
                WHERE  p.restaurante_id = w.restaurante_id AND p.mesero_id = w.id
                  AND  p.estado NOT IN ${sql(NOT_A_SALE)}
                  AND  ((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date
                       = (now() AT TIME ZONE ${tz})::date) AS pedidos_hoy,
               (SELECT sum(p.total) FROM public.pedidos p
                WHERE  p.restaurante_id = w.restaurante_id AND p.mesero_id = w.id
                  AND  p.estado NOT IN ${sql(NOT_A_SALE)}
                  AND  ((p.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date
                       = (now() AT TIME ZONE ${tz})::date) AS importe_hoy
        FROM   public.meseros w
        LEFT   JOIN public.local_memberships m ON m.id = w.membership_id
        WHERE  w.restaurante_id = ${restaurant.id}
        ORDER  BY COALESCE(w.activo, true) DESC, w.nombre
      `,
      membershipId(sql, restaurant.id, c.get("user").userId),
    ]);
    const visible = rows.filter((row) =>
      row.sucursal_id === null ? true : canAccessBranch(access, row.sucursal_id),
    );
    // `nombre_mostrar` = apodo o nombre del miembro enlazado; el email solo lo ve quien ve el equipo.
    const emails = canSeeMemberEmails(access);
    return c.json({
      meseros: visible.map(({ importe_hoy, ...row }) => ({
        ...row,
        email: emails ? row.email : null,
        importe_hoy: Number(importe_hoy ?? 0),
      })),
      /** Mesero que es el propio usuario (se asigna solo al tomar pedidos en mesa). */
      yo:
        visible.find(
          (row) => row.activo && row.membership_id !== null && row.membership_id === member,
        )?.id ?? null,
    });
  });

  const save = (mode: "create" | "update") => async (c: Ctx) => {
    const current = mode === "update" ? await own(c) : null;
    if (mode === "update" && !current) return fail(c, 404, API_ERROR.NotFound);
    const parsed = waiterSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    if (!inScope(c, body.sucursal_id)) return fail(c, 404, API_ERROR.BranchNotAvailable);
    const restauranteId = c.get("restaurant").id;
    if (body.membership_id !== null) {
      const [member] = await sql`
        SELECT 1 FROM public.local_memberships WHERE id = ${body.membership_id} AND restaurante_id = ${restauranteId}
      `;
      if (!member) return fail(c, 400, API_ERROR.InvalidBody, { reason: "unknown_member" });
    }
    try {
      if (!current) {
        const [row] = await sql<{ id: number }[]>`
          INSERT INTO public.meseros (restaurante_id, nombre, activo, sucursal_id, membership_id)
          VALUES (${restauranteId}, ${body.nombre}, ${body.activo}, ${body.sucursal_id}, ${body.membership_id})
          RETURNING id
        `;
        await record(c, "tables.mesero.crear", row?.id ?? null, body);
        return c.json({ id: row?.id }, 201);
      }
      await sql`
        UPDATE public.meseros
        SET    nombre = ${body.nombre}, activo = ${body.activo}, sucursal_id = ${body.sucursal_id},
               membership_id = ${body.membership_id}
        WHERE  id = ${current.id} AND restaurante_id = ${restauranteId}
      `;
      await record(c, "tables.mesero.editar", current.id, body);
      return c.json({ id: current.id });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "member_taken" });
      }
      throw error;
    }
  };

  app.post(
    "/:slug/mesas/meseros",
    requirePermission(deps, PERMISSION.TablesManage),
    save("create"),
  );
  app.put(
    "/:slug/mesas/meseros/:id",
    requirePermission(deps, PERMISSION.TablesManage),
    save("update"),
  );

  app.delete(
    "/:slug/mesas/meseros/:id",
    requirePermission(deps, PERMISSION.TablesManage),
    async (c) => {
      const waiter = await own(c);
      if (!waiter) return fail(c, 404, API_ERROR.NotFound);
      const restauranteId = c.get("restaurant").id;
      const [used] = await sql`
        SELECT 1 FROM public.pedidos WHERE restaurante_id = ${restauranteId} AND mesero_id = ${waiter.id} LIMIT 1
      `;
      if (used) {
        // Con pedidos se desactiva: el historial y los informes siguen con su nombre.
        await sql`UPDATE public.meseros SET activo = false WHERE id = ${waiter.id}`;
        await sql`UPDATE public.mesa SET mesero_id = NULL WHERE mesero_id = ${waiter.id} AND restaurante_id = ${restauranteId}`;
        await record(c, "tables.mesero.desactivar", waiter.id, { nombre: waiter.nombre });
        return c.json({ id: waiter.id, desactivado: true });
      }
      await sql`DELETE FROM public.meseros WHERE id = ${waiter.id} AND restaurante_id = ${restauranteId}`;
      await record(c, "tables.mesero.borrar", waiter.id, { nombre: waiter.nombre });
      return c.json({ id: waiter.id, desactivado: false });
    },
  );

  /** Cambiar el mesero que atiende una mesa (null = nadie). */
  app.patch(
    "/:slug/mesas/:id/mesero",
    requirePermission(deps, PERMISSION.TablesManage),
    async (c) => {
      const tableId = Number(c.req.param("id"));
      const parsed = z
        .object({ mesero_id: z.number().int().positive().nullable() })
        .safeParse(await c.req.json().catch(() => null));
      if (!Number.isSafeInteger(tableId) || tableId < 1 || !parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody);
      }
      const restauranteId = c.get("restaurant").id;
      const [table] = await sql<{ sucursal_id: number | null }[]>`
        SELECT sucursal_id FROM public.mesa WHERE id = ${tableId} AND restaurante_id = ${restauranteId}
      `;
      if (
        !table ||
        table.sucursal_id === null ||
        !canAccessBranch(c.get("access"), table.sucursal_id)
      ) {
        return fail(c, 404, API_ERROR.NotFound);
      }
      const waiter = await resolveWaiter(sql, {
        restauranteId,
        branchId: table.sucursal_id,
        tableId,
        requested: parsed.data.mesero_id,
        userId: c.get("user").userId,
      });
      if (!waiter.ok) return fail(c, 404, API_ERROR.NotFound, { reason: "waiter_not_found" });
      await sql`UPDATE public.mesa SET mesero_id = ${waiter.id} WHERE id = ${tableId} AND restaurante_id = ${restauranteId}`;
      await audit(sql, {
        restauranteId,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: "tables.mesa.mesero",
        recursoTipo: "mesa",
        recursoId: String(tableId),
        resultado: "ok",
        detalle: { mesero_id: waiter.id },
        requestId: c.get("requestId"),
      });
      return c.json({ id: tableId, mesero_id: waiter.id });
    },
  );
}
