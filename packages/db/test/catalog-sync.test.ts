import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODULES,
  PERMISSION_MODULE,
  PLAN_MODULES,
  ROLE_TEMPLATE_PERMISSIONS,
} from "@konnecttia/access";
import { COUNTRIES } from "@konnecttia/domain";
import { describe, expect, it } from "vitest";

// El catálogo de acceso vive en TypeScript (packages/access) y se siembra en SQL
// (0001_access_modules_rbac.sql y las migraciones que lo amplían, p. ej. 0015). Esta prueba evita
// que se desincronicen: junta todos los bloques de cada tipo, en orden de migración.
const dir = join(import.meta.dirname, "../migrations");
const sql = readdirSync(dir)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(join(dir, file), "utf8"))
  .join("\n");

function block(startMarker: string): string {
  const parts: string[] = [];
  let from = 0;
  for (;;) {
    const start = sql.indexOf(startMarker, from);
    if (start < 0) break;
    const end = sql.indexOf(";", start);
    parts.push(sql.slice(start, end));
    from = end;
  }
  expect(parts.length, `No se encontró ${startMarker}`).toBeGreaterThan(0);
  return parts.join("\n");
}

function tuples(text: string): string[][] {
  // Una fila por línea: «  ('a', 'b', ...),». Los nombres pueden contener paréntesis.
  return text
    .split("\n")
    .filter((line) => line.trimStart().startsWith("("))
    .map((line) => [...line.matchAll(/'([^']*)'/g)].map((value) => value[1] ?? ""));
}

describe("catálogo SQL ↔ TypeScript", () => {
  it("módulos y dependencias", () => {
    const rows = tuples(block("INSERT INTO public.modulo"));
    const fromSql = rows.map(([code, , kind, ...deps]) => ({ code, kind, deps }));
    const fromTs = MODULES.map((module) => ({
      code: module.code,
      kind: module.kind,
      deps: [...module.dependsOn],
    }));
    expect(fromSql).toEqual(fromTs);
  });

  it("permisos por módulo", () => {
    const rows = tuples(block("INSERT INTO public.permiso"));
    expect(Object.fromEntries(rows.map(([code, module]) => [code, module]))).toEqual(
      PERMISSION_MODULE,
    );
  });

  it("módulos de cada plan", () => {
    const rows = tuples(block("INSERT INTO public.plan_modulo"));
    const fromSql: Record<string, string[]> = {};
    for (const [plan, module] of rows) {
      if (plan && module) {
        fromSql[plan] = [...(fromSql[plan] ?? []), module];
      }
    }
    expect(fromSql).toEqual(PLAN_MODULES);
  });

  it("permisos de las plantillas de rol", () => {
    const rows = tuples(block("SELECT r.id, v.permiso_code"));
    const fromSql: Record<string, string[]> = {};
    for (const [role, permission] of rows) {
      if (role && permission) {
        fromSql[role] = [...(fromSql[role] ?? []), permission];
      }
    }
    const sorted = (record: Readonly<Record<string, readonly string[]>>) =>
      Object.fromEntries(Object.entries(record).map(([role, list]) => [role, [...list].sort()]));
    expect(sorted(fromSql)).toEqual(sorted(ROLE_TEMPLATE_PERMISSIONS));
  });

  it("países", () => {
    const rows = tuples(block("INSERT INTO public.pais"));
    const fromSql = rows.map(([code, nombre, prefijo]) => ({ code, nombre, prefijo }));
    expect(fromSql).toEqual(
      COUNTRIES.map((c) => ({ code: c.code, nombre: c.nombre, prefijo: c.prefijo })),
    );
  });
});
