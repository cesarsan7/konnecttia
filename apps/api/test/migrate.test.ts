import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSql, type Sql } from "../src/lib/db";
import { runMigrations } from "../src/lib/migrate";
import { TEST_DATABASE_URL } from "./harness";

const REAL_DIR = join(__dirname, "../../../packages/db/migrations");

describe.skipIf(!TEST_DATABASE_URL)("migraciones al arrancar", () => {
  const admin = postgres(TEST_DATABASE_URL ?? "", { max: 1 });
  const created: string[] = [];
  const open: Sql[] = [];
  let dir = "";

  async function freshDb(): Promise<Sql> {
    const name = `konnecttia_auto_migrate_${process.pid}_${created.length}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    created.push(name);
    const url = `${(TEST_DATABASE_URL ?? "").replace(/\/[^/]*$/, "")}/${name}`;
    const sql = createSql(url);
    open.push(sql);
    return sql;
  }

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "migraciones-"));
    await writeFile(join(dir, "0000_baseline.sql"), "CREATE TABLE public.uno (id int);");
    await writeFile(join(dir, "0001_dos.sql"), "CREATE TABLE public.dos (id int);");
    await writeFile(join(dir, "notas.txt"), "no es una migración");
  });

  afterAll(async () => {
    for (const sql of open) await sql.end({ timeout: 1 });
    for (const name of created) await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  });

  it("aplica las pendientes en orden y a la segunda ya no hace nada", async () => {
    const sql = await freshDb();
    expect(await runMigrations(sql, dir)).toEqual(["0000_baseline.sql", "0001_dos.sql"]);
    expect(await runMigrations(sql, dir)).toEqual([]);
    const rows = await sql<{ name: string }[]>`
      SELECT name FROM public.konnecttia_migrations ORDER BY name`;
    expect(rows.map((row) => row.name)).toEqual(["0000_baseline.sql", "0001_dos.sql"]);
  });

  it("si una migración falla, se deshace y las anteriores siguen aplicadas", async () => {
    const sql = await freshDb();
    const bad = await mkdtemp(join(tmpdir(), "migraciones-mal-"));
    await writeFile(join(bad, "0000_baseline.sql"), "CREATE TABLE public.uno (id int);");
    await writeFile(join(bad, "0001_rota.sql"), "CREATE TABLE public.medio (id int); SELECT 1/0;");
    await expect(runMigrations(sql, bad)).rejects.toThrow();
    const [tables] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'medio'`;
    expect(tables?.n).toBe(0);
    const rows = await sql<{ name: string }[]>`SELECT name FROM public.konnecttia_migrations`;
    expect(rows.map((row) => row.name)).toEqual(["0000_baseline.sql"]);
    await rm(bad, { recursive: true, force: true });
  });

  it("no toca una base de EasyOrder que aún no tiene el registro", async () => {
    const sql = await freshDb();
    await sql`CREATE TABLE public.restaurante (id int)`;
    await expect(runMigrations(sql, dir)).rejects.toThrow(/--baseline/);
    const [tables] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'uno'`;
    expect(tables?.n).toBe(0);
  });

  it("dos instancias a la vez no se pisan", async () => {
    const sql = await freshDb();
    const otra = createSql(
      `${(TEST_DATABASE_URL ?? "").replace(/\/[^/]*$/, "")}/${created[created.length - 1]}`,
    );
    open.push(otra);
    const [a, b] = await Promise.all([runMigrations(sql, dir), runMigrations(otra, dir)]);
    expect([...a, ...b].sort()).toEqual(["0000_baseline.sql", "0001_dos.sql"]);
  });

  it("aplica las migraciones reales sobre una base vacía", async () => {
    const sql = await freshDb();
    const applied = await runMigrations(sql, REAL_DIR);
    expect(applied[0]).toBe("0000_baseline.sql");
    expect(applied.length).toBeGreaterThan(20);
  });
});
