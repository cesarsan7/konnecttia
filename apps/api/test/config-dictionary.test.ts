import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIG_KEY } from "../src/repositories/restaurants";

// Toda clave que lee la API debe estar documentada en el diccionario (migración 0007).
const sql = readFileSync(
  join(import.meta.dirname, "../../../packages/db/migrations/0007_diccionario_config.sql"),
  "utf8",
);

describe("diccionario de configuración", () => {
  it.each(Object.values(CONFIG_KEY))("%s está documentada", (key) => {
    expect(sql).toContain(`('${key}',`);
  });
});
