import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import {
  addressOptions,
  branchOptions,
  confirmOptions,
  fulfillmentOptions,
  paymentOptions,
} from "../src/repositories/agent-options";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";

describe("opciones de WhatsApp (puras)", () => {
  it("dirección: dos botones que caben en WhatsApp (título ≤ 20)", () => {
    const view = addressOptions();
    expect("botones" in view && view.botones.map((b) => b.id)).toEqual([
      "direccion:escribir",
      "direccion:ubicacion",
    ]);
    expect("botones" in view && view.botones.every((b) => b.titulo.length <= 20)).toBe(true);
  });

  it("confirmar: «Sí, confirmar» y «Cambiar algo», que caben en WhatsApp", () => {
    const view = confirmOptions();
    expect("botones" in view && view.botones.map((b) => b.id)).toEqual([
      "confirmar:si",
      "confirmar:cambiar",
    ]);
    expect("botones" in view && view.botones.every((b) => b.titulo.length <= 20)).toBe(true);
  });

  it("despacho: dos botones solo si se ofrecen recoger y reparto", () => {
    const both = fulfillmentOptions({ pickupEnabled: true, deliveryEnabled: true });
    expect(both).toMatchObject({ disponible: true });
    expect("botones" in both && both.botones.map((b) => b.id)).toEqual([
      "despacho:retiro",
      "despacho:delivery",
    ]);
    expect(fulfillmentOptions({ pickupEnabled: true, deliveryEnabled: false })).toMatchObject({
      disponible: false,
      motivo: "una_sola_opcion",
    });
  });

  it("local: lista con título recortado a 24 caracteres y descripción", () => {
    const view = branchOptions([
      { id: 1, name: "Sucursal con un nombre larguísimo de más", address: "Calle Mayor 1" },
      { id: 2, name: "Centro", address: null },
    ]);
    expect(view.disponible).toBe(true);
    const rows = "lista" in view ? (view.lista.secciones[0]?.filas ?? []) : [];
    expect(rows[0]?.titulo.length).toBeLessThanOrEqual(24);
    expect(rows[0]?.descripcion).toBe("Calle Mayor 1");
    expect(rows[1]).toEqual({ id: "local:2", titulo: "Centro" });
  });

  it("local: uno solo o más de diez no se ofrecen como lista", () => {
    expect(branchOptions([{ id: 1, name: "A", address: null }])).toMatchObject({
      disponible: false,
      motivo: "una_sola_opcion",
    });
    const many = Array.from({ length: 11 }, (_, i) => ({ id: i, name: `L${i}`, address: null }));
    expect(branchOptions(many)).toMatchObject({ disponible: false, motivo: "demasiadas_opciones" });
  });

  it("pago: hasta tres botones con su nombre", () => {
    const view = paymentOptions(["efectivo", "tarjeta", "bizum"]);
    expect("botones" in view && view.botones.map((b) => b.titulo)).toEqual([
      "Efectivo",
      "Tarjeta",
      "Bizum",
    ]);
    expect(paymentOptions(["efectivo"])).toMatchObject({ disponible: false });
    expect(paymentOptions(["efectivo", "tarjeta", "transferencia", "bizum"])).toMatchObject({
      motivo: "demasiadas_opciones",
    });
  });
});

describe.skipIf(!TEST_DATABASE_URL)("GET /agente/canales/:id/opciones", () => {
  let ctx: TestContext;
  let app: ReturnType<TestContext["appWith"]>;
  const canal = { a: 0, b: 0 };

  const get = async (canalId: number, query: string, secret: string | null = SECRET) => {
    const response = await app.request(`/agente/canales/${canalId}/opciones${query}`, {
      headers: secret === null ? {} : { [AGENT_SECRET_HEADER]: secret },
    });
    // biome-ignore lint/suspicious/noExplicitAny: respuesta JSON de la API en la prueba
    return { status: response.status, json: (await response.json()) as Record<string, any> };
  };

  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ agentSecret: SECRET });
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT r, m, 'complemento'
      FROM unnest(ARRAY[101, 102]) AS r, unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    for (const [key, restauranteId, phone] of [
      ["a", 101, "pn-opciones-a"],
      ["b", 102, "pn-opciones-b"],
    ] as const) {
      const [row] = await ctx.sql<{ id: string }[]>`
        INSERT INTO public.canal_whatsapp
          (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
        VALUES (${restauranteId}, NULL, 'kapso', ${phone}, '+15550000003', 'sandbox', 'activo')
        RETURNING id
      `;
      canal[key] = Number(row?.id);
    }
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("pago: cada restaurante ofrece solo sus formas de pago", async () => {
    const a = await get(canal.a, "?tipo=pago");
    expect(a.status).toBe(200);
    expect(a.json.botones.map((b: { id: string }) => b.id)).toEqual([
      "pago:efectivo",
      "pago:tarjeta",
      "pago:transferencia",
    ]);
    const b = await get(canal.b, "?tipo=pago");
    expect(b.json).toMatchObject({ disponible: false, motivo: "una_sola_opcion" });
  });

  it("dirección: escribirla o enviar la ubicación", async () => {
    const { status, json } = await get(canal.a, "?tipo=direccion");
    expect(status).toBe(200);
    expect(json.botones.map((b: { id: string }) => b.id)).toEqual([
      "direccion:escribir",
      "direccion:ubicacion",
    ]);
  });

  it("local con un único local abierto: no hay nada que elegir", async () => {
    const { status, json } = await get(canal.a, "?tipo=local");
    expect(status).toBe(200);
    expect(json.disponible).toBe(false);
  });

  it("rechaza tipo desconocido y secreto incorrecto", async () => {
    expect((await get(canal.a, "?tipo=otro")).status).toBe(400);
    expect((await get(canal.a, "?tipo=pago", "incorrecto")).status).toBe(401);
  });
});
