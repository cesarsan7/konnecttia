import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe.skipIf(!TEST_DATABASE_URL)("país del restaurante (prefijo telefónico)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const patch = async (body: unknown) =>
    ctx.app.request("/panel/prueba-a/ajustes/restaurante", {
      method: "PATCH",
      headers: { ...auth("ownerA"), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("un restaurante existente queda en España y la carta lo dice", async () => {
    const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
    expect(menu.restaurante.pais).toBe("ES");
  });

  it("el propietario cambia el país en Ajustes y la carta lo refleja", async () => {
    expect((await patch({ pais: "US" })).status).toBe(200);
    const settings = (await (
      await ctx.app.request("/panel/prueba-a/ajustes", { headers: auth("ownerA") })
    ).json()) as Json;
    expect(settings.restaurante.pais).toBe("US");
    const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
    expect(menu.restaurante.pais).toBe("US");
    expect((await patch({ pais: "ES" })).status).toBe(200);
  });

  it("rechaza un país que no está en el catálogo", async () => {
    expect((await patch({ pais: "ZZ" })).status).toBe(400);
  });
});
