import type { PlatformRole } from "@konnecttia/domain";
import type { AuthAccount, AuthAdmin } from "../lib/auth-admin";
import type { Sql } from "../lib/db";

/** Una cuenta sin restaurante solo se ofrece para borrar pasado este tiempo (invitaciones en curso). */
export const ORPHAN_MIN_AGE_DAYS = 3;

export type PlatformMember = {
  readonly user_id: string;
  readonly email: string | null;
  readonly rol: PlatformRole;
  readonly activo: boolean;
  readonly created_at: string;
};

export const listPlatformMembers = (sql: Sql) =>
  sql<PlatformMember[]>`
    SELECT user_id::text AS user_id, email, rol, activo, created_at
    FROM   public.plataforma_miembro ORDER BY activo DESC, created_at, email
  `;

/** Administradores activos que quedarían tras un cambio (para no dejar el panel sin nadie). */
export async function activeAdminsExcept(sql: Sql, userId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM public.plataforma_miembro
    WHERE  rol = 'admin' AND activo AND user_id <> ${userId}::uuid
  `;
  return row?.n ?? 0;
}

/**
 * ¿La cuenta no tiene ningún uso? Sin pertenencia a un restaurante, sin acceso al panel interno
 * y sin invitación pendiente a su email. Es la condición para poder borrarla de Supabase.
 */
export async function isOrphan(sql: Sql, account: AuthAccount): Promise<boolean> {
  const [row] = await sql<{ used: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM public.local_memberships WHERE user_id = ${account.id}::uuid)
      OR EXISTS (SELECT 1 FROM public.plataforma_miembro WHERE user_id = ${account.id}::uuid)
      OR EXISTS (SELECT 1 FROM public.restaurante_prueba WHERE user_id = ${account.id}::uuid)
      OR (${account.email}::text IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.restaurant_invites
            WHERE  lower(email) = lower(${account.email}::text)
              AND  used_at IS NULL AND revocada_at IS NULL AND expires_at > now()))
    ) AS used
  `;
  return !(row?.used ?? true);
}

/** Cuentas de Supabase sin ningún uso y con más de `ORPHAN_MIN_AGE_DAYS` días. */
export async function listOrphans(
  sql: Sql,
  authAdmin: AuthAdmin,
  now: Date,
): Promise<AuthAccount[]> {
  const limit = now.getTime() - ORPHAN_MIN_AGE_DAYS * 86_400_000;
  const accounts = (await authAdmin.listAccounts()).filter(
    (account) => Date.parse(account.createdAt) <= limit,
  );
  const result: AuthAccount[] = [];
  for (const account of accounts) {
    if (await isOrphan(sql, account)) result.push(account);
  }
  return result;
}
