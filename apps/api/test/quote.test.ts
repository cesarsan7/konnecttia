import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

async function quote(slug: string, body: Record<string, unknown>) {
  const response = await ctx.app.request(`/public/${slug}/cotizacion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "10.0.0.5" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

describe.skipIf(!TEST_DATABASE_URL)("cotización de despacho (agente de WhatsApp)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("reparto por código postal: tarifa, mínimo y tiempo de la zona", async () => {
    const { status, json } = await quote("prueba-a", {
      tipo_despacho: "delivery",
      subtotal: 20,
      codigo_postal: "35500",
    });
    expect(status).toBe(200);
    expect(json).toMatchObject({
      disponible: true,
      zona: { nombre: "Arrecife centro" },
      envio: 2.5,
      minimo: 15,
      alcanza_minimo: true,
      falta_para_minimo: 0,
      total: 22.5,
      tiempo_estimado: "30-40 min",
    });
  });

  it("por debajo del mínimo mantiene el reparto e indica cuánto falta", async () => {
    const { json } = await quote("prueba-a", {
      tipo_despacho: "delivery",
      subtotal: 9,
      zona_nombre: "arrecife centro",
    });
    expect(json).toMatchObject({ disponible: true, alcanza_minimo: false, falta_para_minimo: 6 });
  });

  it("fuera de cobertura lo dice sin inventar tarifa", async () => {
    const { json } = await quote("prueba-a", {
      tipo_despacho: "delivery",
      subtotal: 30,
      codigo_postal: "35009",
    });
    expect(json).toMatchObject({
      disponible: false,
      motivo: "fuera_de_cobertura",
      tipo_despacho: "delivery",
    });
    expect(json.envio).toBeUndefined();
  });

  it("con ubicación elige el local y la zona por radio, como la web", async () => {
    const { json } = await quote("prueba-c", {
      tipo_despacho: "delivery",
      subtotal: 20,
      lat: 28.9545,
      lng: -13.577,
    });
    expect(json).toMatchObject({ disponible: true, local: { id: 3002 }, envio: 1.5 });
  });

  it("recogida: tiempo configurado del restaurante, sin pedir dirección", async () => {
    const { json } = await quote("prueba-a", { tipo_despacho: "retiro", subtotal: 12 });
    expect(json).toMatchObject({
      disponible: true,
      zona: null,
      envio: 0,
      total: 12,
      tiempo_estimado: "15 min",
    });
  });

  it("el modo ocupado del panel también cambia el tiempo que da el agente", async () => {
    const [principal] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.sucursal WHERE restaurante_id = 101 AND es_principal
    `;
    await ctx.sql`
      INSERT INTO public.modo_ocupado (restaurante_id, sucursal_id, servicio, minutos_extra, desde, hasta)
      VALUES (101, ${principal?.id ?? 0}, 'ambos', 20, '2026-11-03 12:00+00', '2026-11-03 14:00+00')
    `;
    const { json } = await quote("prueba-a", { tipo_despacho: "retiro", subtotal: 12 });
    expect(json.tiempo_estimado).toBe("35 min");
    await ctx.sql`UPDATE public.modo_ocupado SET finalizado_at = now() WHERE restaurante_id = 101`;
  });

  it("zonas por radio y sin ubicación: pide la ubicación", async () => {
    const { json } = await quote("prueba-c", { tipo_despacho: "delivery", subtotal: 20 });
    expect(json).toMatchObject({ disponible: false, motivo: "ubicacion_necesaria" });
  });

  it("recogida con varios locales: pide elegir, o reconoce el local que menciona", async () => {
    const ask = await quote("prueba-c", { tipo_despacho: "retiro", subtotal: 10 });
    expect(ask.json).toMatchObject({ disponible: false, motivo: "elegir_local" });
    expect((ask.json.locales as unknown[]).length).toBeGreaterThan(1);

    const named = await quote("prueba-c", {
      tipo_despacho: "retiro",
      subtotal: 10,
      texto_local: "lo recojo en el de playa honda",
    });
    expect(named.json).toMatchObject({ disponible: true, local: { id: 3002 } });
  });

  it("devuelve los métodos de pago del restaurante (el agente no los inventa)", async () => {
    const { json } = await quote("prueba-a", { tipo_despacho: "retiro", subtotal: 12 });
    expect(json.metodos_pago).toEqual(["efectivo", "tarjeta", "transferencia"]);
  });

  it("local cerrado: no se toma el pedido", async () => {
    const { json } = await quote("prueba-b", { tipo_despacho: "retiro", subtotal: 10 });
    expect(json).toMatchObject({ disponible: false, motivo: "local_cerrado" });
  });

  it("rechaza un cuerpo no válido", async () => {
    const { status } = await quote("prueba-a", { tipo_despacho: "delivery", subtotal: -1 });
    expect(status).toBe(400);
  });
});
