import {
  type AccessContext,
  buildAccessContext,
  type ModuleCode,
  PERMISSION,
  type PermissionCode,
} from "@konnecttia/access";
import type { Sql } from "../lib/db";

/** Duración de una sesión de soporte. Pasado este tiempo hay que volver a entrar con motivo. */
export const SUPPORT_MINUTES = 60;
export const SUPPORT_ACTION = {
  Enter: "plataforma.soporte.entrar",
  Leave: "plataforma.soporte.salir",
} as const;

/**
 * Lo que ve el equipo de Konnecttia en un restaurante ajeno: solo consulta, y sin datos
 * personales de clientes ni conversaciones. Es una lista cerrada (no depende de ningún rol).
 */
export const SUPPORT_PERMISSIONS: readonly PermissionCode[] = [
  PERMISSION.OrdersView,
  PERMISSION.MenuView,
  PERMISSION.SettingsView,
  PERMISSION.DeliveryView,
  PERMISSION.TeamView,
  PERMISSION.TablesView,
  PERMISSION.AnalyticsView,
  PERMISSION.StorefrontView,
  PERMISSION.HelpView,
];

export type SupportSession = { readonly expiraEn: Date; readonly motivo: string };

/**
 * Sesión de soporte vigente de una persona en un restaurante. Vive en la auditoría (no hay tabla
 * nueva): vale la ÚLTIMA entrada «entrar» si es posterior a cualquier «salir» y no ha caducado.
 * Exige además que la persona siga ACTIVA en el equipo de Konnecttia.
 */
export async function activeSupportSession(
  sql: Sql,
  userId: string,
  restauranteId: number,
  now: Date,
): Promise<SupportSession | null> {
  const [last] = await sql<{ accion: string; expira_en: string | null; motivo: string | null }[]>`
    SELECT a.accion, a.detalle->>'expira_en' AS expira_en, a.detalle->>'motivo' AS motivo
    FROM   public.auditoria a
    JOIN   public.plataforma_miembro pm ON pm.user_id = ${userId}::uuid AND pm.activo
    WHERE  a.restaurante_id = ${restauranteId} AND a.actor_id = ${userId}
      AND  a.resultado = 'ok' AND a.accion IN ${sql([SUPPORT_ACTION.Enter, SUPPORT_ACTION.Leave])}
    ORDER  BY a.id DESC
    LIMIT  1
  `;
  if (!last || last.accion !== SUPPORT_ACTION.Enter || !last.expira_en) return null;
  const expiraEn = new Date(last.expira_en);
  if (Number.isNaN(expiraEn.getTime()) || expiraEn <= now) return null;
  return { expiraEn, motivo: last.motivo ?? "" };
}

/** Acceso de solo lectura: módulos activos del restaurante y la lista cerrada de permisos. */
export async function loadSupportAccess(sql: Sql, restauranteId: number): Promise<AccessContext> {
  const modules = await sql<{ modulo_code: string }[]>`
    SELECT modulo_code FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restauranteId} AND estado = 'activo'
  `;
  return buildAccessContext({
    restauranteId,
    contractedModules: modules.map((row) => row.modulo_code as ModuleCode),
    rolePermissions: [SUPPORT_PERMISSIONS],
  });
}
