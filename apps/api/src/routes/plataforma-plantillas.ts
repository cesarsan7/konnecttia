import {
  ALL_PERMISSIONS,
  MODULES,
  PERMISSION,
  PERMISSION_LABEL,
  PERMISSION_MODULE,
  type PermissionCode,
  ROLE_TEMPLATE,
  ROLE_TEMPLATE_PERMISSIONS,
  type RoleTemplateCode,
} from "@konnecttia/access";
import { PLATFORM_ROLE } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import { replaceRole, roleSchema, roleUsage } from "../repositories/roles";

/**
 * Plantillas de rol propias de Konnecttia, dentro del panel interno (ADR 0009). Son roles
 * globales (`restaurante_id IS NULL`, `es_plantilla`) que todos los restaurantes ven y pueden
 * asignar, como Encargado o Mesero, pero que el equipo de Konnecttia crea y ajusta sin migración.
 * - «soporte» lee y «admin» escribe; toda escritura se audita con actor «plataforma» y sin
 *   restaurante (es global).
 * - Las seis plantillas base (`ROLE_TEMPLATE`) conservan su código y su nombre (varias reglas
 *   dependen del código: propietario, encargado) y no se borran, pero sus permisos sí se pueden
 *   quitar o añadir. Los permisos con los que nacen (`ROLE_TEMPLATE_PERMISSIONS`) quedan como
 *   referencia para «restaurar». Propietario conserva siempre los permisos mínimos para que un
 *   restaurante no se quede sin nadie que gestione el equipo y los ajustes.
 * - Cambiar los permisos de una plantilla afecta al instante a quien la tenga en cualquier
 *   restaurante: la respuesta dice cuántas personas y restaurantes.
 * - No se borra una plantilla en uso (personas o invitaciones pendientes).
 */

type Ctx = Context<AppEnv>;

const BASE_CODES: ReadonlySet<string> = new Set(Object.values(ROLE_TEMPLATE));

/** Permisos que Propietario no puede perder: sin ellos nadie podría gestionar equipo ni ajustes. */
export const OWNER_REQUIRED_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION.TeamView,
  PERMISSION.TeamManage,
  PERMISSION.SettingsView,
  PERMISSION.SettingsUpdate,
];

const defaultsOf = (code: string): readonly PermissionCode[] | null =>
  BASE_CODES.has(code) ? ROLE_TEMPLATE_PERMISSIONS[code as RoleTemplateCode] : null;

/** Código estable a partir del nombre: «Cajero de noche» → «t_cajero_de_noche». */
export function templateCode(nombre: string): string {
  const slug = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `t_${slug || "plantilla"}`;
}

type TemplateRow = {
  id: number;
  code: string;
  nombre: string;
  permisos: string[];
  miembros: number;
  invitaciones: number;
  restaurantes: number;
};

