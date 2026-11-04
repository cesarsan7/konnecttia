import {
  ALL_PERMISSIONS,
  canGrantRole,
  MODULES,
  PERMISSION,
  PERMISSION_LABEL,
  PERMISSION_MODULE,
  type PermissionCode,
} from "@konnecttia/access";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { rolesOf } from "./panel-team";

/**
 * Roles del restaurante desde el panel (Equipo → Roles).
 * - Las plantillas (Propietario, Encargado, Personal, Consulta, Mesero, Repartidor) las definen
 *   los desarrolladores en packages/access + migración: aquí solo se leen.
 * - Los roles propios se crean, editan y borran con team.manage. Sin escalada: solo se dan
 *   permisos que tiene quien edita, y no se toca un rol con permisos que no tiene.
 * - No se borra un rol asignado a alguien ni con invitaciones pendientes.
 */

type Ctx = Context<AppEnv>;

const KNOWN = new Set<string>(ALL_PERMISSIONS);

const roleSchema = z.object({
  nombre: z.string().trim().min(2).max(60),
  permisos: z
    .array(z.string().refine((code) => KNOWN.has(code)))
    .min(1)
    .max(ALL_PERMISSIONS.length)
    .transform((list) => [...new Set(list)] as PermissionCode[]),
});

/** Código estable a partir del nombre: «Cajero de noche» → «r_cajero_de_noche». */
export function roleCode(nombre: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `r_${slug || "rol"}`;
}

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

  const nameTaken = async (c: Ctx, nombre: string, exceptId: number | null) => {
    const rows = await sql`
      SELECT 1 FROM public.rol
      WHERE  (restaurante_id = ${c.get("restaurant").id} OR restaurante_id IS NULL)
        AND  lower(nombre) = lower(${nombre})
        AND  (${exceptId}::bigint IS NULL OR id <> ${exceptId})
    `;
    return rows.length > 0;
  };

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
                  AND  i.expires_at > (now() AT TIME ZONE 'UTC')) AS invitaciones
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
      const id = await sql.begin(async (tx) => {
        // Código único: si ya existe (otro nombre con el mismo resultado), se añade un número.
        const base = roleCode(body.nombre);
        const taken = await tx<{ code: string }[]>`
          SELECT code FROM public.rol
          WHERE  restaurante_id = ${restauranteId} AND code LIKE ${`${base}%`}
        `;
        const codes = new Set(taken.map((row) => row.code));
        let code = base;
        for (let n = 2; codes.has(code); n += 1) code = `${base}_${n}`;
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO public.rol (restaurante_id, code, nombre, es_plantilla)
          VALUES (${restauranteId}, ${code}, ${body.nombre}, false)
          RETURNING id
        `;
        if (!row) throw new Error("El INSERT del rol no devolvió filas");
        await tx`
          INSERT INTO public.rol_permiso (rol_id, permiso_code)
          SELECT ${row.id}, unnest(${body.permisos}::text[])
        `;
        return row.id;
      });
      await record(c, "team.role.create", id, body);
      return c.json({ id }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
  });

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
    await sql.begin(async (tx) => {
      await tx`UPDATE public.rol SET nombre = ${body.nombre} WHERE id = ${role.id}`;
      await tx`DELETE FROM public.rol_permiso WHERE rol_id = ${role.id}`;
      await tx`
        INSERT INTO public.rol_permiso (rol_id, permiso_code)
        SELECT ${role.id}, unnest(${body.permisos}::text[])
      `;
    });
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
      const [usage] = await sql<{ miembros: number; invitaciones: number }[]>`
        SELECT (SELECT count(*)::int FROM public.membresia_rol WHERE rol_id = ${role.id}) AS miembros,
               (SELECT count(*)::int FROM public.restaurant_invites
                WHERE  rol_id = ${role.id} AND used_at IS NULL AND revocada_at IS NULL
                  AND  expires_at > (now() AT TIME ZONE 'UTC')) AS invitaciones
      `;
      if ((usage?.miembros ?? 0) > 0) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "role_in_use" });
      }
      if ((usage?.invitaciones ?? 0) > 0) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "pending_invites" });
      }
      await sql`DELETE FROM public.rol WHERE id = ${role.id} AND restaurante_id = ${c.get("restaurant").id}`;
      await record(c, "team.role.delete", role.id, { nombre: role.nombre });
      return c.json({ id: role.id });
    },
  );
}
