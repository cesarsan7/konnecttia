import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(
  user: User,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...headers,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const order = (user: User, slug: string, body: unknown) =>
  call(user, "POST", `/panel/${slug}/orders`, body, { "Idempotency-Key": crypto.randomUUID() });

describe.skipIf(!TEST_DATABASE_URL)("mesas", () => {
  let centro = 0;
  let terraza = 0;
  let mesa1 = 0;

  beforeAll(async () => {
    ctx = await setupTestApp();
    centro =
      (
        await ctx.sql<
          { id: number }[]
        >`SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal`
      )[0]?.id ?? 0;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("configura zonas y mesas por local", async () => {
    const zone = await call("ownerC", "POST", "/panel/prueba-c/mesas/zonas", {
      nombre: "Terraza",
      sucursal_id: centro,
    });
    expect(zone.status).toBe(201);
    terraza = zone.body.id;
    const table = await call("ownerC", "POST", "/panel/prueba-c/mesas", {
      numero: 1,
      capacidad: 4,
      zona_id: terraza,
      sucursal_id: centro,
    });
    expect(table.status).toBe(201);
    mesa1 = table.body.id;
    expect(
      (await call("ownerC", "POST", "/panel/prueba-c/mesas", { numero: 1, sucursal_id: centro }))
        .body.reason,
    ).toBe("duplicate_number");
    // Zona de otro local: no.
    expect(
      (
        await call("ownerC", "POST", "/panel/prueba-c/mesas", {
          numero: 2,
          zona_id: terraza,
          sucursal_id: 3002,
        })
      ).body.reason,
    ).toBe("zone_other_branch");
    const plan = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(plan.body.mesas).toEqual([
      expect.objectContaining({
        id: mesa1,
        nombre: "Mesa 1",
        capacidad: 4,
        ocupada: false,
        pedido: null,
      }),
    ]);
  });

  it("un pedido en mesa ocupa la mesa, va sin teléfono, sin envases y pasa de listo a entregado", async () => {
    const created = await order("ownerC", "prueba-c", {
      tipo_despacho: "mesa",
      canal: "mostrador",
      mesa_id: mesa1,
      metodo_pago: "efectivo",
      items: [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 2 }],
    });
    expect(created.status).toBe(201);
    expect(created.body.local.id).toBe(centro);
    const [row] = await ctx.sql<
      { tipo_despacho: string; mesa_id: number; telefono: string; usuario_id: number | null }[]
    >`
      SELECT tipo_despacho, mesa_id, telefono, usuario_id FROM public.pedidos WHERE id = ${created.body.id}
    `;
    expect(row).toEqual({ tipo_despacho: "mesa", mesa_id: mesa1, telefono: "", usuario_id: null });

    const plan = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(plan.body.mesas[0]).toMatchObject({
      ocupada: true,
      ocupada_manual: true,
      ocupada_desde: expect.any(String),
      pedido: { id: created.body.id, total: 12 },
      en_marcha: 1,
      cuenta: 12,
    });
    expect(plan.body.mesas[0].pedidos).toEqual([
      expect.objectContaining({
        id: created.body.id,
        estado: "recibido",
        items: expect.any(Array),
      }),
    ]);

    // Con un pedido en marcha no se puede liberar.
    const blocked = await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa1}/estado`, {
      ocupada: false,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body).toMatchObject({ reason: "orders_in_progress" });
    expect(blocked.body.pedidos).toHaveLength(1);

    // Segundo pedido en la misma mesa: se suma a la cuenta y la ocupación no cambia de hora.
    const second = await order("ownerC", "prueba-c", {
      tipo_despacho: "mesa",
      canal: "mostrador",
      mesa_id: mesa1,
      metodo_pago: "efectivo",
      items: [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }],
    });
    expect(second.status).toBe(201);
    const both = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(both.body.mesas[0]).toMatchObject({
      en_marcha: 2,
      cuenta: 18,
      ocupada_desde: plan.body.mesas[0].ocupada_desde,
    });
    await call("ownerC", "PATCH", `/panel/prueba-c/orders/${second.body.id}/status`, {
      estado: "cancelado",
    });

    const board = await call("ownerC", "GET", "/panel/prueba-c/orders?vista=tablero");
    expect(
      board.body.pedidos.find((p: { id: number }) => p.id === created.body.id).mesa_nombre,
    ).toBe("Mesa 1");

    for (const estado of ["confirmado", "en_preparacion", "listo", "entregado"]) {
      expect(
        (
          await call("ownerC", "PATCH", `/panel/prueba-c/orders/${created.body.id}/status`, {
            estado,
          })
        ).status,
      ).toBe(200);
    }
    // Entregado: los clientes siguen sentados; la mesa sigue ocupada con su cuenta (sin el cancelado).
    const after = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(after.body.mesas[0]).toMatchObject({
      ocupada: true,
      pedido: null,
      en_marcha: 0,
      cuenta: 12,
    });
    expect(after.body.mesas[0].pedidos).toHaveLength(2);

    // Liberar: la mesa queda libre y la cuenta empieza de cero.
    const released = await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa1}/estado`, {
      ocupada: false,
    });
    expect(released.status).toBe(200);
    const free = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(free.body.mesas[0]).toMatchObject({
      ocupada: false,
      ocupada_desde: null,
      pedidos: [],
      cuenta: 0,
    });
    const [log] = await ctx.sql<{ accion: string }[]>`
      SELECT accion FROM public.auditoria
      WHERE  recurso_tipo = 'mesa' AND recurso_id = ${String(mesa1)}
      ORDER  BY id DESC LIMIT 1
    `;
    expect(log?.accion).toBe("tables.mesa.liberar");
  });

  it("ocupar y liberar a mano", async () => {
    expect(
      (await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa1}/estado`, { ocupada: true }))
        .status,
    ).toBe(200);
    const plan = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(plan.body.mesas[0]).toMatchObject({ ocupada: true, ocupada_desde: expect.any(String) });
    expect(
      (await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa1}/estado`, { ocupada: false }))
        .status,
    ).toBe(200);
  });

  it("respeta locales, restaurante y permisos", async () => {
    // El cajero de Playa Honda no ve ni toca las mesas del Centro.
    const plan = await call("cashierPlaya", "GET", "/panel/prueba-c/mesas");
    expect(plan.body.mesas).toEqual([]);
    expect(
      (
        await call("cashierPlaya", "PATCH", `/panel/prueba-c/mesas/${mesa1}/estado`, {
          ocupada: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await order("cashierPlaya", "prueba-c", {
          tipo_despacho: "mesa",
          canal: "mostrador",
          mesa_id: mesa1,
          metodo_pago: "efectivo",
          items: [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }],
        })
      ).body.reason,
    ).toBe("table_not_found");
    // Otro restaurante, y el plan básico (sin módulo de mesas).
    expect((await call("ownerB", "DELETE", `/panel/prueba-b/mesas/${mesa1}`)).status).toBe(403);
    expect((await call("ownerA", "GET", "/panel/prueba-a/mesas")).status).toBe(200);
    expect(
      (
        await order("ownerB", "prueba-b", {
          tipo_despacho: "mesa",
          canal: "mostrador",
          mesa_id: mesa1,
          metodo_pago: "efectivo",
          items: [{ menu_item_id: 2101, menu_variant_id: 2201, quantity: 1 }],
        })
      ).status,
    ).toBe(403);
  });

  it("borra mesas y zonas propias", async () => {
    expect((await call("ownerC", "DELETE", `/panel/prueba-c/mesas/${mesa1}`)).status).toBe(200);
    expect((await call("ownerC", "DELETE", `/panel/prueba-c/mesas/zonas/${terraza}`)).status).toBe(
      200,
    );
  });
});
