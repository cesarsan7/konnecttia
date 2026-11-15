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
