import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_KEY } from "../src/repositories/restaurants";

// Toda clave que lee la API debe estar documentada en el diccionario config_clave
// (creado en la migración 0007 y ampliado por migraciones posteriores).
const dir = join(import.meta.dirname, "../../../packages/db/migrations");
const sql = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .map((file) => readFileSync(join(dir, file), "utf8"))
  .join("\n");

describe("diccionario de configuración", () => {
  it.each(Object.values(CONFIG_KEY))("%s está documentada", (key) => {
    expect(sql).toContain(`('${key}',`);
  });
});
