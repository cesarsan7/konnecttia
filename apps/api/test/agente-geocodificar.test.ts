import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GeocodeRequest, Geocoder } from "../src/lib/geocoding";
import { createNominatimGeocoder } from "../src/lib/geocoding";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";
const PHONE = "+34611000777";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe("createNominatimGeocoder", () => {
  const body = [{ lat: "28.9630", lon: "-13.5480", display_name: "Calle La Rosa 33, Arrecife" }];

  it("pide país y entorno del local, devuelve el punto y guarda en caché", async () => {
    const calls: URL[] = [];
    const fetcher = (async (url: URL) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const geocode = createNominatimGeocoder({
      baseUrl: "https://geo.test/",
      userAgent: "Pruebas/1.0 (test@example.com)",
      fetch: fetcher,
    });
    const request: GeocodeRequest = {
      address: "C. la Rosa, 33, 35500 Arrecife",
      countryCode: "ES",
      near: { lat: 28.96, lng: -13.55 },
    };
    const first = await geocode(request);
    expect(first?.point).toEqual({ lat: 28.963, lng: -13.548 });
    expect(calls[0]?.searchParams.get("countrycodes")).toBe("es");
    expect(calls[0]?.searchParams.get("viewbox")).toBeTruthy();
    await geocode(request);
    expect(calls).toHaveLength(1);
  });

  it("sin resultados devuelve null y con error del servicio lanza", async () => {
    const empty = createNominatimGeocoder({
      baseUrl: "https://geo.test",
      userAgent: "Pruebas/1.0 (test@example.com)",
      fetch: (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch,
    });
    expect(await empty({ address: "no existe 1", countryCode: "es", near: null })).toBeNull();
    const broken = createNominatimGeocoder({
      baseUrl: "https://geo.test",
      userAgent: "Pruebas/1.0 (test@example.com)",
      fetch: (async () => new Response("", { status: 503 })) as unknown as typeof fetch,
    });
    await expect(broken({ address: "otra 2", countryCode: "es", near: null })).rejects.toThrow();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("reparto con dirección escrita (/agente)", () => {
  let ctx: TestContext;
  let canal = 0;
  const asked: GeocodeRequest[] = [];
  let answer: "dentro" | "fuera" | "nada" | "caido" = "dentro";
  const geocoder: Geocoder = async (request) => {
    asked.push(request);
    if (answer === "caido") throw new Error("sin servicio");
    if (answer === "nada") return null;
    const point = answer === "dentro" ? { lat: 28.9631, lng: -13.5481 } : { lat: 40.4, lng: -3.7 };
    return { point, label: "resultado" };
  };

  const call = async (method: string, path: string, body?: unknown) => {
    const app = ctx.appWith({ agentSecret: SECRET, geocoder });
    const response = await app.request(path, {
      method,
      headers: { "Content-Type": "application/json", [AGENT_SECRET_HEADER]: SECRET },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, json: (await response.json()) as Json };
  };
  const setDelivery = (direccion: string) =>
    call("PUT", `/agente/canales/${canal}/carrito/despacho`, {
      telefono: PHONE,
      tipo: "delivery",
      direccion,
    });

  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT 103, m, 'complemento' FROM unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    await ctx.sql`UPDATE public.restaurante SET pais_code = 'ES' WHERE id = 103`;
    const [row] = await ctx.sql<{ id: string }[]>`
      INSERT INTO public.canal_whatsapp
        (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
      VALUES (103, NULL, 'kapso', 'pn-geo', '+15550000005', 'sandbox', 'activo')
      RETURNING id
    `;
    canal = Number(row?.id);
    await call("PUT", `/agente/canales/${canal}/carrito`, {
      telefono: PHONE,
      operaciones: [{ op: "agregar", menu_item_id: 3201, menu_variant_id: 3301, cantidad: 2 }],
    });
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("geocodifica la dirección, valida la zona y guarda las coordenadas", async () => {
    answer = "dentro";
    const { json } = await setDelivery("C. la Rosa, 33, 35500 Arrecife, Las Palmas, Spain");
    expect(json.disponible).toBe(true);
    expect(asked.at(-1)).toMatchObject({ countryCode: "ES" });
    expect(asked.at(-1)?.near).not.toBeNull();
    const [cart] =
      await ctx.sql`SELECT lat, lng FROM public.agente_carrito WHERE telefono = ${PHONE}`;
    expect(Number(cart?.lat)).toBeCloseTo(28.9631, 4);
  });

  it("una dirección fuera de la zona no se acepta", async () => {
    answer = "fuera";
    const { json } = await setDelivery("Calle Alcalá 1, Madrid");
    expect(json.disponible).toBe(false);
  });

  it("dirección no encontrada: pide más datos", async () => {
    answer = "nada";
    const { json } = await setDelivery("zzz 999, 99999 Nowhere");
    expect(json).toMatchObject({ disponible: false, motivo: "direccion_no_encontrada" });
  });

  it("sin código postal ni zona (y sin pin) no se acepta, aunque haya dirección", async () => {
    answer = "dentro";
    const before = asked.length;
    const { json } = await setDelivery("Calle La Rosa 33, Arrecife");
    expect(json).toMatchObject({ disponible: false, motivo: "falta_codigo_postal_o_zona" });
    expect(asked).toHaveLength(before);
  });

  it("si el servicio no responde, sigue pidiendo la ubicación como antes", async () => {
    answer = "caido";
    const { json } = await setDelivery("Calle La Rosa 33, 35500 Arrecife");
    expect(json).toMatchObject({ disponible: false, motivo: "ubicacion_necesaria" });
  });

  it("un pin explícito no se geocodifica", async () => {
    answer = "dentro";
    const before = asked.length;
    const { json } = await call("PUT", `/agente/canales/${canal}/carrito/despacho`, {
      telefono: PHONE,
      tipo: "delivery",
      direccion: "Calle La Rosa 33",
      lat: 28.9632,
      lng: -13.5482,
    });
    expect(json.disponible).toBe(true);
    expect(asked).toHaveLength(before);
  });
});
