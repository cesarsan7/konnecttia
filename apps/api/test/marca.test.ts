import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;
// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function call(user: User, method: string, path: string, body?: unknown, app = ctx.app) {
  const response = await app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function uploadLogo(app: TestContext["app"], bytes: Uint8Array, user: User = "ownerA") {
  const form = new FormData();
  form.append("logo", new File([bytes], "logo.png", { type: "image/png" }));
  const response = await app.request("/panel/prueba-a/ajustes/logo", {
    method: "POST",
    headers: auth(user),
    body: form,
  });
  return { status: response.status, body: (await response.json()) as Json };
}

describe.skipIf(!TEST_DATABASE_URL)("marca: logo y redes sociales (pieza Z)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("los ajustes muestran logo y redes (vacíos al principio)", async () => {
    const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(settings.status).toBe(200);
    expect(settings.body.restaurante.logo_url).toBeNull();
    expect(settings.body.restaurante.redes_sociales).toEqual([]);
  });

  it("guarda las redes normalizadas, las muestra en la carta y las vacía", async () => {
    const saved = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      redes_sociales: [
        { red: "instagram", url: "instagram.com/laisla" },
        { red: "whatsapp", url: "+34 600 000 000" },
      ],
    });
    expect(saved.status).toBe(200);

    const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(settings.body.restaurante.redes_sociales).toEqual([
      { red: "instagram", url: "https://instagram.com/laisla" },
      { red: "whatsapp", url: "https://wa.me/34600000000" },
    ]);

    const menu = await ctx.app.request("/public/prueba-a/menu");
    const body = (await menu.json()) as Json;
    expect(body.restaurante.redes_sociales).toHaveLength(2);
    expect(body.restaurante.logo_url).toBeNull();

    const cleared = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      redes_sociales: [],
    });
    expect(cleared.status).toBe(200);
    const after = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(after.body.restaurante.redes_sociales).toEqual([]);
  });

  it("rechaza redes repetidas, desconocidas o con una URL peligrosa", async () => {
    const send = (redes: unknown) =>
      call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", { redes_sociales: redes });
    const unknown = await send([{ red: "myspace", url: "https://x.com" }]);
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ field: "redes_sociales.0", reason: "unknown_network" });
    const duplicate = await send([
      { red: "web", url: "https://a.com" },
      { red: "web", url: "https://b.com" },
    ]);
    expect(duplicate.body).toMatchObject({
      field: "redes_sociales.1",
      reason: "duplicate_network",
    });
    const unsafe = await send([{ red: "web", url: "javascript:alert(1)" }]);
    expect(unsafe.body).toMatchObject({ reason: "invalid_url" });
    expect((await send("no es lista")).status).toBe(400);
  });

  it("la carta ignora lo que n8n o un SQL a mano dejaron mal escrito", async () => {
    await ctx.sql`
      UPDATE public.restaurante
      SET    redes_sociales = '[{"red":"instagram","url":"https://instagram.com/ok"},
                               {"red":"web","url":"javascript:alert(1)"}, 7, null]'::jsonb,
             logo_url = 'javascript:alert(1)'
      WHERE  id = 101
    `;
    try {
      const body = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
      expect(body.restaurante.redes_sociales).toEqual([
        { red: "instagram", url: "https://instagram.com/ok" },
      ]);
      expect(body.restaurante.logo_url).toBeNull();
    } finally {
      await ctx.sql`UPDATE public.restaurante SET redes_sociales = NULL, logo_url = NULL WHERE id = 101`;
    }
  });

  it("sube el logo, lo muestra en la carta y se puede quitar", async () => {
    expect((await uploadLogo(ctx.app, png)).status).toBe(503);

    const uploads: { path: string; contentType: string }[] = [];
    const app = ctx.appWith({
      imageStorage: {
        upload: async (path, _bytes, contentType) => {
          uploads.push({ path, contentType });
          return `https://cdn.test/${path}`;
        },
      },
    });
    const result = await uploadLogo(app, png);
    expect(result.status).toBe(200);
    expect(uploads[0]?.path).toMatch(/^101\/logo-[0-9a-f-]+\.png$/);
    expect(result.body.logo_url).toBe(`https://cdn.test/${uploads[0]?.path}`);

    const menu = (await (await app.request("/public/prueba-a/menu")).json()) as Json;
    expect(menu.restaurante.logo_url).toBe(result.body.logo_url);

    expect((await uploadLogo(app, new TextEncoder().encode("<svg/>"))).status).toBe(415);
    expect((await uploadLogo(app, new Uint8Array(2 * 1024 * 1024 + 1).fill(1))).status).toBe(413);
    expect((await uploadLogo(app, png, "viewerA")).status).toBe(403);

    const removed = await call("ownerA", "DELETE", "/panel/prueba-a/ajustes/logo", undefined, app);
    expect(removed.status).toBe(200);
    const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes", undefined, app);
    expect(settings.body.restaurante.logo_url).toBeNull();

    const [audit] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.auditoria
      WHERE  restaurante_id = 101 AND accion IN ('ajustes.logo', 'ajustes.logo.quitar')
    `;
    expect(audit?.n).toBe(2);
  });

  it("quien no puede cambiar ajustes no toca las redes", async () => {
    const denied = await call("viewerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      redes_sociales: [{ red: "web", url: "https://a.com" }],
    });
    expect(denied.status).toBe(403);
  });

  it("el color de marca se guarda normalizado, sale en la carta y en el seguimiento", async () => {
    const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(settings.body.restaurante.color_marca).toBeNull();

    const saved = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      color_marca: "#0A7",
    });
    expect(saved.status).toBe(200);
    const after = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(after.body.restaurante.color_marca).toBe("#00aa77");

    const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
    expect(menu.restaurante.color_marca).toBe("#00aa77");

    const order = await ctx.app.request("/public/prueba-a/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.231",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        nombre: "Marta",
        email: "marta@example.com",
        telefono: "+34600007001",
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
      }),
    });
    const { tracking_token: token } = (await order.json()) as Json;
    const tracked = (await (await ctx.app.request(`/public/orders/${token}`)).json()) as Json;
    expect(tracked.colorMarca).toBe("#00aa77");

    const reset = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      color_marca: null,
    });
    expect(reset.status).toBe(200);
    const menuAfter = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
    expect(menuAfter.restaurante.color_marca).toBeNull();
  });

  it("rechaza colores inválidos y no cambia nada para quien no puede editar", async () => {
    for (const bad of ["rojo", "#12", "#gggggg", "url(x)", 5]) {
      const result = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
        color_marca: bad,
      });
      expect(result.status).toBe(400);
    }
    const denied = await call("viewerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
      color_marca: "#00aa77",
    });
    expect(denied.status).toBe(403);
  });

  it("el rojo por defecto de la versión anterior cuenta como «sin color propio»", async () => {
    await ctx.sql`UPDATE public.restaurante SET brand_color = '#E63946' WHERE id = 101`;
    try {
      const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as Json;
      expect(menu.restaurante.color_marca).toBeNull();
      const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(settings.body.restaurante.color_marca).toBeNull();
    } finally {
      await ctx.sql`UPDATE public.restaurante SET brand_color = NULL WHERE id = 101`;
    }
  });
});
