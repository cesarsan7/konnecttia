import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clientActionAllowed } from "../src/repositories/client-actions";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let seq = 0;
const items = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function webOrder() {
  seq += 1;
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${100 + seq}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Marta Pérez",
      email: "marta@example.com",
      telefono: `+3460000${String(7000 + seq)}`,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items,
    }),
  });
  const body = (await response.json()) as Json;
  expect(response.status).toBe(201);
  return body.tracking_token as string;
}

const post = (path: string, body?: unknown) =>
  ctx.app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "198.51.100.7" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const track = async (token: string) =>
  (await (await ctx.app.request(`/public/orders/${token}`)).json()) as Json;

const setConfig = (key: string, value: string | null) =>
  value === null
    ? ctx.sql`DELETE FROM public.restaurante_config WHERE restaurante_id = 101 AND config_key = ${key}`
    : ctx.sql`
        INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
        VALUES (101, ${key}, ${value})
        ON CONFLICT (restaurante_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value`;

describe("clientActionAllowed", () => {
  it("permite salvo que el valor sea false", () => {
    expect(clientActionAllowed(undefined)).toBe(true);
    expect(clientActionAllowed(null)).toBe(true);
    expect(clientActionAllowed("true")).toBe(true);
    expect(clientActionAllowed("")).toBe(true);
    expect(clientActionAllowed(" FALSE ")).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("seguimiento: cancelar y novedades por restaurante", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await setConfig("pedido_cancelacion_cliente", null);
    await setConfig("pedido_novedades_cliente", null);
    await ctx?.close();
  });

  it("sin clave todo sigue permitido", async () => {
    const token = await webOrder();
    const tracked = await track(token);
    expect(tracked).toMatchObject({
      puedeCancelar: true,
      permiteCancelar: true,
      permiteReportar: true,
    });
  });

  it("con cancelación desactivada: no se ofrece y la API la rechaza", async () => {
    await setConfig("pedido_cancelacion_cliente", "false");
    const token = await webOrder();
    const tracked = await track(token);
    expect(tracked).toMatchObject({ puedeCancelar: false, permiteCancelar: false });
    const response = await post(`/public/orders/${token}/cancelar`);
    expect(response.status).toBe(403);
    expect(((await response.json()) as Json).reason).toBe("disabled_by_restaurant");
    expect((await track(token)).estado).not.toBe("cancelado");
    await setConfig("pedido_cancelacion_cliente", null);
  });

  it("con novedades desactivadas: no se ofrecen y la API las rechaza", async () => {
    await setConfig("pedido_novedades_cliente", "false");
    const token = await webOrder();
    const tracked = await track(token);
    expect(tracked).toMatchObject({ puedeReportar: false, permiteReportar: false });
    const response = await post(`/public/orders/${token}/incidencias`, {
      tipo: "retraso",
      descripcion: "Llega tarde",
    });
    expect(response.status).toBe(403);
    await setConfig("pedido_novedades_cliente", null);
  });

  it("el propietario cambia las dos opciones desde Ajustes", async () => {
    const patch = await ctx.app.request("/panel/prueba-a/ajustes/restaurante", {
      method: "PATCH",
      headers: { ...auth("ownerA"), "Content-Type": "application/json" },
      body: JSON.stringify({ seguimiento_cancelar: false, seguimiento_novedades: false }),
    });
    expect(patch.status).toBe(200);
    const settings = (await (
      await ctx.app.request("/panel/prueba-a/ajustes", { headers: auth("ownerA") })
    ).json()) as Json;
    expect(settings.restaurante).toMatchObject({
      seguimiento_cancelar: false,
      seguimiento_novedades: false,
    });
    // Otro restaurante no se ve afectado.
    const other = (await (
      await ctx.app.request("/panel/prueba-b/ajustes", { headers: auth("ownerB") })
    ).json()) as Json;
    expect(other.restaurante).toMatchObject({
      seguimiento_cancelar: true,
      seguimiento_novedades: true,
    });
  });
});

describe("enlace de reseñas", () => {
  it("solo acepta enlaces https de Google Maps o de reseñas de Google", async () => {
    const { parseReviewUrl } = await import("../src/lib/review-link");
    for (const ok of [
      "https://maps.app.goo.gl/abc123",
      "https://www.google.com/maps/place/Mi+Local/@28.9,-13.5,17z",
      "https://g.page/r/CabcDEF/review",
      "https://search.google.com/local/writereview?placeid=ChIJxyz",
      "https://goo.gl/maps/xyz",
    ]) {
      expect(parseReviewUrl(ok), ok).not.toBeNull();
    }
    for (const bad of [
      "",
      "http://maps.app.goo.gl/abc123",
      "https://example.com/maps/abc",
      "https://www.google.com/search?q=mi+local",
      "https://google.com.evil.com/maps/x",
      "https://user:pass@maps.app.goo.gl/abc",
      "javascript:alert(1)",
      "no es un enlace",
    ]) {
      expect(parseReviewUrl(bad), bad).toBeNull();
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("seguimiento: botón de reseña", () => {
  let context: TestContext;
  beforeAll(async () => {
    context = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    if (context) {
      await context.sql`DELETE FROM public.restaurante_config WHERE config_key = 'resena_url'`;
      await context.close();
    }
  });

  it("Ajustes guarda el enlace, rechaza otros y el seguimiento lo ofrece solo con el pedido entregado", async () => {
    const patch = (body: unknown) =>
      context.app.request("/panel/prueba-a/ajustes/restaurante", {
        method: "PATCH",
        headers: { ...auth("ownerA"), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    expect((await patch({ resena_url: "https://example.com/x" })).status).toBe(400);
    expect((await patch({ resena_url: "https://maps.app.goo.gl/abc123" })).status).toBe(200);
    const settings = (await (
      await context.app.request("/panel/prueba-a/ajustes", { headers: auth("ownerA") })
    ).json()) as Json;
    expect(settings.restaurante.resena_url).toBe("https://maps.app.goo.gl/abc123");

    const created = await context.app.request("/public/prueba-a/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.240",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        nombre: "Marta Pérez",
        email: "marta@example.com",
        telefono: "+34600009001",
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
      }),
    });
    const token = ((await created.json()) as Json).tracking_token as string;
    const open = (await (await context.app.request(`/public/orders/${token}`)).json()) as Json;
    expect(open.resenaUrl).toBeNull();
    await context.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE tracking_token = ${token}::uuid`;
    const done = (await (await context.app.request(`/public/orders/${token}`)).json()) as Json;
    expect(done.resenaUrl).toBe("https://maps.app.goo.gl/abc123");

    expect((await patch({ resena_url: "" })).status).toBe(200);
    const cleared = (await (await context.app.request(`/public/orders/${token}`)).json()) as Json;
    expect(cleared.resenaUrl).toBeNull();
  });
});
