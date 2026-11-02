import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { createApp } from "../src/app";
import type { AuthenticatedUser } from "../src/context";
import { createSql, type Sql } from "../src/lib/db";

/**
 * Base de datos desechable para pruebas de integración: aplica todas las migraciones reales
 * y los datos sintéticos de `fixtures.sql`. Requiere TEST_DATABASE_URL (nunca producción).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const USERS = {
  ownerA: { userId: "00000000-0000-0000-0000-0000000000a1", email: "owner-a@test.local" },
  viewerA: { userId: "00000000-0000-0000-0000-0000000000a2", email: "viewer-a@test.local" },
  ownerB: { userId: "00000000-0000-0000-0000-0000000000b1", email: "owner-b@test.local" },
} as const satisfies Record<string, AuthenticatedUser>;

export type TestContext = {
  readonly sql: Sql;
  readonly app: ReturnType<typeof createApp>;
  readonly close: () => Promise<void>;
};

export async function setupTestApp(): Promise<TestContext> {
  if (!TEST_DATABASE_URL) {
    throw new Error("Falta TEST_DATABASE_URL");
  }
  const name = `konnecttia_api_test_${process.pid}_${Date.now()}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  const root = join(import.meta.dirname, "../../..");
  execFileSync("bash", [join(root, "infra/scripts/migrate.sh")], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  const sql = createSql(url);
  await sql.unsafe(readFileSync(join(import.meta.dirname, "fixtures.sql"), "utf8"));

  const tokens = new Map<string, AuthenticatedUser>(
    Object.entries(USERS).map(([key, user]) => [`token-${key}`, user]),
  );
  const app = createApp({
    sql,
    now: () => new Date("2026-11-03T13:00:00Z"),
    clientIpHeader: "x-real-ip",
    allowedOrigins: [],
    verifyToken: async (token) => tokens.get(token) ?? null,
  });

  return {
    sql,
    app,
    close: async () => {
      await sql.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

export const auth = (user: keyof typeof USERS) => ({ Authorization: `Bearer token-${user}` });
