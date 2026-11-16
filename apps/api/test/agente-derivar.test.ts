import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";
const PHONE = "+34600111222";
/** Hora fija del harness (`now` de las dependencias). */
const NOW = new Date("2026-11-03T13:00:00Z");
const PAUSE_MINUTES = 120;

let ctx: TestContext;
let app: ReturnType<TestContext["appWith"]>;
const canal = { a: 0, b: 0, c: 0 };

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown, secret: string | null = SECRET) {
  const response = await app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(secret === null ? {} : { [AGENT_SECRET_HEADER]: secret }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

const derivar = (canalId: number, body: unknown, secret: string | null = SECRET) =>
  call("POST", `/agente/canales/${canalId}/conversacion/derivar`, body, secret);

async function insertChannel(restauranteId: number, phoneNumberId: string) {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.canal_whatsapp
      (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
    VALUES (${restauranteId}, NULL, 'kapso', ${phoneNumberId}, '+15550000002', 'sandbox', 'activo')
    RETURNING id
  `;
  return Number(row?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("derivar a una persona y preguntas (/agente)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ agentSecret: SECRET });
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT r, m, 'complemento'
      FROM unnest(ARRAY[101, 102, 103]) AS r, unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    // A tiene su propia pausa al derivar; C la desactiva (0), aunque la plantilla traiga una.
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'agente_pausa_derivar_minutos', ${String(PAUSE_MINUTES)}),
             (103, 'agente_pausa_derivar_minutos', '0')
    `;
    canal.a = await insertChannel(101, "pn-derivar-a");
    canal.b = await insertChannel(102, "pn-derivar-b");
    canal.c = await insertChannel(103, "pn-derivar-c");
    await ctx.sql`
      INSERT INTO public.faqs (restaurante_id, pregunta, respuesta, orden) VALUES
        (101, 'Zeta de A', 'Respuesta Z de A', 2),
        (101, 'Alfa de A', 'Respuesta Alfa de A', 1),
        (101, 'Beta de A', 'Respuesta Beta de A', 1),
        (102, 'Pregunta de B', 'Respuesta de B', 1)
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("deriva: crea la escalación solo del restaurante A y pausa al agente", async () => {
    const { status, json } = await derivar(canal.a, {
      telefono: PHONE,
      motivo: "reclamo",
      resumen: "  Llegó frío el pedido  ",
    });
    expect(status).toBe(201);
    expect(json.pausado_hasta).toBe(new Date(NOW.getTime() + PAUSE_MINUTES * 60_000).toISOString());

    const rows = await ctx.sql<
      { id: string; problema: string; estado: string; tipo_escalacion: string; contexto: Json }[]
    >`SELECT id, problema, estado, tipo_escalacion, contexto FROM public.escalaciones WHERE restaurante_id = 101`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.id)).toBe(json.escalacion_id);
    expect(rows[0]).toMatchObject({
      problema: "Llegó frío el pedido",
      estado: "pendiente",
      tipo_escalacion: "reclamo",
      contexto: { canal_id: canal.a, origen: "agente_whatsapp", motivo: "reclamo" },
    });
    // El restaurante B no ve nada.
    const other = await ctx.sql`SELECT 1 FROM public.escalaciones WHERE restaurante_id = 102`;
    expect(other).toHaveLength(0);

    const [conv] = await ctx.sql<{ pausado_hasta: Date; pausado_por: string }[]>`
      SELECT pausado_hasta, pausado_por FROM public.whatsapp_conversacion
      WHERE canal_id = ${canal.a} AND telefono = ${PHONE}
    `;
    expect(conv?.pausado_por).toBe("derivar_humano");
    expect(conv?.pausado_hasta.toISOString()).toBe(json.pausado_hasta);
  });

  it("derivar otra vez actualiza la pausa sin duplicar la conversación", async () => {
    const { status } = await derivar(canal.a, {
      telefono: PHONE,
      motivo: "pide_persona",
      resumen: "Quiere hablar con alguien",
    });
    expect(status).toBe(201);
    const conv = await ctx.sql`
      SELECT 1 FROM public.whatsapp_conversacion WHERE canal_id = ${canal.a} AND telefono = ${PHONE}
    `;
    expect(conv).toHaveLength(1);
  });

  it("sin configuración de pausa no pausa, pero registra la escalación", async () => {
    const { status, json } = await derivar(canal.c, {
      telefono: PHONE,
      motivo: "otro",
      resumen: "Caso raro",
    });
    expect(status).toBe(201);
    expect(json.pausado_hasta).toBeNull();
    const conv = await ctx.sql`
      SELECT 1 FROM public.whatsapp_conversacion WHERE canal_id = ${canal.c}
    `;
    expect(conv).toHaveLength(0);
    const rows = await ctx.sql`SELECT 1 FROM public.escalaciones WHERE restaurante_id = 103`;
    expect(rows).toHaveLength(1);
  });

  it("rechaza motivo, teléfono o resumen no válidos con 400", async () => {
    const valid = { telefono: PHONE, motivo: "reclamo", resumen: "x" };
    expect((await derivar(canal.a, { ...valid, motivo: "inventado" })).status).toBe(400);
    expect((await derivar(canal.a, { ...valid, telefono: "600111222" })).status).toBe(400);
    expect((await derivar(canal.a, { ...valid, resumen: "   " })).status).toBe(400);
    expect((await derivar(canal.a, { ...valid, resumen: "x".repeat(1001) })).status).toBe(400);
  });

  it("con un secreto incorrecto o sin él responde 401", async () => {
    const body = { telefono: PHONE, motivo: "reclamo", resumen: "x" };
    expect((await derivar(canal.a, body, "otro-secreto-que-no-es-el-bueno-000")).status).toBe(401);
    expect((await derivar(canal.a, body, null)).status).toBe(401);
  });

  it("preguntas: solo las del restaurante, por orden y luego por pregunta", async () => {
    const a = await call("GET", `/agente/canales/${canal.a}/preguntas`);
    expect(a.status).toBe(200);
    expect(a.json.preguntas).toEqual([
      { pregunta: "Alfa de A", respuesta: "Respuesta Alfa de A" },
      { pregunta: "Beta de A", respuesta: "Respuesta Beta de A" },
      { pregunta: "Zeta de A", respuesta: "Respuesta Z de A" },
    ]);
    const b = await call("GET", `/agente/canales/${canal.b}/preguntas`);
    expect(b.json.preguntas).toEqual([{ pregunta: "Pregunta de B", respuesta: "Respuesta de B" }]);
    const c = await call("GET", `/agente/canales/${canal.c}/preguntas`);
    expect(c.json.preguntas).toEqual([]);
  });

  it("preguntas sin secreto responde 401", async () => {
    const response = await call("GET", `/agente/canales/${canal.a}/preguntas`, undefined, null);
    expect(response.status).toBe(401);
  });
});
