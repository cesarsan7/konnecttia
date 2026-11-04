import {
  ALL_BRANCHES,
  canAccessBranch,
  canGrantBranches,
  canGrantRole,
  PERMISSION,
  type PermissionCode,
  ROLE_TEMPLATE,
} from "@konnecttia/access";
import type { Context, Hono } from "hono";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { inviteEmail } from "../lib/mailer";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadBranches } from "../repositories/branches";

/**
 * Equipo del restaurante desde el panel (team.view / team.manage):
 * - Miembros con sus roles y locales; invitaciones pendientes.
 * - Invitar con un enlace (opcionalmente solo para un email), cambiar rol y locales, quitar acceso.
 * - Sin escalada: solo se asignan roles cuyos permisos tiene quien asigna (canGrantRole) y locales
 *   dentro de su alcance (canGrantBranches). Nadie se cambia ni se quita a sí mismo, y el
 *   restaurante nunca se queda sin propietario.
 * Los roles propios de un restaurante los crea el panel interno de Konnecttia (MVP).
 */

type Ctx = Context<AppEnv>;
type Tx = TransactionSql<{ bigint: number }>;

/** Días que dura una invitación. */
export const INVITE_DAYS = 7;

/** Rol de la columna antigua local_memberships.rol (la lee el dashboard antiguo). */
export function legacyRole(templateCode: string | null): "owner" | "manager" | "viewer" {
  if (templateCode === ROLE_TEMPLATE.Owner) return "owner";
  if (templateCode === ROLE_TEMPLATE.Manager) return "manager";
  return "viewer";
}

const branchList = z.array(z.number().int().positive()).max(50);

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(255)
    .nullable()
    .default(null)
    .or(z.literal("").transform(() => null)),
  rol_id: z.number().int().positive(),
  /** [] = todos los locales. */
  sucursal_ids: branchList.default([]),
});

const memberSchema = z
  .object({ rol_id: z.number().int().positive(), sucursal_ids: branchList })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

type RoleRow = { id: number; code: string; nombre: string; plantilla: boolean; permisos: string[] };

export async function rolesOf(sql: Sql | Tx, restauranteId: number): Promise<RoleRow[]> {
  return sql<RoleRow[]>`
    SELECT r.id, r.code, r.nombre, r.es_plantilla AS plantilla,
           COALESCE(array_agg(rp.permiso_code ORDER BY rp.permiso_code)
                    FILTER (WHERE rp.permiso_code IS NOT NULL), '{}') AS permisos
    FROM   public.rol r
    LEFT   JOIN public.rol_permiso rp ON rp.rol_id = r.id
    WHERE  r.restaurante_id IS NULL OR r.restaurante_id = ${restauranteId}
    GROUP  BY r.id
    ORDER  BY r.es_plantilla DESC, r.id
  `;
}

/** Miembros con el rol de propietario (plantilla). */
async function ownerMemberships(tx: Tx, restauranteId: number): Promise<number[]> {
  const rows = await tx<{ id: number }[]>`
    SELECT DISTINCT m.id
    FROM   public.local_memberships m
    JOIN   public.membresia_rol mr ON mr.membership_id = m.id
    JOIN   public.rol r            ON r.id = mr.rol_id
    WHERE  m.restaurante_id = ${restauranteId} AND r.code = ${ROLE_TEMPLATE.Owner}
      AND  r.restaurante_id IS NULL
  `;
  return rows.map((row) => row.id);
}

