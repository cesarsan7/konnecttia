import type { Context } from "hono";
import { Hono } from "hono";
import type { AppDeps, AppEnv, AuthenticatedUser } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { audit } from "../repositories/access";
import { legacyRole } from "./panel-team";

const BEARER_PREFIX = "Bearer ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVITE_STATE = {
  Valid: "valida",
  Used: "usada",
  Expired: "caducada",
  Revoked: "anulada",
  OtherEmail: "otro_email",
  AlreadyMember: "ya_miembro",
} as const;

type InviteRow = {
  id: number;
  restaurante_id: number;
  restaurante: string;
  slug: string | null;
  email: string | null;
  rol_id: number | null;
  rol_code: string | null;
  rol_nombre: string | null;
  rol_plantilla: boolean | null;
  sucursal_ids: number[];
  used_at: string | null;
  revocada_at: string | null;
  caducada: boolean;
  ya_miembro: boolean;
};

/**
 * Datos de la cuenta que ha iniciado sesión. El panel lo usa justo después del login para saber
 * a qué restaurante llevar al usuario (o mostrarle un selector si es miembro de varios), y para
 * aceptar invitaciones al equipo.
 */
export function meRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  async function currentUser(c: Context<AppEnv>): Promise<AuthenticatedUser | null> {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith(BEARER_PREFIX)) return null;
    return deps.verifyToken(header.slice(BEARER_PREFIX.length));
  }

  app.get("/restaurantes", async (c) => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, API_ERROR.Unauthorized);
    // Las membresías antiguas no guardaban el email: se completa al entrar (lo muestra Equipo).
    if (user.email) {
      await deps.sql`
        UPDATE public.local_memberships SET email = ${user.email}
        WHERE  user_id = ${user.userId}::uuid AND email IS NULL
      `;
    }
    const rows = await deps.sql<{ slug: string; nombre: string; roles: string[] }[]>`
      SELECT r.slug, r.nombre,
             COALESCE(array_agg(rl.nombre ORDER BY rl.id) FILTER (WHERE rl.id IS NOT NULL), '{}') AS roles
      FROM   public.local_memberships m
      JOIN   public.restaurante r       ON r.id = m.restaurante_id
      LEFT   JOIN public.membresia_rol mr ON mr.membership_id = m.id
      LEFT   JOIN public.rol rl           ON rl.id = mr.rol_id
      WHERE  m.user_id = ${user.userId}::uuid AND r.slug IS NOT NULL
      GROUP  BY r.id, r.slug, r.nombre
      ORDER  BY r.nombre
    `;
    return c.json({ email: user.email, restaurantes: rows });
  });

  async function loadInvite(token: string, userId: string): Promise<InviteRow | null> {
    const [row] = await deps.sql<InviteRow[]>`
      SELECT i.id, i.restaurante_id, r.nombre AS restaurante, r.slug, i.email, i.rol_id,
             rl.code AS rol_code, rl.nombre AS rol_nombre, rl.es_plantilla AS rol_plantilla,
             i.sucursal_ids, i.used_at, i.revocada_at,
             i.expires_at <= (${deps.now()}::timestamptz AT TIME ZONE 'UTC') AS caducada,
             EXISTS (SELECT 1 FROM public.local_memberships m
                     WHERE m.restaurante_id = i.restaurante_id AND m.user_id = ${userId}::uuid) AS ya_miembro
      FROM   public.restaurant_invites i
      JOIN   public.restaurante r ON r.id = i.restaurante_id
      LEFT   JOIN public.rol rl   ON rl.id = i.rol_id
      WHERE  i.token = ${token}::uuid
    `;
    return row ?? null;
  }

  function stateOf(invite: InviteRow, user: AuthenticatedUser) {
    if (invite.revocada_at) return INVITE_STATE.Revoked;
    if (invite.used_at) return INVITE_STATE.Used;
    if (invite.caducada) return INVITE_STATE.Expired;
    if (invite.ya_miembro) return INVITE_STATE.AlreadyMember;
    if (invite.email && invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return INVITE_STATE.OtherEmail;
    }
    return INVITE_STATE.Valid;
  }

  app.get("/invitaciones/:token", async (c) => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, API_ERROR.Unauthorized);
    const token = c.req.param("token");
    const invite = UUID.test(token) ? await loadInvite(token, user.userId) : null;
    // Invitaciones del dashboard antiguo (sin rol nuevo) no se aceptan aquí.
    if (!invite || invite.rol_id === null) return fail(c, 404, API_ERROR.NotFound);
    return c.json({
      estado: stateOf(invite, user),
      restaurante: { nombre: invite.restaurante, slug: invite.slug },
      rol: invite.rol_nombre,
      todos_los_locales: invite.sucursal_ids.length === 0,
      tu_email: user.email,
    });
  });

  app.post("/invitaciones/:token/aceptar", async (c) => {
    const user = await currentUser(c);
    if (!user) return fail(c, 401, API_ERROR.Unauthorized);
    const token = c.req.param("token");
    if (!UUID.test(token)) return fail(c, 404, API_ERROR.NotFound);

    const result = await deps.sql.begin(async (tx) => {
      const locked = await tx<{ id: number }[]>`
        SELECT id FROM public.restaurant_invites WHERE token = ${token}::uuid FOR UPDATE
      `;
      if (locked.length === 0) return { kind: "not_found" as const };
      const invite = await loadInvite(token, user.userId);
      if (!invite || invite.rol_id === null) return { kind: "not_found" as const };
      const state = stateOf(invite, user);
      if (state !== INVITE_STATE.Valid) return { kind: "rejected" as const, state, invite };

      const [membership] = await tx<{ id: number }[]>`
        INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email)
        VALUES (${user.userId}::uuid, ${invite.restaurante_id},
                ${legacyRole(invite.rol_plantilla ? invite.rol_code : null)}, ${user.email})
        RETURNING id
      `;
      if (!membership) throw new Error("No se pudo crear la membresía");
      await tx`
        INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${membership.id}, ${invite.rol_id})
      `;
      for (const branchId of invite.sucursal_ids) {
        await tx`
          INSERT INTO public.membresia_sucursal (membership_id, sucursal_id)
          VALUES (${membership.id}, ${branchId})
        `;
      }
      await tx`
        UPDATE public.restaurant_invites
        SET    used_by = ${user.userId}::uuid, used_at = (${deps.now()}::timestamptz AT TIME ZONE 'UTC')
        WHERE  id = ${invite.id}
      `;
      return { kind: "accepted" as const, invite, membershipId: membership.id };
    });

    if (result.kind === "not_found") return fail(c, 404, API_ERROR.NotFound);
    if (result.kind === "rejected") {
      await audit(deps.sql, {
        restauranteId: result.invite.restaurante_id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: "team.invite.accept",
        recursoTipo: "invitacion",
        recursoId: String(result.invite.id),
        resultado: "denegado",
        detalle: { motivo: result.state },
        requestId: c.get("requestId"),
      });
      return fail(c, 409, API_ERROR.Conflict, { reason: result.state });
    }
    await audit(deps.sql, {
      restauranteId: result.invite.restaurante_id,
      actorTipo: "usuario",
      actorId: user.userId,
      accion: "team.invite.accept",
      recursoTipo: "invitacion",
      recursoId: String(result.invite.id),
      resultado: "ok",
      detalle: { membresia: result.membershipId, rol: result.invite.rol_code },
      requestId: c.get("requestId"),
    });
    return c.json({ slug: result.invite.slug });
  });

  return app;
}
