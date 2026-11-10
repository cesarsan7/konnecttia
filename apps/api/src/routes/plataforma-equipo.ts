import { PLATFORM_ROLE } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import {
  activeAdminsExcept,
  isOrphan,
  listOrphans,
  listPlatformMembers,
  ORPHAN_MIN_AGE_DAYS,
} from "../repositories/platform-team";

/**
 * Equipo de Konnecttia y cuentas sin uso, dentro del panel interno.
 * - Dar acceso: se indica el email de una persona que YA tiene cuenta (entró alguna vez); la API
 *   la busca en Supabase Auth y la añade a `plataforma_miembro`. Sin SQL a mano.
 * - Quitar acceso nunca borra a la persona: se desactiva (queda el historial).
 * - Nunca queda el panel sin administradores, y nadie se quita el acceso a sí mismo.
 * - Borrar una cuenta de Supabase es explícito, solo `admin`, y solo si no tiene ningún uso.
 * Toda escritura se audita con actor «plataforma».
 */

type Ctx = Context<AppEnv>;

const addSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  rol: z.enum([PLATFORM_ROLE.Admin, PLATFORM_ROLE.Support]),
});
const changeSchema = z
  .object({
    rol: z.enum([PLATFORM_ROLE.Admin, PLATFORM_ROLE.Support]).optional(),
    activo: z.boolean().optional(),
  })
  .refine((value) => value.rol !== undefined || value.activo !== undefined);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerPlatformTeamRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  const record = (
    c: Ctx,
    accion: string,
    recursoId: string | null,
    detalle: Record<string, unknown> = {},
  ) =>
    audit(sql, {
      restauranteId: null,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion,
      recursoTipo: "plataforma_miembro",
      recursoId,
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  app.get("/equipo", reader, async (c) =>
    c.json({
      miembros: await listPlatformMembers(sql),
      yo: c.get("platform").userId,
      busqueda_por_email: Boolean(deps.authAdmin),
    }),
  );

  app.post("/equipo", writer, async (c) => {
    const parsed = addSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "email" });
    if (!deps.authAdmin) {
      return fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_auth_admin" });
    }
    const account = await deps.authAdmin.findByEmail(parsed.data.email);
    if (!account) return fail(c, 404, API_ERROR.NotFound, { reason: "no_account" });
    const [row] = await sql<{ inserted: boolean }[]>`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo)
      VALUES (${account.id}::uuid, ${account.email}, ${parsed.data.rol}, true)
      ON CONFLICT (user_id) DO UPDATE
        SET email = EXCLUDED.email, rol = EXCLUDED.rol, activo = true
      RETURNING (xmax = 0) AS inserted
    `;
    await record(c, "plataforma.equipo.dar_acceso", account.id, {
      email: account.email,
      rol: parsed.data.rol,
      nuevo: row?.inserted ?? true,
    });
    return c.json({ user_id: account.id, email: account.email, rol: parsed.data.rol }, 201);
  });

  app.patch("/equipo/:userId", writer, async (c) => {
    const userId = c.req.param("userId");
    if (!UUID.test(userId)) return fail(c, 404, API_ERROR.NotFound);
    const parsed = changeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const [current] = await sql<{ rol: string; activo: boolean; email: string | null }[]>`
      SELECT rol, activo, email FROM public.plataforma_miembro WHERE user_id = ${userId}::uuid
    `;
    if (!current) return fail(c, 404, API_ERROR.NotFound);
    const rol = parsed.data.rol ?? current.rol;
    const activo = parsed.data.activo ?? current.activo;
    const losesAdmin =
      current.rol === PLATFORM_ROLE.Admin && current.activo
        ? rol !== PLATFORM_ROLE.Admin || !activo
        : false;
    if (losesAdmin) {
      if (userId === c.get("platform").userId) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "self_change" });
      }
      if ((await activeAdminsExcept(sql, userId)) === 0) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "last_admin" });
      }
    }
    await sql`
      UPDATE public.plataforma_miembro SET rol = ${rol}, activo = ${activo}
      WHERE user_id = ${userId}::uuid
    `;
    await record(c, "plataforma.equipo.cambiar", userId, { email: current.email, rol, activo });
    return c.json({ user_id: userId, rol, activo });
  });

  /** Cuentas de Supabase que ya no sirven para nada (ver `isOrphan`). */
  app.get("/cuentas-sin-uso", writer, async (c) => {
    if (!deps.authAdmin) {
      return fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_auth_admin" });
    }
    const orphans = await listOrphans(sql, deps.authAdmin, deps.now());
    return c.json({
      dias_minimos: ORPHAN_MIN_AGE_DAYS,
      cuentas: orphans.map((account) => ({
        user_id: account.id,
        email: account.email,
        creada: account.createdAt,
        ultimo_acceso: account.lastSignInAt,
      })),
    });
  });

  app.delete("/cuentas/:userId", writer, async (c) => {
    const userId = c.req.param("userId");
    if (!UUID.test(userId) || !deps.authAdmin) {
      return deps.authAdmin
        ? fail(c, 404, API_ERROR.NotFound)
        : fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_auth_admin" });
    }
    const accounts = await deps.authAdmin.listAccounts();
    const account = accounts.find((item) => item.id === userId);
    if (!account) return fail(c, 404, API_ERROR.NotFound);
    if (userId === c.get("platform").userId) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "self_change" });
    }
    // Se comprueba justo antes de borrar: si ya tiene uso, no se toca.
    if (!(await isOrphan(sql, account))) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "account_in_use" });
    }
    if (!(await deps.authAdmin.deleteAccount(userId))) {
      return fail(c, 502, API_ERROR.ServiceUnavailable, { reason: "auth_delete_failed" });
    }
    await record(c, "plataforma.cuenta.borrar", userId, { email: account.email });
    return c.json({ user_id: userId, eliminada: true });
  });
}
