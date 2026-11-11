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

export type SupportLogEntry = {
  readonly id: number;
  readonly entrada: string;
  readonly email: string | null;
  readonly rol: string | null;
  readonly motivo: string;
  readonly expira_en: string | null;
  /** Cuándo pulsó «Salir»; null si se dejó caducar. */
  readonly salida: string | null;
};

/** Accesos de soporte a un restaurante, del más reciente al más antiguo. */
export async function listSupportLog(
  sql: Sql,
  restauranteId: number,
  limit = 50,
): Promise<SupportLogEntry[]> {
  const rows = await sql<
    {
      id: number;
      entrada: Date;
      email: string | null;
      rol: string | null;
      motivo: string | null;
      expira_en: string | null;
      salida: Date | null;
    }[]
  >`
    SELECT e.id::int AS id, e.created_at AS entrada, e.detalle->>'email' AS email,
           e.detalle->>'rol' AS rol, e.detalle->>'motivo' AS motivo,
           e.detalle->>'expira_en' AS expira_en,
           (SELECT min(l.created_at) FROM public.auditoria l
            WHERE  l.restaurante_id = e.restaurante_id AND l.actor_id = e.actor_id
              AND  l.accion = ${SUPPORT_ACTION.Leave} AND l.resultado = 'ok' AND l.id > e.id) AS salida
    FROM   public.auditoria e
    WHERE  e.restaurante_id = ${restauranteId} AND e.accion = ${SUPPORT_ACTION.Enter}
      AND  e.resultado = 'ok'
    ORDER  BY e.id DESC
    LIMIT  ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    entrada: row.entrada.toISOString(),
    email: row.email,
    rol: row.rol,
    motivo: row.motivo ?? "",
    expira_en: row.expira_en,
    salida: row.salida ? row.salida.toISOString() : null,
  }));
}
