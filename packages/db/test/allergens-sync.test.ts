import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLERGENS } from "@konnecttia/domain";
import { describe, expect, it } from "vitest";

// Los códigos de alérgenos viven en packages/domain y en el CHECK de la base (0011).
// Esta prueba evita que se desincronicen.
const sql = readFileSync(join(import.meta.dirname, "../migrations/0011_carta_panel.sql"), "utf8");

describe("alérgenos SQL ↔ TypeScript", () => {
  it("la base acepta exactamente los 14 códigos del dominio", () => {
    const start = sql.indexOf("ARRAY[");
    const end = sql.indexOf("]::text[]", start);
    const codes = [...sql.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
    expect(codes).toEqual([...ALLERGENS]);
  });
});
