import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "./db";

/** Clave del bloqueo de PostgreSQL: dos instancias de la API no migran a la vez. */
const LOCK_KEY = 7426001;

export type MigrationLogger = (message: string, fields?: Record<string, unknown>) => void;

/**
 * Aplica las migraciones pendientes de `dir`, igual que `infra/scripts/migrate.sh`: orden por
 * nombre, cada una con su registro en `public.konnecttia_migrations` en UNA transacción (si falla,
 * la base queda como estaba) y el mismo registro, así que ambos caminos se pueden combinar.
 *
 * No hace el «baseline» solo: una base que ya es EasyOrder y aún no tiene registro de
 * migraciones se marca a mano una vez (`migrate.sh --baseline`). Sin esa guarda, intentaría
 * recrear las tablas existentes.
 */
export async function runMigrations(
  sql: Sql,
  dir: string,
  log: MigrationLogger = () => {},
): Promise<string[]> {
  const files = (await readdir(dir)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  const lock = await sql.reserve();
  const applied: string[] = [];
  try {
    await lock`SELECT pg_advisory_lock(${LOCK_KEY}::bigint)`;
    // Solo se crea si falta: con un rol sin CREATE en `public` (p. ej. konnecttia_app) un
    // `CREATE TABLE IF NOT EXISTS` falla aunque la tabla exista.
    const registry = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('public.konnecttia_migrations') IS NOT NULL AS exists`;
    if (!registry[0]?.exists) {
      await sql`CREATE TABLE IF NOT EXISTS public.konnecttia_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`;
    }
    const done = new Set(
      (await sql<{ name: string }[]>`SELECT name FROM public.konnecttia_migrations`).map(
        (row) => row.name,
      ),
    );
    if (!done.has("0000_baseline.sql")) {
      const rows = await sql<{ exists: boolean }[]>`
        SELECT to_regclass('public.restaurante') IS NOT NULL AS exists`;
      if (rows[0]?.exists) {
        throw new Error(
          "La base ya tiene tablas de EasyOrder pero no el registro de migraciones: " +
            "ejecuta una vez infra/scripts/migrate.sh --baseline (ver packages/db/README.md).",
        );
      }
    }
    for (const file of files) {
      if (done.has(file)) continue;
      const text = await readFile(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(text);
        await tx`INSERT INTO public.konnecttia_migrations (name) VALUES (${file})`;
      });
      applied.push(file);
      log("Migración aplicada", { migration: file });
    }
    if (applied.length === 0) log("Migraciones al día");
    return applied;
  } finally {
    try {
      await lock`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`;
    } finally {
      lock.release();
    }
  }
}
