import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function order(
  user: User,
  slug: string,
  body: Record<string, unknown>,
  key = crypto.randomUUID(),
) {
  const response = await ctx.app.request(`/panel/${slug}/orders`, {
    method: "POST",
    headers: { ...auth(user), "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const pickupA = {
  canal: "telefono",
  nombre: "Rosa",
  telefono: "+34600000123",
  tipo_despacho: "retiro",
  metodo_pago: "efectivo",
  items: [
    {
      menu_item_id: 1101,
      menu_variant_id: 1202,
      quantity: 2,
      extras: [{ extra_id: 1301, quantity: 1 }],
    },
  ],
};

describe.skipIf(!TEST_DATABASE_URL)("pedido manual desde el panel", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("crea el pedido con los precios del servidor y el canal indicado", async () => {
    const result = await order("ownerA", "prueba-a", pickupA);
    expect(result.status).toBe(201);
    // 2 × (14 + 2,50) = 33; sin envases (supera 25 €).
    expect(result.body.total).toBe(33);
    const [row] = await ctx.sql<{ canal: string; estado: string; total: string }[]>`
      SELECT canal, estado, total FROM public.pedidos WHERE id = ${result.body.id}
    `;
    expect(row).toEqual({ canal: "telefono", estado: "recibido", total: "33.00" });
    const trail = await ctx.sql`
      SELECT 1 FROM public.auditoria WHERE accion = 'orders.create' AND recurso_id = ${String(result.body.id)}
    `;
    expect(trail.length).toBe(1);
  });

  it("ignora precios enviados y es idempotente", async () => {
    const key = crypto.randomUUID();
    const first = await order(
      "ownerA",
      "prueba-a",
      { ...pickupA, canal: "mostrador", total: 1 },
      key,
    );
    const again = await order("ownerA", "prueba-a", { ...pickupA, canal: "mostrador" }, key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(first.body.total).toBe(33);
  });

  it("aplica las reglas de la web: método de pago, reparto con zona y producto inactivo", async () => {
    expect(
      (await order("ownerA", "prueba-a", { ...pickupA, metodo_pago: "bizum" })).body.error,
    ).toBe("payment_method_not_accepted");
    expect(
      (await order("ownerA", "prueba-a", { ...pickupA, tipo_despacho: "delivery" })).status,
    ).toBe(400);
    const retired = await order("ownerA", "prueba-a", {
      ...pickupA,
      items: [{ menu_item_id: 1102, menu_variant_id: 1203, quantity: 1 }],
    });
    expect(retired.body.error).toBe("invalid_items");
    expect((await order("ownerA", "prueba-a", { ...pickupA, canal: "web" })).status).toBe(400);
  });

  it("respeta el permiso, el restaurante y los locales del usuario", async () => {
    expect((await order("viewerA", "prueba-a", pickupA)).status).toBe(403);
    expect((await order("ownerB", "prueba-a", pickupA)).status).toBe(403);
    const bocadillo = {
      ...pickupA,
      items: [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }],
      sucursal_id: 3002,
    };
    // El cajero de Playa Honda tiene orders.create: en su local sí, en el Centro no.
    expect((await order("cashierPlaya", "prueba-c", bocadillo)).status).toBe(201);
    const centro = (
      await ctx.sql<
        { id: number }[]
      >`SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal`
    )[0]?.id;
    expect(
      (await order("cashierPlaya", "prueba-c", { ...bocadillo, sucursal_id: centro })).status,
    ).toBe(404);
    // Sin local elegido, el servidor asigna uno: si no es suyo, se rechaza.
    const { sucursal_id: _, ...anyBranch } = bocadillo;
    const assigned = await order("cashierPlaya", "prueba-c", anyBranch);
    expect([201, 422]).toContain(assigned.status);
    if (assigned.status === 201) expect(assigned.body.local.id).toBe(3002);
  });

  it("devuelve los últimos pedidos de un teléfono para repetirlos", async () => {
    const lookup = async (user: User, slug: string, telefono: string) => {
      const response = await ctx.app.request(
        `/panel/${slug}/orders/anteriores?telefono=${encodeURIComponent(telefono)}`,
        { headers: auth(user) },
      );
      // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    };
    // Pedido de WhatsApp (n8n) guardado sin «+» ni prefijo: también cuenta.
    await ctx.sql`
      INSERT INTO public.pedidos (restaurante_id, telefono, items, total, tipo_despacho, estado, canal, sucursal_id)
      SELECT 101, '600000123', '[{"nombre":"Pizza antigua","cantidad":1}]', 9, 'retiro', 'entregado', 'whatsapp',
             (SELECT id FROM public.sucursal WHERE restaurante_id = 101 AND es_principal)
    `;
    const result = await lookup("ownerA", "prueba-a", "612 000 000");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ cliente: null, bloqueado: false, pedidos: [] });

    const rosa = await lookup("ownerA", "prueba-a", "+34 600 000 123");
    expect(rosa.body.cliente).toMatchObject({ nombre: "Rosa" });
    expect(rosa.body.pedidos.length).toBeGreaterThanOrEqual(2);
    expect(rosa.body.pedidos[0].items[0]).toMatchObject({ nombre: "Pizza antigua" });
    expect(rosa.body.pedidos[1]).toMatchObject({
      total: 33,
      items: [expect.objectContaining({ menu_item_id: 1101, menu_variant_id: 1202, quantity: 2 })],
    });

    // Límite configurable (lookup_pedidos_limit).
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'lookup_pedidos_limit', '1')
    `;
    expect((await lookup("ownerA", "prueba-a", "600000123")).body.pedidos).toHaveLength(1);

    // Permisos, otro restaurante y teléfono no válido.
    expect((await lookup("viewerA", "prueba-a", "600000123")).status).toBe(403);
    expect((await lookup("ownerB", "prueba-a", "600000123")).status).toBe(403);
    expect((await lookup("ownerA", "prueba-a", "12")).status).toBe(400);
    expect((await lookup("ownerB", "prueba-b", "600000123")).body.pedidos).toEqual([]);
  });

  it("un usuario limitado a un local solo ve los pedidos de ese local", async () => {
    const response = await ctx.app.request("/panel/prueba-c/orders/anteriores?telefono=600000123", {
      headers: auth("cashierPlaya"),
    });
    const body = (await response.json()) as { pedidos: { local_nombre: string }[] };
    expect(response.status).toBe(200);
    expect(body.pedidos.length).toBeGreaterThan(0);
    expect(new Set(body.pedidos.map((p) => p.local_nombre)).size).toBe(1);
  });
});
