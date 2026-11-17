import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";
const PHONE = "+34600111222";

let ctx: TestContext;
let app: ReturnType<TestContext["appWith"]>;
const canal = { a: 0, cPlaya: 0, b: 0, inactivo: 0 };

async function get(path: string, secret: string | null = SECRET) {
  const response = await app.request(path, {
    headers: secret === null ? {} : { [AGENT_SECRET_HEADER]: secret },
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  const json = (await response.json()) as Record<string, any>;
  return { status: response.status, json };
}

async function insertChannel(
  restauranteId: number,
  phoneNumberId: string,
  sucursalId: number | null,
  estado = "activo",
): Promise<number> {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.canal_whatsapp
      (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
    VALUES (${restauranteId}, ${sucursalId}, 'kapso', ${phoneNumberId}, '+15550000000', 'sandbox', ${estado})
    RETURNING id
  `;
  return Number(row?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("rutas del agente de WhatsApp (/agente)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ agentSecret: SECRET });
    // A y C tienen el agente contratado; B no.
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT r, m, 'complemento'
      FROM unnest(ARRAY[101, 103]) AS r, unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
        (101, 'agente_activo', 'true'),
        (101, 'agente_tono', 'formal'),
        (101, 'agente_pausa_derivar_minutos', '120'),
        (103, 'agente_nombre_visible', 'Lola')
    `;
    canal.a = await insertChannel(101, "pn-a", null);
    canal.cPlaya = await insertChannel(103, "pn-c-playa", 3002);
    canal.b = await insertChannel(102, "pn-b", null);
    canal.inactivo = await insertChannel(101, "pn-a-viejo", null, "desconectado");
    // El mismo teléfono es cliente de A y de B con nombres distintos.
    await ctx.sql`
      INSERT INTO public.usuarios (restaurante_id, telefono, nombre, direccion_frecuente) VALUES
        (101, ${PHONE}, 'Ana de A', 'Calle A 1'),
        (102, ${PHONE}, 'Ana de B', 'Calle B 2')
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("autenticación y canal", () => {
    it("sin secreto configurado en la API responde 503", async () => {
      const response = await ctx.app.request(`/agente/canales/${canal.a}/carta`, {
        headers: { [AGENT_SECRET_HEADER]: SECRET },
      });
      expect(response.status).toBe(503);
    });

    it("con un secreto incorrecto o sin él responde 401", async () => {
      expect((await get(`/agente/canales/${canal.a}/carta`, "otro")).status).toBe(401);
      expect((await get(`/agente/canales/${canal.a}/carta`, null)).status).toBe(401);
    });

    it("un canal desconectado o inexistente no da acceso", async () => {
      expect((await get(`/agente/canales/${canal.inactivo}/carta`)).json).toMatchObject({
        reason: "canal_no_activo",
      });
      expect((await get("/agente/canales/999999/carta")).status).toBe(404);
      expect((await get("/agente/canales/abc/carta")).status).toBe(404);
    });

    it("sin el módulo del agente el restaurante no se atiende", async () => {
      const { status, json } = await get(`/agente/canales/${canal.b}/carta`);
      expect(status).toBe(403);
      expect(json.reason).toBe("modulo_agente_inactivo");
    });
  });

  describe("contexto", () => {
    it("carta_url: la carta pública del restaurante, o null sin URL pública configurada", async () => {
      const path = `/agente/canales/${canal.a}/contexto?telefono=%2B34600111222`;
      expect((await get(path)).json.carta_url).toBeNull();
      const withUrl = ctx.appWith({ agentSecret: SECRET, panelUrl: "https://pedidos.test/" });
      const response = await withUrl.request(path, { headers: { [AGENT_SECRET_HEADER]: SECRET } });
      expect(((await response.json()) as { carta_url: string | null }).carta_url).toBe(
        "https://pedidos.test/prueba-a/carta",
      );
    });

    it("nota_alergenos: la de la plantilla con el enlace de la carta; el agente no da alérgenos", async () => {
      const path = `/agente/canales/${canal.a}/contexto?telefono=%2B34600111222`;
      const withUrl = ctx.appWith({ agentSecret: SECRET, panelUrl: "https://pedidos.test" });
      const response = await withUrl.request(path, { headers: { [AGENT_SECRET_HEADER]: SECRET } });
      const json = (await response.json()) as { agente: { nota_alergenos: string | null } };
      expect(json.agente.nota_alergenos).toBe(
        "Para información de alérgenos, consulta la carta: https://pedidos.test/prueba-a/carta",
      );
      // Sin URL pública no queda el marcador a medias.
      expect((await get(path)).json.agente.nota_alergenos).toBe(
        "Para información de alérgenos, consulta la carta",
      );
    });

    it("identidad en nombre del restaurante y datos del cliente solo de ese restaurante", async () => {
      const { status, json } = await get(
        `/agente/canales/${canal.a}/contexto?telefono=%2B34600111222`,
      );
      expect(status).toBe(200);
      expect(json.restaurante).toMatchObject({ id: 101, nombre: "Cafetería de prueba A" });
      expect(json.agente).toMatchObject({
        activo: true,
        presentacion: "Soy el agente de pedidos del restaurante Cafetería de prueba A",
        tono: "formal",
        pausa_minutos: null,
        pausa_derivar_minutos: 120,
      });
      expect(json.cliente).toEqual({
        telefono: PHONE,
        nombre: "Ana de A",
        direccion_frecuente: "Calle A 1",
      });
      expect(json.abierto).toBe(true);
      expect(json.puede_pedir).toBe(true);
      expect(json.metodos_pago).toEqual(["efectivo", "tarjeta", "transferencia"]);
    });

    it("sin agente_activo el contexto lo dice; con nombre visible se presenta con él", async () => {
      const { json } = await get(
        `/agente/canales/${canal.cPlaya}/contexto?telefono=%2B34600999888`,
      );
      expect(json.agente.activo).toBe(false);
      expect(json.agente.presentacion).toBe(
        "Soy Lola, el agente de pedidos del restaurante Cafetería con dos locales",
      );
      expect(json.cliente.nombre).toBeNull();
    });

    it("un número de un local responde por ese local", async () => {
      const { json } = await get(
        `/agente/canales/${canal.cPlaya}/contexto?telefono=%2B34600999888`,
      );
      expect(json.canal).toEqual({ id: canal.cPlaya, sucursal_id: 3002 });
      expect(json.local_del_canal).toMatchObject({ id: 3002, nombre: "Playa Honda" });
      expect(json.locales.map((local: { id: number }) => local.id)).toContain(3003);
    });

    it("un teléfono bloqueado no puede pedir (sin decir por qué)", async () => {
      await ctx.sql`
        INSERT INTO public.cliente_bloqueado (restaurante_id, telefono, motivo)
        VALUES (101, public.fn_telefono_normalizado('+34600777666'), 'pruebas')
      `;
      const { json } = await get(`/agente/canales/${canal.a}/contexto?telefono=%2B34600777666`);
      expect(json.puede_pedir).toBe(false);
    });

    it("exige el teléfono en E.164", async () => {
      expect((await get(`/agente/canales/${canal.a}/contexto?telefono=600111222`)).status).toBe(
        400,
      );
    });
  });

  describe("carta", () => {
    it("solo productos activos de su restaurante, con variantes, extras y alérgenos", async () => {
      const { status, json } = await get(`/agente/canales/${canal.a}/carta`);
      expect(status).toBe(200);
      const ids = json.productos.map((product: { id: number }) => product.id);
      expect(ids).toEqual([1101]);
      expect(json.productos[0]).toMatchObject({
        nombre: "Salchimaduro",
        categoria: "Salchipapas",
        variantes: [
          { id: 1201, nombre: "Pequeño", precio: 9 },
          { id: 1202, nombre: "Grande", precio: 14 },
        ],
        extras: [{ id: 1301, nombre: "Queso", precio: 2.5 }],
      });
      // El agente no da alérgenos por WhatsApp: remite a la carta (nota_alergenos).
      expect(json.productos[0]).not.toHaveProperty("alergenos");
    });

    it("lo agotado en el local del número no aparece", async () => {
      const { json } = await get(`/agente/canales/${canal.cPlaya}/carta`);
      expect(json.local).toEqual({ id: 3002, nombre: "Playa Honda" });
      expect(json.productos.map((product: { id: number }) => product.id)).toEqual([3201]);
    });

    it("se puede consultar otro local del mismo restaurante, nunca uno ajeno", async () => {
      const principal = await ctx.sql<{ id: string }[]>`
        SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
      `;
      const own = await get(
        `/agente/canales/${canal.cPlaya}/carta?sucursal_id=${principal[0]?.id}`,
      );
      expect(own.json.productos.map((product: { id: number }) => product.id)).toEqual([3201, 3202]);
      expect((await get(`/agente/canales/${canal.a}/carta?sucursal_id=3002`)).status).toBe(404);
    });

    it("busca lo que escribió el cliente: producto, variante y extra", async () => {
      const { json } = await get(
        `/agente/canales/${canal.a}/carta?q=${encodeURIComponent("dos salchimaduros grandes con queso")}`,
      );
      expect(json.candidatos).toHaveLength(1);
      expect(json.candidatos[0]).toMatchObject({
        id: 1101,
        variante_id: 1202,
        extra_ids: [1301],
      });
    });

    it("lo que no está en la carta no devuelve candidatos", async () => {
      const { json } = await get(`/agente/canales/${canal.a}/carta?q=margarita`);
      expect(json.candidatos).toEqual([]);
    });

    it("filtra por categoría", async () => {
      const { json } = await get(`/agente/canales/${canal.a}/carta?categoria=salchipapa`);
      expect(json.productos).toHaveLength(1);
      const none = await get(`/agente/canales/${canal.a}/carta?categoria=bebidas`);
      expect(none.json.productos).toEqual([]);
    });
  });

  describe("memoria del agente (n8n_chat_histories)", () => {
    const insert = (sessionId: string) =>
      ctx.sql<{ restaurante_id: number }[]>`
        INSERT INTO public.n8n_chat_histories (session_id, message)
        VALUES (${sessionId}, '{"type":"human"}'::jsonb)
        RETURNING restaurante_id
      `;

    it("la clave «{restaurante}:{teléfono}» guarda la conversación en ese restaurante", async () => {
      const [row] = await insert(`103:${PHONE}`);
      expect(row?.restaurante_id).toBe(103);
    });

    it("el formato antiguo «{restaurante}_{resto}» sigue funcionando", async () => {
      const [row] = await insert("102_conversacion-7");
      expect(row?.restaurante_id).toBe(102);
    });

    it("sin restaurante válido no se guarda (nunca cae en el restaurante 1)", async () => {
      await expect(insert(PHONE)).rejects.toThrow(/no identifica al restaurante/);
      await expect(insert(`999999:${PHONE}`)).rejects.toThrow(/no existe/);
    });
  });
});
