import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

const pickupOrder = {
  nombre: "Ana",
  telefono: "+34600000001",
  tipo_despacho: "retiro",
  metodo_pago: "efectivo",
  items: [
    // El navegador intenta fijar un precio: debe ignorarse.
    { menu_item_id: 1101, menu_variant_id: 1202, quantity: 2, unit_price: 0.01 },
  ],
};

let keyCounter = 0;
const newKey = () => `test-key-${Date.now()}-${keyCounter++}`;

async function postOrder(
  slug: string,
  body: unknown,
  key: string | null = newKey(),
): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await ctx.app.request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.10",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe.skipIf(!TEST_DATABASE_URL)("API de pedidos (integración con PostgreSQL)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("checkout público", () => {
    it("calcula el total en el servidor e ignora el precio enviado por el navegador", async () => {
      const { status, json } = await postOrder("prueba-a", pickupOrder);
      expect(status).toBe(201);
      // 2 × 14,00 = 28,00 €; supera los 25 €, así que no hay suplemento de envases.
      expect(json.total).toBe(28);
      expect(json.suplementos).toEqual([]);
      expect(json.tracking_token).toMatch(/^[0-9a-f-]{36}$/);
      expect(json.tiempo_estimado).toBe("15 min");
    });

    it("guarda el pedido en el formato que ya leen el panel de EasyOrder y n8n", async () => {
      const { json } = await postOrder("prueba-a", {
        ...pickupOrder,
        items: [
          {
            menu_item_id: 1101,
            menu_variant_id: 1201,
            quantity: 2,
            extras: [{ extra_id: 1301, quantity: 1 }],
          },
        ],
      });
      // (9,00 + 2,50) × 2 = 23,00 € + envases 1,00 € = 24,00 €
      expect(json.total).toBe(24);
      const rows = await ctx.sql<
        { items: Array<Record<string, unknown>>; subtotal: string; canal: string; estado: string }[]
      >`
        SELECT items, subtotal, canal, estado FROM public.pedidos WHERE tracking_token = ${json.tracking_token as string}::uuid
      `;
      const pedido = rows[0];
      expect(pedido?.canal).toBe("web");
      expect(pedido?.estado).toBe("recibido");
      expect(Number(pedido?.subtotal)).toBe(24);
      expect(pedido?.items[0]).toMatchObject({
        menu_item_id: 1101,
        menu_variant_id: 1201,
        item_name: "Salchimaduro",
        variant_name: "Pequeño",
        quantity: 2,
        unit_price: 9,
        extras: [{ extra_id: 1301, name: "Queso", unit_price: 2.5, quantity: 2 }],
      });
    });

    it("reintentar con la misma clave de idempotencia no duplica el pedido", async () => {
      const key = newKey();
      const first = await postOrder("prueba-a", pickupOrder, key);
      const second = await postOrder("prueba-a", pickupOrder, key);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.json.tracking_token).toBe(first.json.tracking_token);
      const count =
        await ctx.sql`SELECT count(*)::int AS n FROM public.pedidos WHERE idempotency_key = ${key}`;
      expect(count[0]?.n).toBe(1);
    });

    it("exige clave de idempotencia", async () => {
      const { status, json } = await postOrder("prueba-a", pickupOrder, null);
      expect(status).toBe(400);
      expect(json.error).toBe("idempotency_key_required");
    });

    it("rechaza productos de otro restaurante y productos inactivos", async () => {
      const otherTenant = await postOrder("prueba-a", {
        ...pickupOrder,
        items: [{ menu_item_id: 2101, menu_variant_id: 2201, quantity: 1 }],
      });
      expect(otherTenant.status).toBe(422);
      expect(otherTenant.json.errors).toEqual([
        expect.objectContaining({ code: "ITEM_NOT_FOUND" }),
      ]);

      const inactive = await postOrder("prueba-a", {
        ...pickupOrder,
        items: [{ menu_item_id: 1102, menu_variant_id: 1203, quantity: 1 }],
      });
      expect(inactive.status).toBe(422);

      const foreignExtra = await postOrder("prueba-a", {
        ...pickupOrder,
        items: [
          {
            menu_item_id: 1101,
            menu_variant_id: 1201,
            quantity: 1,
            extras: [{ extra_id: 2301, quantity: 1 }],
          },
        ],
      });
      expect(foreignExtra.status).toBe(422);
    });

    it("no acepta pedidos con el local cerrado", async () => {
      const { status, json } = await postOrder("prueba-b", {
        ...pickupOrder,
        items: [{ menu_item_id: 2101, menu_variant_id: 2201, quantity: 1 }],
      });
      expect(status).toBe(422);
      expect(json.error).toBe("local_closed");
    });

    it("en reparto exige dirección y zona, y bloquea si no se llega al mínimo", async () => {
      const noAddress = await postOrder("prueba-a", { ...pickupOrder, tipo_despacho: "delivery" });
      expect(noAddress.status).toBe(400);

      const delivery = {
        ...pickupOrder,
        tipo_despacho: "delivery",
        direccion: "Calle Real 1",
        zona_id: 1401,
      };
      const below = await postOrder("prueba-a", {
        ...delivery,
        items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
      });
      expect(below.status).toBe(422);
      expect(below.json.errors).toEqual([{ code: "DELIVERY_MINIMUM_NOT_MET", detail: "600" }]);

      const ok = await postOrder("prueba-a", delivery);
      expect(ok.status).toBe(201);
      // 28,00 € + 2,50 € de envío
      expect(ok.json.total).toBe(30.5);
      expect(ok.json.tiempo_estimado).toBe("30-40 min");
    });

    it("rechaza métodos de pago que el restaurante no acepta", async () => {
      const { status, json } = await postOrder("prueba-a", {
        ...pickupOrder,
        metodo_pago: "bitcoin",
      });
      expect(status).toBe(422);
      expect(json.error).toBe("payment_method_not_accepted");
    });
  });

  describe("seguimiento", () => {
    it("muestra el estado por token sin teléfono ni dirección", async () => {
      const created = await postOrder("prueba-a", {
        ...pickupOrder,
        tipo_despacho: "delivery",
        direccion: "Calle Secreta 7",
        zona_id: 1401,
      });
      const response = await ctx.app.request(
        `/public/orders/${created.json.tracking_token as string}`,
      );
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("Calle Secreta");
      expect(body).not.toContain("+34600000001");
      expect(JSON.parse(body)).toMatchObject({ estado: "recibido", total: 30.5 });
    });

    it("un token inventado o un código de pedido no dan acceso", async () => {
      const random = await ctx.app.request("/public/orders/00000000-0000-4000-8000-000000000000");
      expect(random.status).toBe(404);
      const code = await ctx.app.request("/public/orders/261103-1001");
      expect(code.status).toBe(404);
    });
  });

  describe("panel", () => {
    it("sin sesión no hay acceso", async () => {
      const response = await ctx.app.request("/panel/prueba-a/orders");
      expect(response.status).toBe(401);
    });

    it("un miembro de otro restaurante no ve los pedidos", async () => {
      const response = await ctx.app.request("/panel/prueba-a/orders", { headers: auth("ownerB") });
      expect(response.status).toBe(403);
    });

    it("el rol Consulta ve pedidos pero no puede cambiar su estado", async () => {
      const list = await ctx.app.request("/panel/prueba-a/orders", { headers: auth("viewerA") });
      expect(list.status).toBe(200);
      const { pedidos } = (await list.json()) as { pedidos: { id: number }[] };
      expect(pedidos.length).toBeGreaterThan(0);

      const change = await ctx.app.request(`/panel/prueba-a/orders/${pedidos[0]?.id}/status`, {
        method: "PATCH",
        headers: { ...auth("viewerA"), "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "confirmado" }),
      });
      expect(change.status).toBe(403);
      const denied = await ctx.sql`
        SELECT count(*)::int AS n FROM public.auditoria
        WHERE restaurante_id = 101 AND resultado = 'denegado' AND accion = 'orders.change_status'
      `;
      expect(denied[0]?.n).toBeGreaterThan(0);
    });

    it("el propietario cambia el estado respetando la máquina de estados", async () => {
      const created = await postOrder("prueba-a", pickupOrder);
      const [row] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.pedidos WHERE tracking_token = ${created.json.tracking_token as string}::uuid
      `;
      const patch = (estado: string) =>
        ctx.app.request(`/panel/prueba-a/orders/${row?.id}/status`, {
          method: "PATCH",
          headers: { ...auth("ownerA"), "Content-Type": "application/json" },
          body: JSON.stringify({ estado }),
        });

      expect((await patch("listo")).status).toBe(422);
      expect((await patch("confirmado")).status).toBe(200);
      expect((await patch("en_preparacion")).status).toBe(200);

      const log =
        await ctx.sql`SELECT count(*)::int AS n FROM public.pedido_estado_log WHERE pedido_id = ${row?.id ?? 0}`;
      expect(log[0]?.n).toBeGreaterThanOrEqual(2);
      const outbox = await ctx.sql`
        SELECT count(*)::int AS n FROM public.outbox_evento WHERE agregado_id = ${String(row?.id)}
      `;
      // 1 por pedido recibido + 2 cambios de estado
      expect(outbox[0]?.n).toBe(3);
    });

    it("un propietario no puede tocar pedidos de otro restaurante aunque conozca el id", async () => {
      const created = await postOrder("prueba-a", pickupOrder);
      const [row] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.pedidos WHERE tracking_token = ${created.json.tracking_token as string}::uuid
      `;
      const response = await ctx.app.request(`/panel/prueba-b/orders/${row?.id}/status`, {
        method: "PATCH",
        headers: { ...auth("ownerB"), "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "confirmado" }),
      });
      expect(response.status).toBe(404);
    });
  });

  describe("carta pública", () => {
    it("muestra solo lo activo, con alérgenos «no informados» en lugar de «sin alérgenos»", async () => {
      const response = await ctx.app.request("/public/prueba-a/menu");
      expect(response.status).toBe(200);
      const menu = (await response.json()) as {
        abierto: boolean;
        categories: {
          items: { name: string; extras: { name: string }[]; allergens: { status: string } }[];
        }[];
      };
      expect(menu.abierto).toBe(true);
      const items = menu.categories.flatMap((category) => category.items);
      expect(items.map((item) => item.name)).toEqual(["Salchimaduro"]);
      expect(items[0]?.extras.map((extra) => extra.name)).toEqual(["Queso"]);
      expect(items[0]?.allergens.status).toBe("not_declared");
    });

    it("indica qué servicios y métodos de pago ofrece el restaurante", async () => {
      const response = await ctx.app.request("/public/prueba-a/menu");
      const menu = (await response.json()) as { restaurante: Record<string, unknown> };
      expect(menu.restaurante).toMatchObject({
        recogida: true,
        reparto: true,
        metodos_pago: ["efectivo", "tarjeta", "transferencia"],
      });
    });

    it("lista las zonas de reparto con su envío y mínimo", async () => {
      const response = await ctx.app.request("/public/prueba-a/zonas");
      const { zonas } = (await response.json()) as { zonas: Record<string, unknown>[] };
      expect(zonas).toEqual([
        {
          id: 1401,
          nombre: "Arrecife centro",
          envio: 2.5,
          minimo: 15,
          tiempo: "30-40 min",
          local: "Cafetería de prueba A",
        },
      ]);
    });
  });
});
