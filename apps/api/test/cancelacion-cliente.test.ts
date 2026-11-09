import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let seq = 0;
const items = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function webOrder(extra: Record<string, unknown> = {}) {
  seq += 1;
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${150 + seq}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Marta Pérez",
      email: "marta@example.com",
      telefono: `+3460000${String(5000 + seq)}`,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items,
      ...extra,
    }),
  });
  const body = (await response.json()) as Json;
  expect(response.status).toBe(201);
  return body.tracking_token as string;
}

async function cancel(token: string) {
  const response = await ctx.app.request(`/public/orders/${token}/cancelar`, { method: "POST" });
  return { status: response.status, body: (await response.json()) as Json };
}

async function track(token: string) {
  const response = await ctx.app.request(`/public/orders/${token}`);
  return (await response.json()) as Json;
}

async function setState(token: string, estado: string) {
  await ctx.sql`UPDATE public.pedidos SET estado = ${estado} WHERE tracking_token = ${token}::uuid`;
}

describe.skipIf(!TEST_DATABASE_URL)("cancelación por el cliente (pieza O)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("cancela un pedido recién recibido, deja origen «cliente» y avisa en el tablero", async () => {
    const token = await webOrder();
    expect((await track(token)).puedeCancelar).toBe(true);

    const result = await cancel(token);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true, estado: "cancelado" });

    const after = await track(token);
    expect(after.estado).toBe("cancelado");
    expect(after.puedeCancelar).toBe(false);

    const [log] = await ctx.sql<{ origen: string; actor: string }[]>`
      SELECT l.origen, l.actor FROM public.pedido_estado_log l
      JOIN   public.pedidos p ON p.id = l.pedido_id
      WHERE  p.tracking_token = ${token}::uuid AND l.estado_nuevo = 'cancelado'
    `;
    expect(log).toEqual({ origen: "cliente", actor: "cliente" });

    const [event] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.outbox_evento e
      JOIN   public.pedidos p ON p.id = e.agregado_id::int
      WHERE  p.tracking_token = ${token}::uuid AND e.tipo = 'pedido.estado_cambiado'
        AND  e.payload->>'hacia' = 'cancelado'
    `;
    expect(event?.n).toBe(1);

    const board = await ctx.app.request("/panel/prueba-a/orders?vista=tablero", {
      headers: auth("ownerA"),
    });
    const { pedidos } = (await board.json()) as { pedidos: Json[] };
    const row = pedidos.find((p) => p.estado === "cancelado" && p.cancelado_por_cliente === true);
    expect(row).toBeTruthy();
  });

  it("no cancela una segunda vez", async () => {
    const token = await webOrder();
    expect((await cancel(token)).status).toBe(200);
    const again = await cancel(token);
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe("already_accepted");
  });

  it("si el local ya aceptó el pedido, no se puede cancelar y se ofrece contactar", async () => {
    const token = await webOrder();
    await setState(token, "confirmado");
    const tracked = await track(token);
    expect(tracked.puedeCancelar).toBe(false);
    const result = await cancel(token);
    expect(result.status).toBe(409);
    expect(result.body.reason).toBe("already_accepted");
    expect((await track(token)).estado).toBe("confirmado");
  });

  it("con el cobro pendiente cancela hasta que sube un justificante", async () => {
    const token = await webOrder({ metodo_pago: "transferencia" });
    expect((await track(token)).estadoPago).toBe("pendiente");
    expect((await track(token)).puedeCancelar).toBe(true);

    await ctx.sql`
      INSERT INTO public.pedido_justificante (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
      SELECT id, restaurante_id, 'x/y.png', 'image/png', 10
      FROM   public.pedidos WHERE tracking_token = ${token}::uuid
    `;
    expect((await track(token)).puedeCancelar).toBe(false);
    expect((await cancel(token)).status).toBe(409);
  });

  it("token inválido o desconocido", async () => {
    expect((await cancel("no-es-un-token")).status).toBe(404);
    expect((await cancel(crypto.randomUUID())).status).toBe(404);
  });
});
