import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let centroId = 0;

const PLAYA = 3002;
const PUERTO_CERRADO = 3003;
const cercaDePlaya = { lat: 28.955, lng: -13.575 };

const bocadillo = { menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 };
const croquetas = { menu_item_id: 3202, menu_variant_id: 3302, quantity: 1 };
const pickup = {
  nombre: "Luis",
  telefono: "+34600000050",
  tipo_despacho: "retiro",
  metodo_pago: "efectivo",
  items: [bocadillo],
};

let counter = 0;
async function postOrder(body: unknown) {
  const response = await ctx.app.request("/public/prueba-c/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.20",
      "Idempotency-Key": `branch-test-${Date.now()}-${counter++}`,
    },
    body: JSON.stringify({
      privacidad_aceptada: true,
      email: "cliente@test.local",
      ...(body as Record<string, unknown>),
    }),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function getJson(path: string, headers: Record<string, string> = {}) {
  const response = await ctx.app.request(path, { headers });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

type PublicBranch = { id: number; nombre: string; abierto: boolean; distancia_km: number | null };

describe.skipIf(!TEST_DATABASE_URL)("locales (sucursales)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    const rows = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
    `;
    centroId = rows[0]?.id ?? 0;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("web pública", () => {
    it("lista los locales del más cercano al más lejano, con su estado", async () => {
      const { status, json } = await getJson(
        `/public/prueba-c/locales?lat=${cercaDePlaya.lat}&lng=${cercaDePlaya.lng}`,
      );
      expect(status).toBe(200);
      const locales = json.locales as PublicBranch[];
      expect(locales[0]?.id).toBe(PLAYA);
      expect(locales[0]?.distancia_km).toBeLessThan(1);
      expect(locales.find((l) => l.id === PUERTO_CERRADO)?.abierto).toBe(false);
    });

    it("sin el módulo de varios locales solo existe la principal", async () => {
      const { json } = await getJson("/public/prueba-b/locales");
      expect((json.locales as PublicBranch[]).map((l) => l.nombre)).toEqual([
        "Restaurante de prueba B",
      ]);
    });

    it("la carta de un local oculta lo que ese local no sirve", async () => {
      const names = (json: Record<string, unknown>) =>
        (json.categories as { items: { name: string }[] }[]).flatMap((c) =>
          c.items.map((i) => i.name),
        );
      const general = await getJson("/public/prueba-c/menu");
      expect(names(general.json)).toContain("Croquetas");
      const playa = await getJson(`/public/prueba-c/menu?local=${PLAYA}`);
      expect(names(playa.json)).toEqual(["Bocadillo"]);
      expect(playa.json.local).toEqual({ id: PLAYA, nombre: "Playa Honda" });
    });
  });

  describe("recogida", () => {
    it("con varios locales abiertos y sin ubicación, pide elegir local", async () => {
      const { status, json } = await postOrder(pickup);
      expect(status).toBe(422);
      expect(json.error).toBe("branch_required");
      // El local cerrado no se ofrece.
      expect((json.locales as { id: number }[]).map((l) => l.id).sort()).toEqual(
        [centroId, PLAYA].sort(),
      );
    });

    it("con la ubicación del cliente asigna el local abierto más cercano", async () => {
      const { status, json } = await postOrder({ ...pickup, ...cercaDePlaya });
      expect(status).toBe(201);
      expect((json.local as { id: number }).id).toBe(PLAYA);

      // El seguimiento dice dónde recoger, sin datos del cliente.
      const tracking = await getJson(`/public/orders/${json.tracking_token as string}`);
      expect(tracking.json.local).toEqual({ nombre: "Playa Honda", direccion: null });
    });

    it("no acepta recoger en un local cerrado aunque el resto esté abierto", async () => {
      const { status, json } = await postOrder({ ...pickup, sucursal_id: PUERTO_CERRADO });
      expect(status).toBe(422);
      expect(json.error).toBe("local_closed");
    });

    it("rechaza productos que el local elegido no sirve", async () => {
      const { status, json } = await postOrder({
        ...pickup,
        sucursal_id: PLAYA,
        items: [croquetas],
      });
      expect(status).toBe(422);
      expect(json.errors).toEqual([{ code: "ITEM_NOT_AVAILABLE_AT_BRANCH", detail: "3202" }]);
    });

    it("no admite locales de otro restaurante", async () => {
      const { status, json } = await postOrder({ ...pickup, sucursal_id: 2002 });
      expect(status).toBe(422);
      expect(json.error).toBe("branch_not_available");
    });
  });

  describe("reparto", () => {
    it("despacha desde el local más cercano que cubre la dirección", async () => {
      const { status, json } = await postOrder({
        ...pickup,
        tipo_despacho: "delivery",
        direccion: "Calle de la Playa 3",
        ...cercaDePlaya,
      });
      expect(status).toBe(201);
      expect((json.local as { id: number }).id).toBe(PLAYA);
      expect(json.costo_envio).toBe(1.5);

      const rows = await ctx.sql<{ sucursal_id: number; lat: string; distancia_km: string }[]>`
        SELECT sucursal_id, lat, distancia_km FROM public.pedidos
        WHERE tracking_token = ${json.tracking_token as string}
      `;
      expect(rows[0]?.sucursal_id).toBe(PLAYA);
      expect(Number(rows[0]?.lat)).toBeCloseTo(cercaDePlaya.lat, 4);
      expect(Number(rows[0]?.distancia_km)).toBeLessThan(1);
    });

    it("si se elige zona, despacha el local dueño de esa zona", async () => {
      const { status, json } = await postOrder({
        ...pickup,
        tipo_despacho: "delivery",
        direccion: "Calle Real 1",
        zona_id: 3101,
      });
      expect(status).toBe(201);
      expect((json.local as { id: number }).id).toBe(centroId);
      expect(json.costo_envio).toBe(2);
    });

    it("fuera de toda zona no hay reparto", async () => {
      const { status, json } = await postOrder({
        ...pickup,
        tipo_despacho: "delivery",
        direccion: "Lejos",
        lat: 28.0,
        lng: -15.4,
      });
      expect(status).toBe(422);
      expect(json.error).toBe("zone_not_found");
    });
  });

  describe("panel por local", () => {
    it("el cajero de Playa Honda solo ve pedidos de su local", async () => {
      await postOrder({ ...pickup, sucursal_id: centroId });
      const own = await getJson("/panel/prueba-c/orders", auth("cashierPlaya"));
      expect(own.status).toBe(200);
      const pedidos = own.json.pedidos as { sucursal_id: number; local_nombre: string }[];
      expect(pedidos.length).toBeGreaterThan(0);
      expect(new Set(pedidos.map((p) => p.sucursal_id))).toEqual(new Set([PLAYA]));

      const other = await getJson(`/panel/prueba-c/orders?local=${centroId}`, auth("cashierPlaya"));
      expect(other.status).toBe(403);

      const all = await getJson("/panel/prueba-c/orders", auth("ownerC"));
      const branches = new Set(
        (all.json.pedidos as { sucursal_id: number }[]).map((p) => p.sucursal_id),
      );
      expect(branches).toEqual(new Set([centroId, PLAYA]));
    });

    it("el cajero no puede cambiar el estado de un pedido de otro local", async () => {
      const order = await postOrder({ ...pickup, sucursal_id: centroId });
      const [row] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.pedidos WHERE tracking_token = ${order.json.tracking_token as string}
      `;
      const response = await ctx.app.request(`/panel/prueba-c/orders/${row?.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...auth("cashierPlaya") },
        body: JSON.stringify({ estado: "confirmado" }),
      });
      expect(response.status).toBe(404);
      const denied = await ctx.sql`
        SELECT 1 FROM public.auditoria
        WHERE recurso_id = ${String(row?.id)} AND resultado = 'denegado'
          AND detalle ->> 'motivo' = 'branch_out_of_scope'
      `;
      expect(denied.length).toBe(1);
    });

    it("el selector de locales solo muestra los del usuario", async () => {
      const mine = await getJson("/panel/prueba-c/locales", auth("cashierPlaya"));
      expect((mine.json.locales as { id: number }[]).map((l) => l.id)).toEqual([PLAYA]);
      const owner = await getJson("/panel/prueba-c/locales", auth("ownerC"));
      expect((owner.json.locales as unknown[]).length).toBe(3);
    });

    it("el propietario ve las ventas por local; el cajero no tiene analítica", async () => {
      const path = "/panel/prueba-c/reports/sales?desde=2020-01-01&hasta=2099-12-31";
      const tooLong = await getJson(path, auth("ownerC"));
      expect(tooLong.status).toBe(400);

      const today = new Date().toISOString().slice(0, 10);
      const report = await getJson(
        `/panel/prueba-c/reports/sales?desde=${today}&hasta=${today}`,
        auth("ownerC"),
      );
      expect(report.status).toBe(200);
      const locales = report.json.locales as { sucursal_id: number; pedidos: number }[];
      expect(locales.map((l) => l.sucursal_id)).toEqual([centroId, PLAYA, PUERTO_CERRADO]);
      expect(locales.find((l) => l.sucursal_id === PLAYA)?.pedidos).toBeGreaterThan(0);
      expect(locales.find((l) => l.sucursal_id === PUERTO_CERRADO)?.pedidos).toBe(0);
      expect((report.json.total as { pedidos: number }).pedidos).toBe(
        locales.reduce((sum, l) => sum + l.pedidos, 0),
      );

      const cashier = await getJson(
        `/panel/prueba-c/reports/sales?desde=${today}&hasta=${today}`,
        auth("cashierPlaya"),
      );
      expect(cashier.status).toBe(403);
    });
  });
});
