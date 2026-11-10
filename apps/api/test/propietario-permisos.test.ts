import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

describe.skipIf(!TEST_DATABASE_URL)("plantilla propietario", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("tiene todos los permisos del catálogo (si no, no podría invitar a los demás roles)", async () => {
    const missing = await ctx.sql<{ code: string }[]>`
      SELECT p.code FROM public.permiso p
      WHERE NOT EXISTS (
        SELECT 1 FROM public.rol_permiso rp JOIN public.rol r ON r.id = rp.rol_id
        WHERE r.code = 'owner' AND r.restaurante_id IS NULL AND rp.permiso_code = p.code)
    `;
    expect(missing.map((row) => row.code)).toEqual([]);
  });

  it("la migración repara un propietario al que le falta un permiso", async () => {
    await ctx.sql`
      DELETE FROM public.rol_permiso WHERE permiso_code = 'storefront.view'
        AND rol_id = (SELECT id FROM public.rol WHERE code = 'owner' AND restaurante_id IS NULL)`;
    const file = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL(
          "../../../packages/db/migrations/0036_propietario_todos_los_permisos.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await ctx.sql.unsafe(file);
    const [row] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.rol_permiso rp JOIN public.rol r ON r.id = rp.rol_id
      WHERE r.code = 'owner' AND r.restaurante_id IS NULL AND rp.permiso_code = 'storefront.view'`;
    expect(row?.n).toBe(1);
  });
});
