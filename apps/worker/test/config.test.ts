import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildNoticeConfig,
  CONFIG_KEY,
  DEFAULT_CUSTOMER_STATUSES,
  MAX_LOCAL_RECIPIENTS,
  parseEmailList,
  parseFlag,
  parseStatusList,
} from "../src/config";
import { loadEnv } from "../src/env";

describe("configuración de avisos", () => {
  it("solo «true» enciende un aviso", () => {
    expect(parseFlag("true")).toBe(true);
    expect(parseFlag(" TRUE ")).toBe(true);
    expect(parseFlag("false")).toBe(false);
    expect(parseFlag("1")).toBe(false);
    expect(parseFlag(undefined)).toBe(false);
  });

  it("la lista de emails admite comas, puntos y comas y espacios, sin repetidos ni inválidos", () => {
    expect(parseEmailList("A@x.test, b@x.test;a@x.test  c@x.test, roto, @x.test, d@x")).toEqual([
      "a@x.test",
      "b@x.test",
      "c@x.test",
    ]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });

  it("limita el número de destinatarios", () => {
    const many = Array.from({ length: 30 }, (_, i) => `u${i}@x.test`).join(",");
    expect(parseEmailList(many)).toHaveLength(MAX_LOCAL_RECIPIENTS);
  });

  it("sin lista de estados valen los de por defecto", () => {
    expect([...parseStatusList(undefined)]).toEqual([...DEFAULT_CUSTOMER_STATUSES]);
    expect([...parseStatusList("  ")]).toEqual([...DEFAULT_CUSTOMER_STATUSES]);
    expect([...parseStatusList("listo, Cancelado")]).toEqual(["listo", "cancelado"]);
  });

  it("sin ninguna clave todo está apagado", () => {
    const config = buildNoticeConfig(new Map());
    expect(config.localEnabled).toBe(false);
    expect(config.customerEnabled).toBe(false);
    expect(config.localRecipients).toEqual([]);
  });

  it.each(Object.values(CONFIG_KEY))("%s está documentada en config_clave", (key) => {
    const dir = join(import.meta.dirname, "../../../packages/db/migrations");
    const sql = readdirSync(dir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => readFileSync(join(dir, file), "utf8"))
      .join("\n");
    expect(sql).toContain(`('${key}',`);
  });
});

describe("variables de entorno", () => {
  const base = { DATABASE_URL: "postgres://u:p@localhost:5432/db" };

  it("solo DATABASE_URL es obligatoria", () => {
    const env = loadEnv(base);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.WORKER_BATCH_SIZE).toBeGreaterThan(0);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("las variables vacías cuentan como ausentes", () => {
    const env = loadEnv({
      ...base,
      RESEND_API_KEY: "",
      PANEL_PUBLIC_URL: "",
      WORKER_BATCH_SIZE: "",
    });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.PANEL_PUBLIC_URL).toBeUndefined();
    expect(env.WORKER_BATCH_SIZE).toBeGreaterThan(0);
  });

  it("el error de arranque no incluye los valores", () => {
    expect(() => loadEnv({ DATABASE_URL: "secreto-no-url" })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ DATABASE_URL: "secreto-no-url" })).not.toThrow(/secreto-no-url/);
  });
});
