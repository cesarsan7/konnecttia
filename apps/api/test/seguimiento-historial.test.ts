import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe.skipIf(!TEST_DATABASE_URL)("seguimiento: historial de estados", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("devuelve cada cambio de estado con su hora, en orden, y nada interno", async () => {
    const created = await ctx.app.request("/public/prueba-a/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "203.0.113.230",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        nombre: "Marta Pérez",
        email: "marta@example.com",
        telefono: "+34600008001",
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
      }),
    });
    const token = ((await created.json()) as Json).tracking_token as string;
    await ctx.sql`UPDATE public.pedidos SET estado = 'confirmado' WHERE tracking_token = ${token}::uuid`;
    await ctx.sql`UPDATE public.pedidos SET estado = 'en_preparacion' WHERE tracking_token = ${token}::uuid`;

    const tracked = (await (await ctx.app.request(`/public/orders/${token}`)).json()) as Json;
    expect(tracked.historial.map((entry: Json) => entry.estado)).toEqual([
      "confirmado",
      "en_preparacion",
    ]);
    const times = tracked.historial.map((entry: Json) => new Date(entry.desde).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // Solo estado y hora: nada del actor ni del origen del cambio.
    expect(Object.keys(tracked.historial[0]).sort()).toEqual(["desde", "estado"]);
  });
});