export function registerPlatformTemplateRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  const record = (c: Ctx, accion: string, id: number, detalle: Record<string, unknown>) =>
    audit(sql, {
      restauranteId: null,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion,
      recursoTipo: "rol_plantilla",
      recursoId: String(id),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  const templateFromUrl = async (c: Ctx) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id < 1) return null;
    const [row] = await sql<{ id: number; code: string; nombre: string; permisos: string[] }[]>`
      SELECT r.id, r.code, r.nombre,
             COALESCE(array_agg(rp.permiso_code ORDER BY rp.permiso_code)
                      FILTER (WHERE rp.permiso_code IS NOT NULL), '{}') AS permisos
      FROM   public.rol r
      LEFT   JOIN public.rol_permiso rp ON rp.rol_id = r.id
      WHERE  r.id = ${id} AND r.restaurante_id IS NULL AND r.es_plantilla
      GROUP  BY r.id
    `;
    return row ?? null;
  };

  /** Nombre ya usado por otra plantilla o por un rol propio de algún restaurante. */
  const nameConflict = async (nombre: string, exceptId: number | null) => {
    const rows = await sql<{ restaurante_id: number | null }[]>`
      SELECT restaurante_id FROM public.rol
      WHERE  lower(nombre) = lower(${nombre})
        AND  (${exceptId}::bigint IS NULL OR id <> ${exceptId})
      LIMIT  1
    `;
    return rows.length > 0;
  };

  app.get("/plantillas", reader, async (c) => {
    const templates = await sql<TemplateRow[]>`
      SELECT r.id, r.code, r.nombre,
             COALESCE((SELECT array_agg(rp.permiso_code ORDER BY rp.permiso_code)
                       FROM public.rol_permiso rp WHERE rp.rol_id = r.id), '{}') AS permisos,
             (SELECT count(*)::int FROM public.membresia_rol mr WHERE mr.rol_id = r.id) AS miembros,
             (SELECT count(*)::int FROM public.restaurant_invites i
              WHERE  i.rol_id = r.id AND i.used_at IS NULL AND i.revocada_at IS NULL
                AND  i.expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')) AS invitaciones,
             (SELECT count(DISTINCT m.restaurante_id)::int
              FROM   public.membresia_rol mr
              JOIN   public.local_memberships m ON m.id = mr.membership_id
              WHERE  mr.rol_id = r.id) AS restaurantes
      FROM   public.rol r
      WHERE  r.restaurante_id IS NULL AND r.es_plantilla
      ORDER  BY r.id
    `;
    return c.json({
      plantillas: templates.map((template) => ({
        ...template,
        base: BASE_CODES.has(template.code),
        // Las base también se editan (solo permisos); no se renombran ni se borran.
        editable: true,
        borrable: !BASE_CODES.has(template.code),
        por_defecto: defaultsOf(template.code),
        minimos: template.code === ROLE_TEMPLATE.Owner ? OWNER_REQUIRED_PERMISSIONS : [],
      })),
      catalogo: MODULES.map((module) => ({
        modulo: module.code,
        nombre: module.name,
        permisos: ALL_PERMISSIONS.filter((code) => PERMISSION_MODULE[code] === module.code).map(
          (code) => ({ code, nombre: PERMISSION_LABEL[code] }),
        ),
      })).filter((group) => group.permisos.length > 0),
    });
  });

  app.post("/plantillas", writer, async (c) => {
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: parsed.error.issues[0]?.path.join(".") });
    }
    const input = parsed.data;
    if (await nameConflict(input.nombre, null)) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    try {
      const id = await sql.begin(async (tx) => {
        const base = templateCode(input.nombre);
        const taken = await tx<{ code: string }[]>`
          SELECT code FROM public.rol WHERE restaurante_id IS NULL AND code LIKE ${`${base}%`}
        `;
        const codes = new Set(taken.map((row) => row.code));
        let code = base;
        for (let n = 2; codes.has(code); n += 1) code = `${base}_${n}`;
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO public.rol (restaurante_id, code, nombre, es_plantilla)
          VALUES (NULL, ${code}, ${input.nombre}, true)
          RETURNING id
        `;
        if (!row) throw new Error("El INSERT de la plantilla no devolvió filas");
        await tx`
          INSERT INTO public.rol_permiso (rol_id, permiso_code)
          SELECT ${row.id}, unnest(${[...input.permisos]}::text[])
        `;
        return row.id;
      });
      await record(c, "plataforma.plantilla.crear", id, {
        nombre: input.nombre,
        permisos: input.permisos,
      });
      return c.json({ id }, 201);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
  });

  app.put("/plantillas/:id", writer, async (c) => {
    const template = await templateFromUrl(c);
    if (!template) return fail(c, 404, API_ERROR.NotFound);
    const isBase = BASE_CODES.has(template.code);
    const parsed = roleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: parsed.error.issues[0]?.path.join(".") });
    }
    // Una base conserva su nombre: solo cambian sus permisos.
    const input = isBase ? { ...parsed.data, nombre: template.nombre } : parsed.data;
    if (template.code === ROLE_TEMPLATE.Owner) {
      const missing = OWNER_REQUIRED_PERMISSIONS.filter((code) => !input.permisos.includes(code));
      if (missing.length > 0) {
        return fail(c, 422, API_ERROR.Unprocessable, { reason: "owner_locked", missing });
      }
    }
    if (!isBase && (await nameConflict(input.nombre, template.id))) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    await sql.begin((tx) => replaceRole(tx, template.id, input.nombre, input.permisos));
    const usage = await roleUsage(sql, template.id, deps.now());
    await record(c, "plataforma.plantilla.editar", template.id, {
      nombre: input.nombre,
      base: isBase,
      antes: template.permisos,
      despues: input.permisos,
      miembros_afectados: usage.miembros,
    });
    return c.json({ id: template.id, miembros_afectados: usage.miembros });
  });

  app.delete("/plantillas/:id", writer, async (c) => {
    const template = await templateFromUrl(c);
    if (!template) return fail(c, 404, API_ERROR.NotFound);
    if (BASE_CODES.has(template.code)) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: "base_template" });
    }
    const usage = await roleUsage(sql, template.id, deps.now());
    if (usage.miembros > 0) return fail(c, 409, API_ERROR.Conflict, { reason: "role_in_use" });
    if (usage.invitaciones > 0) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "pending_invites" });
    }
    await sql`DELETE FROM public.rol WHERE id = ${template.id} AND restaurante_id IS NULL`;
    await record(c, "plataforma.plantilla.borrar", template.id, { nombre: template.nombre });
    return c.json({ id: template.id });
  });
}
