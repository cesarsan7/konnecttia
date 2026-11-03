import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

async function abierto(): Promise<boolean> {
  const response = await ctx.app.request("/public/prueba-d/menu");
  return ((await response.json()) as { abierto: boolean }).abierto;
}

describe.skipIf(!TEST_DATABASE_URL)("festivos", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("un martes normal está cerrado", async () => {
    expect(await abierto()).toBe(false);
  });

  it("si el martes es festivo, abre con el horario del domingo", async () => {
    await ctx.sql`INSERT INTO public.festivo (restaurante_id, fecha, nombre) VALUES (104, '2026-11-03', 'Prueba')`;
    expect(await abierto()).toBe(true);
  });

  it("un festivo propio del local manda sobre el del restaurante", async () => {
    await ctx.sql`
      INSERT INTO public.festivo (restaurante_id, sucursal_id, fecha, cerrado)
      SELECT 104, id, '2026-11-03', true FROM public.sucursal WHERE restaurante_id = 104 AND es_principal
    `;
    expect(await abierto()).toBe(false);
  });

  it("no se puede asignar un festivo al local de otro restaurante", async () => {
    await expect(
      ctx.sql`
        INSERT INTO public.festivo (restaurante_id, sucursal_id, fecha)
        SELECT 104, id, '2026-12-25' FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
      `,
    ).rejects.toThrow();
  });
});
