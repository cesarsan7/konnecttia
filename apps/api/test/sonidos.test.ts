import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe.skipIf(!TEST_DATABASE_URL)("sonidos del tablero", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  const patch = (user: "ownerA" | "viewerA" | "ownerB", body: unknown) =>
    ctx.app.request("/panel/prueba-a/ajustes/restaurante", {
      method: "PATCH",
      headers: { ...auth(user), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const read = async (user: "ownerA" | "viewerA" | "ownerB") => {
    const response = await ctx.app.request("/panel/prueba-a/sonidos", { headers: auth(user) });
    return { status: response.status, body: (await response.json()) as Json };
  };

  it("sin configurar solo suena el pedido nuevo", async () => {
    const got = await read("ownerA");
    expect(got.body.sonidos).toMatchObject({ nuevo: "campana", listo: "ninguno" });
  });

  it("rechaza sonidos y eventos que no existen", async () => {
    expect((await patch("ownerA", { sonidos: { listo: "explosion" } })).status).toBe(400);
    expect((await patch("ownerA", { sonidos: { inventado: "campana" } })).status).toBe(400);
  });

  it("solo quien cambia los ajustes los guarda; quien ve pedidos los oye", async () => {
    expect((await patch("viewerA", { sonidos: { listo: "arpegio" } })).status).toBe(403);
    expect(
      (await patch("ownerA", { sonidos: { listo: "arpegio", cancelado: "alerta" } })).status,
    ).toBe(200);
    const viewer = await read("viewerA");
    expect(viewer.status).toBe(200);
    expect(viewer.body.sonidos).toMatchObject({
      listo: "arpegio",
      cancelado: "alerta",
      nuevo: "campana",
    });
    expect((await read("ownerB")).status).toBe(403);
    const settings = await ctx.app.request("/panel/prueba-a/ajustes", { headers: auth("ownerA") });
    expect(((await settings.json()) as Json).restaurante.sonidos.listo).toBe("arpegio");
  });

  it("volver a los de por defecto borra la clave", async () => {
    expect((await patch("ownerA", { sonidos: null })).status).toBe(200);
    const rows = await ctx.sql`
      SELECT 1 FROM public.restaurante_config
      WHERE restaurante_id = 101 AND config_key = 'sonidos_tablero'`;
    expect(rows.length).toBe(0);
    expect((await read("ownerA")).body.sonidos.listo).toBe("ninguno");
  });
});
