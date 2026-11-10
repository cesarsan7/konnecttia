import {
  ALL_PERMISSIONS,
  canGrantRole,
  MODULES,
  PERMISSION,
  PERMISSION_LABEL,
  PERMISSION_MODULE,
  type PermissionCode,
  ROLE_TEMPLATE,
} from "@konnecttia/access";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import {
  insertRole,
  replaceRole,
  roleNameTaken,
  roleSchema,
  roleUsage,
} from "../repositories/roles";
import { rolesOf } from "./panel-team";

export { roleCode } from "../repositories/roles";

/**
 * Roles del restaurante desde el panel (Equipo → Roles).
 * - Las plantillas (Propietario, Encargado, Personal, Consulta, Mesero, Repartidor) las definen
 *   los desarrolladores en packages/access + migración: aquí solo se leen.
 * - Los roles propios se crean, editan y borran con team.manage. Sin escalada: solo se dan
 *   permisos que tiene quien edita, y no se toca un rol con permisos que no tiene.
 * - No se borra un rol asignado a alguien ni con invitaciones pendientes.
 */

type Ctx = Context<AppEnv>;

export function registerRoleRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (c: Ctx, accion: string, id: number | null, detalle: Record<string, unknown>) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo: "rol",
      recursoId: id === null ? null : String(id),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  const deny = async (c: Ctx, accion: string, reason: string, id: number | null = null) => {
    await audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo: "rol",
      recursoId: id === null ? null : String(id),
      resultado: "denegado",
      detalle: { motivo: reason },
      requestId: c.get("requestId"),
    });
    return fail(c, 403, API_ERROR.Forbidden, { reason });
  };

  /** Rol propio de este restaurante (las plantillas no se editan). */
  const ownRole = async (c: Ctx) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) return null;
    return (await rolesOf(sql, c.get("restaurant").id)).find((role) => role.id === id) ?? null;
  };

  const nameTaken = (c: Ctx, nombre: string, exceptId: number | null) =>
    roleNameTaken(sql, c.get("restaurant").id, nombre, exceptId);

  app.get("/:slug/equipo/roles", requirePermission(deps, PERMISSION.TeamView), async (c) => {
    const restauranteId = c.get("restaurant").id;
    const access = c.get("access");
    const [roles, usage] = await Promise.all([
      rolesOf(sql, restauranteId),
      sql<{ rol_id: number; miembros: number; invitaciones: number }[]>`
        SELECT r.id AS rol_id,
               (SELECT count(*)::int FROM public.membresia_rol mr
                JOIN   public.local_memberships m ON m.id = mr.membership_id
                WHERE  mr.rol_id = r.id AND m.restaurante_id = ${restauranteId}) AS miembros,
               (SELECT count(*)::int FROM public.restaurant_invites i
                WHERE  i.rol_id = r.id AND i.restaurante_id = ${restauranteId}
                  AND  i.used_at IS NULL AND i.revocada_at IS NULL
                  AND  i.expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')) AS invitaciones
        FROM   public.rol r
        WHERE  r.restaurante_id IS NULL OR r.restaurante_id = ${restauranteId}
      `,
    ]);
    const byRole = new Map(usage.map((row) => [row.rol_id, row]));
    const manage = access.permissions.has(PERMISSION.TeamManage);
    return c.json({
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        nombre: role.nombre,
        plantilla: role.plantilla,
        permisos: role.permisos,
        miembros: byRole.get(role.id)?.miembros ?? 0,
        invitaciones: byRole.get(role.id)?.invitaciones ?? 0,
        editable:
          manage && !role.plantilla && canGrantRole(access, role.permisos as PermissionCode[]),
        // Se puede copiar a un rol propio (Propietario no: no se recorta).
        personalizable:
          manage &&
          role.plantilla &&
          role.code !== ROLE_TEMPLATE.Owner &&
          canGrantRole(access, role.permisos as PermissionCode[]),
      })),
      // Permisos agrupados por módulo; solo se pueden dar los que tiene quien edita.
      catalogo: MODULES.map((module) => ({
        modulo: module.code,
        nombre: module.name,
        activo: access.activeModules.has(module.code),
        permisos: ALL_PERMISSIONS.filter((code) => PERMISSION_MODULE[code] === module.code).map(
          (code) => ({
            code,
            nombre: PERMISSION_LABEL[code],
            puedes_dar: access.permissions.has(code),
          }),
        ),
      })).filter((group) => group.permisos.length > 0),
    });
  });

  app.post("/:slug/equipo/roles", requirePermission(deps, PERMISSION.TeamManage), async (c) => {
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    if (!canGrantRole(c.get("access"), body.permisos)) {
      return deny(c, "team.role.create", "role_above_yours");
    }
    if (await nameTaken(c, body.nombre, null)) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    const restauranteId = c.get("restaurant").id;
    try {
      const id = await sql.begin((tx) => insertRole(tx, restauranteId, body.nombre, body.permisos));
      await record(c, "team.role.create", id, body);
      return c.json({ id }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
  });

  /**
   * «Personalizar» una plantilla: crea una copia propia del restaurante con los mismos permisos
   * y pasa a ella a quienes tenían la plantilla (miembros e invitaciones pendientes de ESTE
   * restaurante). La plantilla global no cambia. Propietario no se personaliza (el restaurante
   * nunca se queda sin propietario). No toca la columna antigua local_memberships.rol, que lee
   * el dashboard antiguo.
   */
  app.post(
    "/:slug/equipo/roles/:id/personalizar",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const restauranteId = c.get("restaurant").id;
      const template = await ownRole(c);
      if (!template) return fail(c, 404, API_ERROR.NotFound);
      if (!template.plantilla)
        return fail(c, 422, API_ERROR.InvalidBody, { reason: "not_template" });
      if (template.code === ROLE_TEMPLATE.Owner) {
        return deny(c, "team.role.customize", "owner_not_customizable", template.id);
      }
      if (!canGrantRole(c.get("access"), template.permisos as PermissionCode[])) {
        return deny(c, "team.role.customize", "role_above_yours", template.id);
      }
      const parsed = z
        .object({ nombre: z.string().trim().min(2).max(60).optional() })
        .safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const nombre = parsed.data.nombre ?? `${template.nombre} (personalizado)`;
      if (await nameTaken(c, nombre, null)) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      try {
        const result = await sql.begin(async (tx) => {
          const id = await insertRole(
            tx,
            restauranteId,
            nombre,
            template.permisos as PermissionCode[],
          );
          const moved = await tx`
            UPDATE public.membresia_rol mr SET rol_id = ${id}
            FROM   public.local_memberships m
            WHERE  m.id = mr.membership_id AND m.restaurante_id = ${restauranteId}
              AND  mr.rol_id = ${template.id}
          `;
          const invites = await tx`
            UPDATE public.restaurant_invites SET rol_id = ${id}
            WHERE  restaurante_id = ${restauranteId} AND rol_id = ${template.id}
              AND  used_at IS NULL AND revocada_at IS NULL
              AND  expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')
          `;
          return { id, miembros: moved.count, invitaciones: invites.count };
        });
        await record(c, "team.role.customize", result.id, {
          plantilla: template.code,
          nombre,
          permisos: template.permisos,
          miembros_movidos: result.miembros,
          invitaciones_movidas: result.invitaciones,
        });
        return c.json(
          {
            id: result.id,
            miembros_movidos: result.miembros,
            invitaciones_movidas: result.invitaciones,
          },
          201,
        );
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
        }
        throw error;
      }
    },
  );

  app.put("/:slug/equipo/roles/:id", requirePermission(deps, PERMISSION.TeamManage), async (c) => {
    const role = await ownRole(c);
    if (!role) return fail(c, 404, API_ERROR.NotFound);
    if (role.plantilla) return deny(c, "team.role.update", "template_role", role.id);
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const body = parsed.data;
    const access = c.get("access");
    if (
      !canGrantRole(access, role.permisos as PermissionCode[]) ||
      !canGrantRole(access, body.permisos)
    ) {
      return deny(c, "team.role.update", "role_above_yours", role.id);
    }
    if (await nameTaken(c, body.nombre, role.id)) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    await sql.begin((tx) => replaceRole(tx, role.id, body.nombre, body.permisos));
    await record(c, "team.role.update", role.id, {
      nombre: body.nombre,
      antes: role.permisos,
      despues: body.permisos,
    });
    return c.json({ id: role.id });
  });

  app.delete(
    "/:slug/equipo/roles/:id",
    requirePermission(deps, PERMISSION.TeamManage),
    async (c) => {
      const role = await ownRole(c);
      if (!role) return fail(c, 404, API_ERROR.NotFound);
      if (role.plantilla) return deny(c, "team.role.delete", "template_role", role.id);
      if (!canGrantRole(c.get("access"), role.permisos as PermissionCode[])) {
        return deny(c, "team.role.delete", "role_above_yours", role.id);
      }
      const usage = await roleUsage(sql, role.id, deps.now());
      if (usage.miembros > 0) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "role_in_use" });
      }
      if (usage.invitaciones > 0) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "pending_invites" });
      }
      await sql`DELETE FROM public.rol WHERE id = ${role.id} AND restaurante_id = ${c.get("restaurant").id}`;
      await record(c, "team.role.delete", role.id, { nombre: role.nombre });
      return c.json({ id: role.id });
    },
  );
}
