import { ALL_PERMISSIONS, type PermissionCode } from "@konnecttia/access";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { Sql } from "../lib/db";

type Tx = TransactionSql<{ bigint: number }>;

/**
 * Operaciones sobre roles propios de un restaurante, compartidas por el panel del restaurante
 * (Equipo → Roles) y por el panel interno de Konnecttia. Quien llama decide los permisos y la
 * regla de no escalada; aquí solo se escribe.
 */

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export const roleSchema = z.object({
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

/** ¿Hay ya un rol (propio o plantilla) con ese nombre? `exceptId` ignora el rol que se edita. */
export async function roleNameTaken(
  sql: Sql | Tx,
  restauranteId: number,
  nombre: string,
  exceptId: number | null,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM public.rol
    WHERE  (restaurante_id = ${restauranteId} OR restaurante_id IS NULL)
      AND  lower(nombre) = lower(${nombre})
      AND  (${exceptId}::bigint IS NULL OR id <> ${exceptId})
  `;
  return rows.length > 0;
}

/** Crea un rol propio con sus permisos. El código es único: si choca, se añade un número. */
export async function insertRole(
  tx: Tx,
  restauranteId: number,
  nombre: string,
  permisos: readonly PermissionCode[],
): Promise<number> {
  const base = roleCode(nombre);
  const taken = await tx<{ code: string }[]>`
    SELECT code FROM public.rol
    WHERE  restaurante_id = ${restauranteId} AND code LIKE ${`${base}%`}
  `;
  const codes = new Set(taken.map((row) => row.code));
  let code = base;
  for (let n = 2; codes.has(code); n += 1) code = `${base}_${n}`;
  const [row] = await tx<{ id: number }[]>`
    INSERT INTO public.rol (restaurante_id, code, nombre, es_plantilla)
    VALUES (${restauranteId}, ${code}, ${nombre}, false)
    RETURNING id
  `;
  if (!row) throw new Error("El INSERT del rol no devolvió filas");
  await tx`
    INSERT INTO public.rol_permiso (rol_id, permiso_code)
    SELECT ${row.id}, unnest(${[...permisos]}::text[])
  `;
  return row.id;
}

/** Cambia el nombre y sustituye los permisos de un rol propio. */
export async function replaceRole(
  tx: Tx,
  roleId: number,
  nombre: string,
  permisos: readonly PermissionCode[],
): Promise<void> {
  await tx`UPDATE public.rol SET nombre = ${nombre} WHERE id = ${roleId}`;
  await tx`DELETE FROM public.rol_permiso WHERE rol_id = ${roleId}`;
  await tx`
    INSERT INTO public.rol_permiso (rol_id, permiso_code)
    SELECT ${roleId}, unnest(${[...permisos]}::text[])
  `;
}

/** Miembros que tienen el rol e invitaciones pendientes que lo usan. */
export async function roleUsage(
  sql: Sql | Tx,
  roleId: number,
  now: Date,
): Promise<{ miembros: number; invitaciones: number }> {
  const [usage] = await sql<{ miembros: number; invitaciones: number }[]>`
    SELECT (SELECT count(*)::int FROM public.membresia_rol WHERE rol_id = ${roleId}) AS miembros,
           (SELECT count(*)::int FROM public.restaurant_invites
            WHERE  rol_id = ${roleId} AND used_at IS NULL AND revocada_at IS NULL
              AND  expires_at > (${now}::timestamptz AT TIME ZONE 'UTC')) AS invitaciones
  `;
  return usage ?? { miembros: 0, invitaciones: 0 };
}
