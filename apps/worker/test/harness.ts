import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Mailer, MailMessage } from "@konnecttia/notifications";
import postgres from "postgres";
import { createSql, type Sql } from "../src/db";
import { silentLogger } from "../src/logger";
import type { ProcessorDeps } from "../src/processor";

/**
 * Base de datos desechable para las pruebas de integración: aplica las migraciones reales y los
 * datos sintéticos de la API (`apps/api/test/fixtures.sql`: restaurantes 101 y 102).
 * Requiere TEST_DATABASE_URL (nunca producción).
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export type FakeMailer = Mailer & {
  readonly sent: MailMessage[];
  /** Falla la próxima vez que se envíe a estas direcciones (una vez cada una). */
  failNext: Set<string>;
  /** Falla siempre. */
  alwaysFail: boolean;
};

export function createFakeMailer(): FakeMailer {
  const sent: MailMessage[] = [];
  const mailer: FakeMailer = {
    sent,
    failNext: new Set(),
    alwaysFail: false,
    send: async (message) => {
      if (mailer.alwaysFail || mailer.failNext.delete(message.to)) {
        throw new Error("Resend respondió 500");
      }
      sent.push(message);
    },
  };
  return mailer;
}

export type TestDb = {
  readonly sql: Sql;
  readonly deps: (overrides?: Partial<ProcessorDeps>) => ProcessorDeps;
  readonly close: () => Promise<void>;
};

export async function setupTestDb(): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("Falta TEST_DATABASE_URL");
  const name = `konnecttia_worker_test_${process.pid}_${Date.now()}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const url = TEST_DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
  const root = join(import.meta.dirname, "../../..");
  execFileSync("bash", [join(root, "infra/scripts/migrate.sh")], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  const sql = createSql(url);
  await sql.unsafe(readFileSync(join(root, "apps/api/test/fixtures.sql"), "utf8"));

  const baseDeps: ProcessorDeps = {
    sql,
    mailer: createFakeMailer(),
    log: silentLogger,
    panelUrl: "https://panel.example.test",
    webUrl: "https://web.example.test",
    batchSize: 10,
    leaseSeconds: 300,
    retry: { maxAttempts: 3, backoffBaseSeconds: 30, backoffMaxSeconds: 600 },
  };
  return {
    sql,
    deps: (overrides) => ({ ...baseDeps, ...overrides }),
    close: async () => {
      await sql.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}