export function registerTeamRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    recursoTipo: string,
    recursoId: number | null,
    detalle: Record<string, unknown> = {},
    resultado: "ok" | "denegado" = "ok",
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado,
      detalle,
      requestId: c.get("requestId"),
    });

  /**
   * Envía la invitación por email (si hay Resend). El enlace apunta al panel desde el que se
   * invita (Origin, que CORS ya limita a los orígenes permitidos) o a PANEL_PUBLIC_URL. Un fallo
   * del envío no anula la invitación: el panel ofrece copiar el enlace igualmente.
   */
  const sendInviteEmail = async (c: Ctx, to: string, roleName: string, token: string) => {
    if (!deps.mailer) return false;
    const origin = c.req.header("Origin");
    const base = origin && deps.allowedOrigins.includes(origin) ? origin : deps.panelUrl;
    if (!base) return false;
    try {
      await deps.mailer.send({
        to,
        ...inviteEmail({
          restaurante: c.get("restaurant").nombre,
          rol: roleName,
          link: `${base.replace(/\/$/, "")}/panel/unirse/${token}`,
          dias: INVITE_DAYS,
        }),
      });
      return true;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "warn",
          message: "email de invitación no enviado",
          error: String(error),
        }),
      );
      return false;
    }
  };

  const deny = async (c: Ctx, accion: string, reason: string, recursoId: number | null = null) => {
    await record(c, accion, "equipo", recursoId, { motivo: reason }, "denegado");
    return fail(c, 403, API_ERROR.Forbidden, { reason });
  };

  /** Rol válido para este restaurante que el usuario puede conceder. */
  const grantableRole = async (c: Ctx, roleId: number) => {
    const role = (await rolesOf(sql, c.get("restaurant").id)).find((row) => row.id === roleId);
    if (!role) return { ok: false as const, status: 400 as const, reason: "unknown_role" };
    if (!canGrantRole(c.get("access"), role.permisos as PermissionCode[])) {
      return { ok: false as const, status: 403 as const, reason: "role_above_yours" };
    }
    return { ok: true as const, role };
  };

  /** Locales válidos (del restaurante, visibles) y dentro del alcance de quien los asigna. */
  const grantableBranches = async (c: Ctx, ids: readonly number[]) => {
    const unique = [...new Set(ids)];
    const branches = await loadBranches(sql, c.get("restaurant").id);
    if (!unique.every((id) => branches.some((branch) => branch.id === id))) {
      return { ok: false as const, status: 400 as const, reason: "unknown_branch" };
    }
    if (!canGrantBranches(c.get("access"), unique)) {
      return { ok: false as const, status: 403 as const, reason: "branch_out_of_scope" };
    }
    return { ok: true as const, ids: unique };
  };

  app.get("/:slug/equipo", requirePermission(deps, PERMISSION.TeamView), async (c) => {
    const restauranteId = c.get("restaurant").id;
    const access = c.get("access");
    const [members, invites, roles, branches] = await Promise.all([
      sql<
        {
          id: number;
          user_id: string;
          email: string | null;
          created_at: string;
          roles: { id: number; code: string; nombre: string }[];
          locales: number[];
        }[]
      >`
        SELECT m.id, m.user_id::text AS user_id, m.email, m.created_at,
               COALESCE((SELECT json_agg(json_build_object('id', r.id, 'code', r.code, 'nombre', r.nombre) ORDER BY r.id)
                         FROM public.membresia_rol mr JOIN public.rol r ON r.id = mr.rol_id
                         WHERE mr.membership_id = m.id), '[]') AS roles,
               COALESCE((SELECT array_agg(ms.sucursal_id ORDER BY ms.sucursal_id)
                         FROM public.membresia_sucursal ms WHERE ms.membership_id = m.id), '{}') AS locales
        FROM   public.local_memberships m
        WHERE  m.restaurante_id = ${restauranteId}
        ORDER  BY m.created_at, m.id
      `,
      sql<
        {
          id: number;
          email: string | null;
          rol_id: number | null;
          sucursal_ids: number[];
          token: string;
          expires_at: string;
          created_at: string | null;
        }[]
      >`
        SELECT id, email, rol_id, sucursal_ids, token::text AS token,
               expires_at AT TIME ZONE 'UTC' AS expires_at
        FROM   public.restaurant_invites
        WHERE  restaurante_id = ${restauranteId} AND used_at IS NULL AND revocada_at IS NULL
          AND  rol_id IS NOT NULL
          AND  expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')
        ORDER  BY id DESC
      `,
      rolesOf(sql, restauranteId),
      loadBranches(sql, restauranteId),
    ]);
    const visible = branches.filter((branch) => canAccessBranch(access, branch.id));
    // Un usuario limitado a unos locales solo ve a quien comparte alguno de sus locales.
    const sees = (locales: readonly number[]) =>
      access.branchScope === ALL_BRANCHES ||
      (locales.length > 0 && locales.some((id) => canAccessBranch(access, id)));
    const canManage = c.get("access").permissions.has(PERMISSION.TeamManage);
    return c.json({
      miembros: members
        .filter((member) => sees(member.locales))
        .map(({ user_id, ...member }) => ({
          ...member,
          locales: member.locales.length === 0 ? "todos" : member.locales,
          eres_tu: user_id === c.get("user").userId,
        })),
      // El enlace (token) solo lo ve quien puede gestionar el equipo.
      invitaciones: canManage
        ? invites
            .filter((invite) => sees(invite.sucursal_ids))
            .map((invite) => ({
              ...invite,
              locales: invite.sucursal_ids.length === 0 ? "todos" : invite.sucursal_ids,
              sucursal_ids: undefined,
            }))
        : [],
      roles: roles.map((role) => ({
        ...role,
        asignable: canGrantRole(access, role.permisos as PermissionCode[]),
      })),
      locales: visible.map((branch) => ({ id: branch.id, nombre: branch.name })),
      dias_invitacion: INVITE_DAYS,
    });
  });

  app.post(
    "/:slug/equipo/invitaciones",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) {
        return fail(c, 400, API_ERROR.InvalidBody, {
          field: parsed.error.issues[0]?.path.join("."),
        });
      }
      const body = parsed.data;
      const role = await grantableRole(c, body.rol_id);
      if (!role.ok) {
        return role.status === 403
          ? deny(c, "team.invite", role.reason)
          : fail(c, 400, API_ERROR.InvalidBody, { reason: role.reason });
      }
      const branches = await grantableBranches(c, body.sucursal_ids);
      if (!branches.ok) {
        return branches.status === 403
          ? deny(c, "team.invite", branches.reason)
          : fail(c, 400, API_ERROR.InvalidBody, { reason: branches.reason });
      }
      const restauranteId = c.get("restaurant").id;
      if (body.email) {
        const existing = await sql`
        SELECT 1 FROM public.local_memberships
        WHERE  restaurante_id = ${restauranteId} AND lower(email) = ${body.email}
      `;
        if (existing.length > 0)
          return fail(c, 409, API_ERROR.Conflict, { reason: "already_member" });
      }
      const [invite] = await sql<{ id: number; token: string; expires_at: string }[]>`
      INSERT INTO public.restaurant_invites
        (restaurante_id, rol, rol_id, sucursal_ids, email, created_by, expires_at)
      VALUES (${restauranteId}, ${legacyRole(role.role.plantilla ? role.role.code : null)},
              ${role.role.id}, ${branches.ids}::bigint[], ${body.email}, ${c.get("user").userId}::uuid,
              (${deps.now()}::timestamptz AT TIME ZONE 'UTC') + make_interval(days => ${INVITE_DAYS}))
      RETURNING id, token::text AS token, expires_at AT TIME ZONE 'UTC' AS expires_at
    `;
      const emailSent =
        invite && body.email
          ? await sendInviteEmail(c, body.email, role.role.nombre, invite.token)
          : false;
      await record(c, "team.invite", "invitacion", invite?.id ?? null, {
        email: body.email,
        rol: role.role.code,
        locales: branches.ids,
        email_enviado: emailSent,
      });
      return c.json({ ...invite, email_enviado: emailSent }, 201);
    },
  );

  app.delete(
    "/:slug/equipo/invitaciones/:id",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id)) return fail(c, 400, API_ERROR.InvalidBody);
      const [invite] = await sql<{ sucursal_ids: number[] }[]>`
        SELECT sucursal_ids FROM public.restaurant_invites
        WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
          AND  used_at IS NULL AND revocada_at IS NULL
      `;
      if (!invite || !canGrantBranches(c.get("access"), invite.sucursal_ids)) {
        return fail(c, 404, API_ERROR.NotFound);
      }
      await sql`
        UPDATE public.restaurant_invites SET revocada_at = ${deps.now()}
        WHERE  id = ${id} AND restaurante_id = ${c.get("restaurant").id}
      `;
      await record(c, "team.invite.revoke", "invitacion", id);
      return c.json({ id });
    },
  );

  /** Miembro del restaurante dentro del alcance de quien lo gestiona. */
  const findMember = async (c: Ctx) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id)) return null;
    const [member] = await sql<{ id: number; user_id: string; locales: number[] }[]>`
      SELECT m.id, m.user_id::text AS user_id,
             COALESCE((SELECT array_agg(sucursal_id) FROM public.membresia_sucursal
                       WHERE membership_id = m.id), '{}') AS locales
      FROM   public.local_memberships m
      WHERE  m.id = ${id} AND m.restaurante_id = ${c.get("restaurant").id}
    `;
    if (!member) return null;
    // Quien está limitado a unos locales no gestiona a quien tiene todos u otros.
    return canGrantBranches(c.get("access"), member.locales) ? member : null;
  };

  app.patch(
    "/:slug/equipo/miembros/:id",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const member = await findMember(c);
      if (!member) return fail(c, 404, API_ERROR.NotFound);
      if (member.user_id === c.get("user").userId)
        return deny(c, "team.update", "self_change", member.id);
      const parsed = memberSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const body = parsed.data;
      const restauranteId = c.get("restaurant").id;

      // Sus roles actuales tampoco pueden estar por encima de los de quien lo cambia.
      const currentRoles = await sql<{ permisos: string[] }[]>`
      SELECT COALESCE(array_agg(rp.permiso_code) FILTER (WHERE rp.permiso_code IS NOT NULL), '{}') AS permisos
      FROM   public.membresia_rol mr
      LEFT   JOIN public.rol_permiso rp ON rp.rol_id = mr.rol_id
      WHERE  mr.membership_id = ${member.id}
    `;
      if (!canGrantRole(c.get("access"), (currentRoles[0]?.permisos ?? []) as PermissionCode[])) {
        return deny(c, "team.update", "role_above_yours", member.id);
      }
      const role = body.rol_id === undefined ? null : await grantableRole(c, body.rol_id);
      if (role && !role.ok) {
        return role.status === 403
          ? deny(c, "team.update", role.reason, member.id)
          : fail(c, 400, API_ERROR.InvalidBody, { reason: role.reason });
      }
      const branches =
        body.sucursal_ids === undefined ? null : await grantableBranches(c, body.sucursal_ids);
      if (branches && !branches.ok) {
        return branches.status === 403
          ? deny(c, "team.update", branches.reason, member.id)
          : fail(c, 400, API_ERROR.InvalidBody, { reason: branches.reason });
      }

      const result = await sql.begin(async (tx) => {
        if (role?.ok) {
          const owners = await ownerMemberships(tx, restauranteId);
          if (
            owners.length === 1 &&
            owners[0] === member.id &&
            role.role.code !== ROLE_TEMPLATE.Owner
          ) {
            return "last_owner" as const;
          }
          await tx`DELETE FROM public.membresia_rol WHERE membership_id = ${member.id}`;
          await tx`INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${member.id}, ${role.role.id})`;
          await tx`
          UPDATE public.local_memberships SET rol = ${legacyRole(role.role.plantilla ? role.role.code : null)}
          WHERE  id = ${member.id}
        `;
        }
        if (branches?.ok) {
          await tx`DELETE FROM public.membresia_sucursal WHERE membership_id = ${member.id}`;
          for (const branchId of branches.ids) {
            await tx`
            INSERT INTO public.membresia_sucursal (membership_id, sucursal_id)
            VALUES (${member.id}, ${branchId})
          `;
          }
        }
        return "ok" as const;
      });
      if (result === "last_owner") {
        return fail(c, 409, API_ERROR.Conflict, { reason: "last_owner" });
      }
      await record(c, "team.update", "miembro", member.id, {
        ...(role?.ok ? { rol: role.role.code } : {}),
        ...(branches?.ok ? { locales: branches.ids } : {}),
      });
      return c.json({ id: member.id });
    },
  );

  app.delete(
    "/:slug/equipo/miembros/:id",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const member = await findMember(c);
      if (!member) return fail(c, 404, API_ERROR.NotFound);
      if (member.user_id === c.get("user").userId)
        return deny(c, "team.remove", "self_change", member.id);
      const roles = await sql<{ permisos: string[] }[]>`
      SELECT COALESCE(array_agg(rp.permiso_code) FILTER (WHERE rp.permiso_code IS NOT NULL), '{}') AS permisos
      FROM   public.membresia_rol mr
      LEFT   JOIN public.rol_permiso rp ON rp.rol_id = mr.rol_id
      WHERE  mr.membership_id = ${member.id}
    `;
      if (!canGrantRole(c.get("access"), (roles[0]?.permisos ?? []) as PermissionCode[])) {
        return deny(c, "team.remove", "role_above_yours", member.id);
      }
      const restauranteId = c.get("restaurant").id;
      const result = await sql.begin(async (tx) => {
        const owners = await ownerMemberships(tx, restauranteId);
        if (owners.length === 1 && owners[0] === member.id) return "last_owner" as const;
        await tx`
        DELETE FROM public.local_memberships WHERE id = ${member.id} AND restaurante_id = ${restauranteId}
      `;
        return "ok" as const;
      });
      if (result === "last_owner")
        return fail(c, 409, API_ERROR.Conflict, { reason: "last_owner" });
      await record(c, "team.remove", "miembro", member.id);
      return c.json({ id: member.id });
    },
  );
}
