import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, method: string, path: string, body?: unknown, headers = {}) {
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

const dineIn = (user: User, mesaId: number, extra: Record<string, unknown> = {}) =>
  call(
    user,
    "POST",
    "/panel/prueba-c/orders",
    {
      tipo_despacho: "mesa",
      canal: "mostrador",
      mesa_id: mesaId,
      metodo_pago: "efectivo",
      items: [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }],
      ...extra,
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );

describe.skipIf(!TEST_DATABASE_URL)("meseros", () => {
  let centro = 0;
  let mesa = 0;
  let ana = 0;
  let luis = 0;

  beforeAll(async () => {
    ctx = await setupTestApp();
    centro =
      (
        await ctx.sql<{ id: number }[]>`
          SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
        `
      )[0]?.id ?? 0;
    mesa = (
      await call("ownerC", "POST", "/panel/prueba-c/mesas", { numero: 7, sucursal_id: centro })
    ).body.id;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("da de alta meseros por local o para todos, con usuario del panel opcional", async () => {
    const created = await call("ownerC", "POST", "/panel/prueba-c/mesas/meseros", {
      nombre: "Ana",
      sucursal_id: centro,
    });
    expect(created.status).toBe(201);
    ana = created.body.id;
    const [owner] = await ctx.sql<{ id: number }[]>`
      SELECT m.id FROM public.local_memberships m
      WHERE  m.restaurante_id = 103 AND m.user_id = '00000000-0000-0000-0000-0000000000c1'
    `;
    const self = await call("ownerC", "POST", "/panel/prueba-c/mesas/meseros", {
      nombre: "Luis (dueño)",
      sucursal_id: centro,
      membership_id: owner?.id,
    });
    expect(self.status).toBe(201);
    luis = self.body.id;
    // El mismo miembro no puede ser dos meseros; un miembro de otro restaurante, tampoco.
    expect(
      (
        await call("ownerC", "POST", "/panel/prueba-c/mesas/meseros", {
          nombre: "Otro",
          sucursal_id: centro,
          membership_id: owner?.id,
        })
      ).body.reason,
    ).toBe("member_taken");
    const [foreign] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.local_memberships WHERE restaurante_id = 101 LIMIT 1
    `;
    expect(
      (
        await call("ownerC", "POST", "/panel/prueba-c/mesas/meseros", {
          nombre: "Ajeno",
          sucursal_id: centro,
          membership_id: foreign?.id,
        })
      ).body.reason,
    ).toBe("unknown_member");

    const list = await call("ownerC", "GET", "/panel/prueba-c/mesas/meseros");
    expect(list.body.meseros.map((w: { nombre: string }) => w.nombre)).toEqual([
      "Ana",
      "Luis (dueño)",
    ]);
    expect(list.body.yo).toBe(luis);
  });

  it("asigna mesero al pedido en mesa: el elegido, el de la mesa o el propio usuario", async () => {
    // Sin elegir: el dueño es mesero (Luis), se asigna solo y la mesa queda atendida por él.
    const first = await dineIn("ownerC", mesa);
    expect(first.status).toBe(201);
    const plan = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    const table = plan.body.mesas.find((m: { id: number }) => m.id === mesa);
    expect(table).toMatchObject({ mesero_id: luis, mesero_nombre: "Luis (dueño)" });
    expect(table.pedidos[0].mesero_nombre).toBe("Luis (dueño)");

    // Cambiar quién atiende la mesa; el siguiente pedido toma el de la mesa.
    expect(
      (await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa}/mesero`, { mesero_id: ana }))
        .status,
    ).toBe(200);
    const second = await dineIn("ownerC", mesa);
    const [row] = await ctx.sql<{ mesero_id: number | null }[]>`
      SELECT mesero_id FROM public.pedidos WHERE id = ${second.body.id}
    `;
    expect(row?.mesero_id).toBe(ana);

    // Elegido a mano, sin mesero, o uno que no existe.
    const explicit = await dineIn("ownerC", mesa, { mesero_id: luis });
    const none = await dineIn("ownerC", mesa, { mesero_id: null });
    const rows = await ctx.sql<{ id: number; mesero_id: number | null }[]>`
      SELECT id, mesero_id FROM public.pedidos WHERE id IN (${explicit.body.id}, ${none.body.id}) ORDER BY id
    `;
    expect(rows.map((r) => r.mesero_id)).toEqual([luis, null]);
    expect((await dineIn("ownerC", mesa, { mesero_id: 999999 })).body.reason).toBe(
      "waiter_not_found",
    );

    const today = await call("ownerC", "GET", "/panel/prueba-c/mesas/meseros");
    const counts = Object.fromEntries(
      today.body.meseros.map((w: { id: number; pedidos_hoy: number }) => [w.id, w.pedidos_hoy]),
    );
    expect(counts[luis]).toBe(2);
    expect(counts[ana]).toBe(1);
  });

  it("al liberar la mesa se quita el mesero; con pedidos, borrar desactiva", async () => {
    const plan = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    for (const order of plan.body.mesas.find((m: { id: number }) => m.id === mesa).pedidos) {
      await call("ownerC", "PATCH", `/panel/prueba-c/orders/${order.id}/status`, {
        estado: "cancelado",
      });
    }
    expect(
      (await call("ownerC", "PATCH", `/panel/prueba-c/mesas/${mesa}/estado`, { ocupada: false }))
        .status,
    ).toBe(200);
    const after = await call("ownerC", "GET", "/panel/prueba-c/mesas");
    expect(after.body.mesas.find((m: { id: number }) => m.id === mesa).mesero_id).toBeNull();

    const removed = await call("ownerC", "DELETE", `/panel/prueba-c/mesas/meseros/${ana}`);
    expect(removed.body).toMatchObject({ desactivado: true });
    const fresh = await call("ownerC", "POST", "/panel/prueba-c/mesas/meseros", {
      nombre: "Temporal",
      sucursal_id: centro,
    });
    expect(
      (await call("ownerC", "DELETE", `/panel/prueba-c/mesas/meseros/${fresh.body.id}`)).body,
    ).toMatchObject({ desactivado: false });
    // Un mesero desactivado no se puede elegir.
    expect((await dineIn("ownerC", mesa, { mesero_id: ana })).body.reason).toBe("waiter_not_found");
  });

  it("respeta locales y permisos", async () => {
    // El cajero de Playa Honda solo ve y gestiona los meseros de su local.
    const list = await call("cashierPlaya", "GET", "/panel/prueba-c/mesas/meseros");
    expect(
      list.body.meseros.every((w: { sucursal_id: number | null }) => w.sucursal_id !== centro),
    ).toBe(true);
    expect(
      (
        await call("cashierPlaya", "POST", "/panel/prueba-c/mesas/meseros", {
          nombre: "X",
          sucursal_id: centro,
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("cashierPlaya", "POST", "/panel/prueba-c/mesas/meseros", { nombre: "Sin local" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("cashierPlaya", "POST", "/panel/prueba-c/mesas/meseros", {
          nombre: "Playa",
          sucursal_id: 3002,
        })
      ).status,
    ).toBe(201);
    expect((await call("ownerB", "GET", "/panel/prueba-b/mesas/meseros")).status).toBe(403);
    expect(
      (await call("viewerA", "POST", "/panel/prueba-a/mesas/meseros", { nombre: "X" })).status,
    ).toBe(403);
  });
});
