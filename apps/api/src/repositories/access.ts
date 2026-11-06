import {
  type AccessContext,
  buildAccessContext,
  type ModuleCode,
  type PermissionCode,
} from "@konnecttia/access";
import type { Sql } from "../lib/db";

const ACTIVE_MODULE_STATE = "activo";

/**
 * Contexto de acceso de un usuario en un restaurante: módulos activos del restaurante y permisos
 * de los roles de su membresía. `null` si el usuario no es miembro de ese restaurante.
 */
export async function loadAccessContext(
  sql: Sql,
  userId: string,
  restauranteId: number,
): Promise<AccessContext | null> {
  const memberships = await sql<{ id: number }[]>`
    SELECT id FROM public.local_memberships
    WHERE  user_id = ${userId}::uuid AND restaurante_id = ${restauranteId}
    LIMIT  1
  `;
  const membership = memberships[0];
  if (!membership) return null;

  const [modules, permissions, branches] = await Promise.all([
    sql<{ modulo_code: string }[]>`
      SELECT modulo_code FROM public.restaurante_modulo
      WHERE  restaurante_id = ${restauranteId} AND estado = ${ACTIVE_MODULE_STATE}
    `,
    sql<{ permiso_code: string }[]>`
      SELECT DISTINCT rp.permiso_code
      FROM   public.membresia_rol mr
      JOIN   public.rol r          ON r.id = mr.rol_id
      JOIN   public.rol_permiso rp ON rp.rol_id = r.id
      WHERE  mr.membership_id = ${membership.id}
        AND  (r.restaurante_id IS NULL OR r.restaurante_id = ${restauranteId})
    `,
    sql<{ sucursal_id: number }[]>`
      SELECT sucursal_id FROM public.membresia_sucursal WHERE membership_id = ${membership.id}
    `,
  ]);

  return buildAccessContext({
    restauranteId,
    contractedModules: modules.map((row) => row.modulo_code as ModuleCode),
    rolePermissions: [permissions.map((row) => row.permiso_code as PermissionCode)],
    branchIds: branches.map((row) => row.sucursal_id),
  });
}

export type AuditEntry = {
  /** null en acciones de plataforma sin restaurante (p. ej. un acceso denegado al panel interno). */
  readonly restauranteId: number | null;
  readonly actorTipo: "usuario" | "cliente" | "agente" | "sistema" | "konnecttia" | "plataforma";
  readonly actorId: string | null;
  readonly accion: string;
  readonly recursoTipo: string;
  readonly recursoId: string | null;
  readonly resultado: "ok" | "denegado" | "error";
  readonly detalle?: Record<string, unknown>;
  readonly requestId?: string | null;
};

export async function audit(sql: Sql, entry: AuditEntry): Promise<void> {
  await sql`
    INSERT INTO public.auditoria
      (restaurante_id, actor_tipo, actor_id, accion, recurso_tipo, recurso_id, resultado, detalle, request_id)
    VALUES (
      ${entry.restauranteId}, ${entry.actorTipo}, ${entry.actorId}, ${entry.accion},
      ${entry.recursoTipo}, ${entry.recursoId}, ${entry.resultado},
      ${sql.json((entry.detalle ?? {}) as Record<string, string>)}, ${entry.requestId ?? null}
    )
  `;
}
