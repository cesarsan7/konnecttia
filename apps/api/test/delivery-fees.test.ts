import { distanceKm } from "@konnecttia/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let counter = 0;
const local = { lat: 28.9637, lng: -13.5477 };
const cerca = { lat: 28.9707, lng: -13.5477 }; // ~0,78 km al norte del local

async function order(extra: Record<string, unknown>, quantity = 1) {
  const response = await ctx.app.request("/public/prueba-e/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.30",
      "Idempotency-Key": `fees-${Date.now()}-${counter++}`,
    },
    body: JSON.stringify({
      nombre: "Eva",
      telefono: "+34600000060",
      tipo_despacho: "delivery",
      metodo_pago: "efectivo",
      direccion: "Calle Prueba 1",
      items: [{ menu_item_id: 5201, menu_variant_id: 5301, quantity }],
      ...extra,
    }),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe.skipIf(!TEST_DATABASE_URL)("tarifas de reparto", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("por km: base + km desde el local (redondeo a la décima hacia arriba)", async () => {
    const { status, json } = await order(cerca);
    expect(status).toBe(201);
    const tenths = Math.ceil(distanceKm(local, cerca) * 10);
    expect(json.costo_envio).toBe((150 + Math.round((50 * tenths) / 10)) / 100);
  });

  it("envío gratis a partir del importe configurado", async () => {
    const { json } = await order(cerca, 3); // 30 € de productos
    expect(json.costo_envio).toBe(0);
    expect(json.total).toBe(30);
  });

  it("fuera del radio entra la tarifa única de toda la ciudad", async () => {
    const { status, json } = await order({ lat: 29.05, lng: -13.6 });
    expect(status).toBe(201);
    expect(json.costo_envio).toBe(5);
  });

  it("una zona por km elegida a mano necesita la ubicación del cliente", async () => {
    const { status, json } = await order({ zona_id: 5101 });
    expect(status).toBe(422);
    expect(json.error).toBe("location_required");
  });

  it("sin tiempos configurados el tiempo queda a confirmar, no inventado", async () => {
    const { json } = await order({ zona_id: 5102 });
    expect(json.tiempo_estimado).toBeNull();
    const pickup = await order({ tipo_despacho: "retiro", direccion: undefined });
    expect(pickup.json.tiempo_estimado).toBeNull();
  });
});
