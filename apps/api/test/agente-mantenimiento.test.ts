import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import { changeOrderStatus } from "../src/repositories/order-status";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";
/** Hora fija del harness (`now` de las dependencias). */
const NOW = new Date("2026-11-03T13:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

let ctx: TestContext;
let app: ReturnType<TestContext["appWith"]>;
const canal = { pro: 0, basic: 0 };

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function run(secret: string | null = SECRET) {
  const response = await app.request("/agente/mantenimiento/caducidad", {
    method: "POST",
    headers: secret === null ? {} : { [AGENT_SECRET_HEADER]: secret },
  });
  return { status: response.status, json: (await response.json()) as Json };
}

async function insertChannel(restauranteId: number, phoneNumberId: string) {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.canal_whatsapp
      (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
    VALUES (${restauranteId}, NULL, 'kapso', ${phoneNumberId}, '+15550000003', 'sandbox', 'activo')
    RETURNING id
  `;
  return Number(row?.id);
}

async function openCart(restauranteId: number, canalId: number, phone: string, minutes: number) {
  await ctx.sql`
    INSERT INTO public.agente_carrito (restaurante_id, canal_id, telefono, lineas, updated_at)
    VALUES (${restauranteId}, ${canalId}, ${phone},
            ${ctx.sql.json([{ menu_item_id: 1, menu_variant_id: 1, cantidad: 1, extras: [] }])},
            ${ago(minutes)})
  `;
}

async function pendingOrder(
  restauranteId: number,
  canalId: number,
  phone: string,
  code: string,
  minutes: number,
) {
  const [order] = await ctx.sql<{ id: number }[]>`
    INSERT INTO public.pedidos (restaurante_id, telefono, estado, estado_pago, pedido_codigo, canal)
    VALUES (${restauranteId}, ${phone}, 'pendiente_pago', 'pendiente', ${code}, 'whatsapp')
    RETURNING id
  `;
  await ctx.sql`
    INSERT INTO public.agente_carrito
      (restaurante_id, canal_id, telefono, estado, pedido_id, updated_at)
    VALUES (${restauranteId}, ${canalId}, ${phone}, 'confirmado', ${Number(order?.id)}, ${ago(minutes)})
  `;
  return Number(order?.id);
}

const stateOf = async (id: number) =>
  (await ctx.sql<{ estado: string }[]>`SELECT estado FROM public.pedidos WHERE id = ${id}`)[0]
    ?.estado;
const cartState = async (restauranteId: number, phone: string) =>
  (
    await ctx.sql<{ estado: string }[]>`
      SELECT estado FROM public.agente_carrito
      WHERE restaurante_id = ${restauranteId} AND telefono = ${phone} AND estado <> 'confirmado'
    `
  )[0]?.estado;

describe.skipIf(!TEST_DATABASE_URL)("mantenimiento de caducidad del agente", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ agentSecret: SECRET });
    // 101 tiene el agente y el módulo premium; 103, solo el agente.
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      VALUES (101, 'whatsapp.channel', 'complemento'), (101, 'whatsapp.agent', 'complemento'),
             (101, 'whatsapp.agent_pro', 'complemento'),
             (103, 'whatsapp.channel', 'complemento'), (103, 'whatsapp.agent', 'complemento')
      ON CONFLICT DO NOTHING
    `;
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'agente_tono', 'formal')
    `;
    canal.pro = await insertChannel(101, "pn-mant-a");
    canal.basic = await insertChannel(103, "pn-mant-c");
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("exige el secreto de n8n", async () => {
    expect((await run(null)).status).toBe(401);
    expect((await run("otro")).status).toBe(401);
  });

  it("caduca carritos, avisa solo con premium y una sola vez, y respeta a cada restaurante", async () => {
    await openCart(101, canal.pro, "+34600000001", 31); // caduca (30 min)
    await openCart(101, canal.pro, "+34600000002", 26); // se avisa (5 min antes)
    await openCart(101, canal.pro, "+34600000003", 10); // nada
    await openCart(103, canal.basic, "+34600000004", 31); // caduca, sin avisos
    await openCart(103, canal.basic, "+34600000005", 26); // sin premium: no se avisa

    const first = await run();
    expect(first.status).toBe(200);
    expect(first.json.carritos_caducados).toBe(2);
    expect(first.json.avisos).toEqual([
      {
        restaurante_id: 101,
        canal_id: canal.pro,
        destinatario: "+34600000002",
        texto: "Su carrito caducará en unos 5 minutos. ¿Desea continuar con su pedido?",
      },
    ]);
    expect(await cartState(101, "+34600000001")).toBe("caducado");
    expect(await cartState(103, "+34600000004")).toBe("caducado");
    expect(await cartState(103, "+34600000005")).toBe("abierto");

    expect((await run()).json.avisos).toEqual([]);
  });

  it("cancela pagos pendientes vencidos solo con premium y sin justificante", async () => {
    const stale = await pendingOrder(101, canal.pro, "+34600000010", "PED-1", 61);
    const fresh = await pendingOrder(101, canal.pro, "+34600000011", "PED-2", 10);
    const proof = await pendingOrder(101, canal.pro, "+34600000012", "PED-3", 90);
    await ctx.sql`
      INSERT INTO public.pedido_justificante (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
      VALUES (${proof}, 101, '101/x/a.jpg', 'image/jpeg', 10)
    `;
    const withoutPro = await pendingOrder(103, canal.basic, "+34600000013", "PED-4", 120);

    const { json } = await run();
    expect(json.pedidos_cancelados).toEqual([
      {
        restaurante_id: 101,
        canal_id: canal.pro,
        destinatario: "+34600000010",
        texto: expect.stringContaining("PED-1"),
      },
    ]);
    expect(await stateOf(stale)).toBe("cancelado");
    expect(await stateOf(fresh)).toBe("pendiente_pago");
    expect(await stateOf(proof)).toBe("pendiente_pago");
    expect(await stateOf(withoutPro)).toBe("pendiente_pago");
    expect((await run()).json.pedidos_cancelados).toEqual([]);
  });

  it("avisa los cambios de estado elegidos, solo con premium, una vez y sin duplicar cancelaciones", async () => {
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'agente_notif_estados', '["listo","entregado","cancelado"]'),
             (103, 'agente_notif_estados', '["listo"]')
    `;
    const order = async (
      restauranteId: number,
      canalId: number,
      phone: string,
      code: string,
      status: string,
    ) => {
      const [row] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos
          (restaurante_id, telefono, estado, estado_pago, pedido_codigo, canal, tipo_despacho)
        VALUES (${restauranteId}, ${phone}, ${status}, 'pagado', ${code}, 'whatsapp', 'retiro')
        RETURNING id
      `;
      await ctx.sql`
        INSERT INTO public.agente_carrito
          (restaurante_id, canal_id, telefono, estado, pedido_id, updated_at)
        VALUES (${restauranteId}, ${canalId}, ${phone}, 'confirmado', ${Number(row?.id)}, ${ago(5)})
      `;
      return Number(row?.id);
    };
    const move = (restauranteId: number, orderId: number, target: string, origin: string) =>
      changeOrderStatus(ctx.sql, {
        restaurantId: restauranteId,
        orderId,
        target,
        origin,
        actor: "test",
        allowed: () => true,
      });

    const main = await order(101, canal.pro, "+34600000020", "PED-10", "en_preparacion");
    const basic = await order(103, canal.basic, "+34600000021", "PED-11", "en_preparacion");
    const byClient = await order(101, canal.pro, "+34600000022", "PED-12", "recibido");
    await move(101, main, "listo", "panel");
    await move(103, basic, "listo", "panel");
    await move(101, byClient, "cancelado", "cliente");

    const first = (await run()).json.estados;
    expect(first).toEqual([
      {
        restaurante_id: 101,
        canal_id: canal.pro,
        destinatario: "+34600000020",
        texto: "Su pedido PED-10 está listo para recoger.",
      },
    ]);
    expect((await run()).json.estados).toEqual([]);

    await move(101, main, "entregado", "panel");
    expect((await run()).json.estados).toEqual([
      expect.objectContaining({ texto: expect.stringContaining("entregado") }),
    ]);
  });

  it("pedido_pago_pendiente_expira_minutos = 0 desactiva la cancelación", async () => {
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'pedido_pago_pendiente_expira_minutos', '0')
    `;
    const id = await pendingOrder(101, canal.pro, "+34600000014", "PED-5", 500);
    expect((await run()).json.pedidos_cancelados).toEqual([]);
    expect(await stateOf(id)).toBe("pendiente_pago");
  });
});
