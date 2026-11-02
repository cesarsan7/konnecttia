import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODULES,
  PERMISSION_MODULE,
  PLAN_MODULES,
  ROLE_TEMPLATE_PERMISSIONS,
} from "@konnecttia/access";
import { describe, expect, it } from "vitest";

// El catálogo de acceso vive en TypeScript (packages/access) y se siembra en SQL
// (0001_access_modules_rbac.sql). Esta prueba evita que se desincronicen.
const sql = readFileSync(
  join(import.meta.dirname, "../migrations/0001_access_modules_rbac.sql"),
  "utf8",
);

function block(startMarker: string): string {
  const start = sql.indexOf(startMarker);
  expect(start, `No se encontró ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end);
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
    expect(fromSql).toEqual(ROLE_TEMPLATE_PERMISSIONS);
  });
});
