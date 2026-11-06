import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;

async function list(user: keyof typeof USERS, query: string) {
  const response = await ctx.app.request(`/panel/prueba-c/orders/historial?${query}`, {
    headers: auth(user),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const codes = (body: Record<string, unknown>) =>
  (body.pedidos as { pedido_codigo: string }[]).map((order) => order.pedido_codigo);

describe.skipIf(!TEST_DATABASE_URL)("historial de pedidos (vista tabla)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    const [centro] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
    `;
    // Horas en UTC; Canarias está en UTC+0 en noviembre (UTC+1 en verano).
    const rows: [string, string, string, string, string, string, number, number, string, string][] =
      [
        // código, estado, tipo, canal, pago, método, total, local, nombre/teléfono, creado (UTC)
        [
          "C-1",
          "recibido",
          "retiro",
          "web",
          "no_aplica",
          "efectivo",
          10,
          centro?.id ?? 0,
          "Ana|+34600000001",
          "2026-11-03 12:00",
        ],
        [
          "C-2",
          "entregado",
          "delivery",
          "whatsapp",
          "no_aplica",
          "tarjeta",
          30,
          centro?.id ?? 0,
          "Bruno|34600000002",
          "2026-11-03 09:00",
        ],
        [
          "C-3",
          "cancelado",
          "retiro",
          "telefono",
          "no_aplica",
          "efectivo",
          50,
          3002,
          "Carla|+34600000003",
          "2026-11-02 20:00",
        ],
        [
          "C-4",
          "pendiente_pago",
          "delivery",
          "web",
          "pendiente",
          "transferencia",
          20,
          3002,
          "Dani|+34600000004",
          "2026-11-01 13:00",
        ],
        [
          "C-5",
          "en_preparacion",
          "mesa",
          "mostrador",
          "no_aplica",
          "efectivo",
          15,
          centro?.id ?? 0,
          "Mesa 1|",
          "2026-10-20 10:00",
        ],
      ];
    for (const [codigo, estado, tipo, canal, pago, metodo, total, local, who, creado] of rows) {
      const [nombre, telefono] = who.split("|");
      await ctx.sql`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, canal,
                                    estado_pago, metodo_pago, total, sucursal_id, nombre_pedido,
                                    telefono, created_at, updated_at)
        VALUES (103, ${codigo}, ${estado}, ${tipo}, ${canal}, ${pago}, ${metodo}, ${total}, ${local},
                ${nombre ?? null}, ${telefono ?? ""}, ${creado}::text::timestamp,
                ${creado}::text::timestamp)
      `;
    }
    // Un carrito nunca sale en el historial.
    await ctx.sql`
      INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, telefono, total, created_at)
      VALUES (103, 'C-CARRITO', 'en_curso', '+34600000009', 5, '2026-11-03 12:30'::timestamp)
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lista todo por fecha descendente, sin carritos, con total e importe", async () => {
    const result = await list("ownerC", "");
    expect(result.status).toBe(200);
    expect(codes(result.body)).toEqual(["C-1", "C-2", "C-3", "C-4", "C-5"]);
    expect(result.body).toMatchObject({ total: 5, pagina: 1, por_pagina: 50 });
    // El importe no cuenta cancelados.
    expect(result.body.importe).toBe(75);
  });

  it("filtra por días del restaurante, estado, en marcha, tipo, canal, cobro y método", async () => {
    expect(codes((await list("ownerC", "desde=2026-11-03&hasta=2026-11-03")).body)).toEqual([
      "C-1",
      "C-2",
    ]);
    expect(codes((await list("ownerC", "estado=entregado,cancelado")).body)).toEqual([
      "C-2",
      "C-3",
    ]);
    expect(codes((await list("ownerC", "estado=activos")).body)).toEqual(["C-1", "C-4", "C-5"]);
    expect(codes((await list("ownerC", "tipo=delivery")).body)).toEqual(["C-2", "C-4"]);
    expect(codes((await list("ownerC", "canal=web,mostrador")).body)).toEqual([
      "C-1",
      "C-4",
      "C-5",
    ]);
    expect(codes((await list("ownerC", "pago=pendiente")).body)).toEqual(["C-4"]);
    expect(codes((await list("ownerC", "metodo=tarjeta")).body)).toEqual(["C-2"]);
    expect(codes((await list("ownerC", "local=3002")).body)).toEqual(["C-3", "C-4"]);
  });

  it("busca por código, nombre y teléfono", async () => {
    expect(codes((await list("ownerC", "q=c-3")).body)).toEqual(["C-3"]);
    expect(codes((await list("ownerC", "q=bru")).body)).toEqual(["C-2"]);
    expect(codes((await list("ownerC", `q=${encodeURIComponent("600 000 004")}`)).body)).toEqual([
      "C-4",
    ]);
  });

  it("ordena por columna y pagina", async () => {
    expect(codes((await list("ownerC", "orden=total&dir=asc")).body)).toEqual([
      "C-1",
      "C-5",
      "C-4",
      "C-2",
      "C-3",
    ]);
    expect(codes((await list("ownerC", "orden=cliente&dir=asc")).body)).toEqual([
      "C-1",
      "C-2",
      "C-3",
      "C-4",
      "C-5",
    ]);
    const page2 = await list("ownerC", "pagina=2");
    expect(page2.body.pedidos).toEqual([]);
    expect(page2.body.total).toBe(5);
  });

  it("rechaza filtros no válidos y respeta locales y permisos", async () => {
    for (const query of [
      "estado=inventado",
      "tipo=avion",
      "orden=telefono",
      "orden=constructor",
      "orden=__proto__",
      "desde=2026-11-03",
      "desde=2026-02-31&hasta=2026-03-01",
      "local=abc",
      "canal=WEB;drop",
    ]) {
      expect((await list("ownerC", query)).status).toBe(400);
    }
    // El cajero de Playa Honda solo ve los de su local.
    expect(codes((await list("cashierPlaya", "")).body)).toEqual(["C-3", "C-4"]);
    expect((await list("cashierPlaya", "local=999999")).status).toBe(403);
    // Otro restaurante.
    expect((await list("ownerB", "")).status).toBe(403);
  });
});
