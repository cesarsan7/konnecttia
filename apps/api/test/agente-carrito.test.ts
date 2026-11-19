import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENT_SECRET_HEADER } from "../src/middleware/agent";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

const SECRET = "secreto-de-pruebas-del-agente-0123456789";

let ctx: TestContext;
let app: ReturnType<TestContext["appWith"]>;
const canal = { a: 0, cPlaya: 0 };

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { [AGENT_SECRET_HEADER]: SECRET, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

const cartPath = (canalId: number) => `/agente/canales/${canalId}/carrito`;
const put = (canalId: number, body: unknown) => call("PUT", cartPath(canalId), body);
const despacho = (canalId: number, body: unknown) =>
  call("PUT", `${cartPath(canalId)}/despacho`, body);
const confirmar = (canalId: number, body: unknown) =>
  call("POST", `${cartPath(canalId)}/confirmar`, body);
const getCart = (canalId: number, telefono: string) =>
  call("GET", `${cartPath(canalId)}?telefono=${encodeURIComponent(telefono)}`);

async function insertChannel(restauranteId: number, id: string, sucursalId: number | null) {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.canal_whatsapp
      (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
    VALUES (${restauranteId}, ${sucursalId}, 'kapso', ${id}, '+15550000001', 'sandbox', 'activo')
    RETURNING id
  `;
  return Number(row?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("carrito del agente de WhatsApp", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ agentSecret: SECRET, panelUrl: "https://pedidos.test" });
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT r, m, 'complemento'
      FROM unnest(ARRAY[101, 103]) AS r, unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'cart_expiry_minutes', '30')
    `;
    canal.a = await insertChannel(101, "pn-carrito-a", null);
    canal.cPlaya = await insertChannel(103, "pn-carrito-c", 3002);
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("armar el carrito", () => {
    const PHONE = "+34611000001";

    it("sin variante y con varias, pide elegir y no inventa", async () => {
      const { status, json } = await put(canal.a, {
        telefono: PHONE,
        operaciones: [{ op: "agregar", menu_item_id: 1101 }],
      });
      expect(status).toBe(200);
      expect(json.pendientes).toEqual([
        {
          operacion: 1,
          motivo: "elegir_variante",
          producto: "Salchimaduro",
          opciones: [
            { id: 1201, nombre: "Pequeño", precio: 9 },
            { id: 1202, nombre: "Grande", precio: 14 },
          ],
        },
      ]);
      expect(json.carrito.lineas).toEqual([]);
      expect(json.carrito.siguiente_paso).toBe("anadir_productos");
    });

    it("precio calculado en el servidor, con extras; la misma línea se suma", async () => {
      const add = {
        op: "agregar",
        menu_item_id: 1101,
        menu_variant_id: 1202,
        cantidad: 2,
        extras: [{ extra_id: 1301 }],
      };
      await put(canal.a, { telefono: PHONE, operaciones: [add] });
      const { json } = await put(canal.a, { telefono: PHONE, operaciones: [add] });
      expect(json.pendientes).toEqual([]);
      expect(json.carrito.lineas).toEqual([
        expect.objectContaining({
          linea: 1,
          producto: "Salchimaduro",
          variante: "Grande",
          cantidad: 4,
          precio_unitario: 16.5,
          importe: 66,
          extras: [{ nombre: "Queso", cantidad: 1, precio: 2.5 }],
        }),
      ]);
      expect(json.carrito).toMatchObject({
        subtotal: 66,
        envio: 0,
        total: 66,
        despacho: null,
        siguiente_paso: "elegir_despacho",
      });
      // El agente no da alérgenos por WhatsApp: remite a la carta (nota_alergenos).
      expect(json.carrito.lineas[0]).not.toHaveProperty("alergenos");
    });

    it("el contexto del turno trae el carrito real (y nulo si no hay): el agente no depende de su memoria", async () => {
      const contexto = (telefono: string) =>
        call("GET", `/agente/canales/${canal.a}/contexto?telefono=${encodeURIComponent(telefono)}`);
      const withCart = await contexto(PHONE);
      expect(withCart.json.carrito).toMatchObject({
        despacho: null,
        siguiente_paso: "elegir_despacho",
      });
      expect(withCart.json.carrito.lineas.length).toBeGreaterThan(0);
      expect((await contexto("+34699999999")).json.carrito).toBeNull();
    });

    it("un carrito caducado se cuenta una sola vez en el contexto", async () => {
      const phone = "+34611000077";
      const contexto = () =>
        call("GET", `/agente/canales/${canal.a}/contexto?telefono=${encodeURIComponent(phone)}`);
      await put(canal.a, {
        telefono: phone,
        operaciones: [{ op: "agregar", menu_item_id: 1101, menu_variant_id: 1202, cantidad: 1 }],
      });
      expect((await contexto()).json.carrito_caducado).toBeNull();
      // El mantenimiento lo caduca antes de que el cliente vuelva.
      await ctx.sql`
        UPDATE public.agente_carrito SET estado = 'caducado'
        WHERE  canal_id = ${canal.a} AND telefono = ${phone} AND estado = 'abierto'
      `;
      const { json } = await contexto();
      expect(json.carrito).toBeNull();
      expect(json.carrito_caducado.lineas).toEqual([
        expect.objectContaining({ producto: "Salchimaduro", cantidad: 1 }),
      ]);
      // Solo se cuenta una vez: el sistema ya avisó al cliente, no se repite en cada mensaje.
      expect((await contexto()).json.carrito_caducado).toBeNull();
      // Con un carrito nuevo, el caducado deja de contar.
      await put(canal.a, {
        telefono: phone,
        operaciones: [{ op: "agregar", menu_item_id: 1101, menu_variant_id: 1202, cantidad: 2 }],
      });
      const after = (await contexto()).json;
      expect(after.carrito).not.toBeNull();
      expect(after.carrito_caducado).toBeNull();
    });

    it("nunca acepta productos ni extras de otro restaurante", async () => {
      const { json } = await put(canal.a, {
        telefono: PHONE,
        operaciones: [
          { op: "agregar", menu_item_id: 2101, menu_variant_id: 2201 },
          {
            op: "agregar",
            menu_item_id: 1101,
            menu_variant_id: 1201,
            extras: [{ extra_id: 2301 }],
          },
        ],
      });
      expect(json.pendientes.map((pending: Json) => pending.motivo)).toEqual([
        "producto_no_encontrado",
        "OPTION_NOT_IN_ITEM",
      ]);
      expect(json.carrito.lineas).toHaveLength(1);
    });

    it("cambia cantidades y notas por número de línea", async () => {
      const { json } = await put(canal.a, {
        telefono: PHONE,
        operaciones: [
          { op: "cantidad", linea: 1, cantidad: 2 },
          { op: "nota", linea: 1, nota: "sin cebolla" },
          { op: "quitar", linea: 7 },
        ],
      });
      expect(json.carrito.lineas[0]).toMatchObject({
        cantidad: 2,
        nota: "sin cebolla",
        importe: 33,
      });
      expect(json.pendientes).toEqual([{ operacion: 3, motivo: "linea_no_existe" }]);
    });

    it("el carrito es de ese cliente y de ese número", async () => {
      expect((await getCart(canal.a, PHONE)).json.carrito.lineas).toHaveLength(1);
      expect((await getCart(canal.a, "+34611000099")).json.carrito).toBeNull();
      expect((await getCart(canal.cPlaya, PHONE)).json.carrito).toBeNull();
    });

    it("lo agotado en el local del número no se puede añadir", async () => {
      const { json } = await put(canal.cPlaya, {
        telefono: PHONE,
        operaciones: [{ op: "agregar", menu_item_id: 3202 }],
      });
      expect(json.pendientes[0]).toMatchObject({
        motivo: "producto_no_disponible",
        producto: "Croquetas",
      });
    });
  });

  describe("despacho y confirmación", () => {
    const PHONE = "+34611000002";

    beforeAll(async () => {
      await ctx.sql`
        INSERT INTO public.usuarios (restaurante_id, telefono, direccion_frecuente)
        VALUES (102, ${PHONE}, 'Dirección en B')
      `;
      await put(canal.a, {
        telefono: PHONE,
        operaciones: [
          {
            op: "agregar",
            menu_item_id: 1101,
            menu_variant_id: 1202,
            cantidad: 2,
            extras: [{ extra_id: 1301 }],
          },
        ],
      });
    });

    it("reparto sin dirección no se guarda", async () => {
      const { json } = await despacho(canal.a, {
        telefono: PHONE,
        tipo: "delivery",
        codigo_postal: "35500",
      });
      expect(json).toMatchObject({ disponible: false, motivo: "direccion_necesaria" });
      // El sistema envía estos botones: el cliente elige cómo dar la dirección antes de escribirla.
      expect(json.pregunta).toBeTruthy();
      expect(json.opciones).toMatchObject({
        tipo: "direccion",
        disponible: true,
        botones: [
          { id: "direccion:escribir", titulo: "Escribir dirección" },
          { id: "direccion:ubicacion", titulo: "Enviar ubicación" },
        ],
      });
    });

    it("reparto en zona: envío, mínimo y tiempo de la zona; dirección guardada solo en este restaurante", async () => {
      const { json } = await despacho(canal.a, {
        telefono: PHONE,
        tipo: "delivery",
        direccion: "Calle Real 10",
        codigo_postal: "35500",
      });
      expect(json.disponible).toBe(true);
      expect(json.carrito).toMatchObject({ subtotal: 33, envio: 2.5, total: 35.5 });
      expect(json.carrito.despacho).toMatchObject({
        tipo: "delivery",
        disponible: true,
        zona: "Arrecife centro",
        direccion: "Calle Real 10",
        minimo: 15,
        alcanza_minimo: true,
        tiempo_estimado: "30-40 min",
      });
      const rows = await ctx.sql<{ restaurante_id: number; direccion_frecuente: string }[]>`
        SELECT restaurante_id, direccion_frecuente FROM public.usuarios
        WHERE telefono = ${PHONE} ORDER BY restaurante_id
      `;
      expect(rows).toEqual([
        { restaurante_id: 101, direccion_frecuente: "Calle Real 10" },
        { restaurante_id: 102, direccion_frecuente: "Dirección en B" },
      ]);
    });

    it("fuera de cobertura lo dice y no cambia el despacho", async () => {
      const { json } = await despacho(canal.a, {
        telefono: PHONE,
        tipo: "delivery",
        direccion: "Otra calle 1",
        codigo_postal: "35009",
      });
      expect(json).toMatchObject({ disponible: false, motivo: "fuera_de_cobertura" });
      expect((await getCart(canal.a, PHONE)).json.carrito.despacho.direccion).toBe("Calle Real 10");
    });

    it("de reparto a recogida solo con confirmación expresa", async () => {
      const denied = await despacho(canal.a, { telefono: PHONE, tipo: "retiro" });
      expect(denied.status).toBe(409);
      expect(denied.json.reason).toBe("cambio_a_recogida_sin_confirmar");
      const { json } = await despacho(canal.a, {
        telefono: PHONE,
        tipo: "retiro",
        cambio_confirmado: true,
      });
      expect(json.carrito).toMatchObject({ envio: 0, total: 33 });
      expect(json.carrito.despacho).toMatchObject({ tipo: "retiro", direccion: null, minimo: 0 });
    });

    it("solo acepta formas de pago del restaurante", async () => {
      const { status, json } = await confirmar(canal.a, {
        telefono: PHONE,
        nombre: "Ana",
        metodo_pago: "bizum",
      });
      expect(status).toBe(422);
      expect(json).toMatchObject({
        error: "payment_method_not_accepted",
        accepted: ["efectivo", "tarjeta", "transferencia"],
      });
    });

    it("confirma con las reglas de la web: pedido por WhatsApp, pago pendiente si es transferencia", async () => {
      const { status, json } = await confirmar(canal.a, {
        telefono: PHONE,
        nombre: "Ana",
        metodo_pago: "transferencia",
      });
      expect(status).toBe(201);
      expect(json).toMatchObject({
        estado: "recibido",
        estado_pago: "pendiente",
        tipo_despacho: "retiro",
        subtotal: 33,
        costo_envio: 0,
        total: 33,
        metodo_pago: "transferencia",
      });
      expect(json.pedido_codigo).toBeTruthy();
      expect(json.seguimiento_url).toMatch(/^https:\/\/pedidos\.test\/prueba-a\/pedido\//);
      const [pedido] = await ctx.sql<{ restaurante_id: number; canal: string; telefono: string }[]>`
        SELECT restaurante_id, canal, telefono FROM public.pedidos
        WHERE pedido_codigo = ${json.pedido_codigo} AND restaurante_id = 101
      `;
      expect(pedido).toEqual({ restaurante_id: 101, canal: "whatsapp", telefono: PHONE });
    });

    it("tras confirmar el carrito queda cerrado: no se puede confirmar dos veces", async () => {
      expect((await getCart(canal.a, PHONE)).json.carrito).toBeNull();
      const again = await confirmar(canal.a, {
        telefono: PHONE,
        nombre: "Ana",
        metodo_pago: "efectivo",
      });
      expect(again.json.reason).toBe("carrito_vacio");
    });
  });

  describe("mínimo, caducidad y pedido nuevo", () => {
    const PHONE = "+34611000003";

    it("sin llegar al mínimo de reparto no se confirma y dice cuánto falta", async () => {
      await put(canal.a, {
        telefono: PHONE,
        operaciones: [{ op: "agregar", menu_item_id: 1101, menu_variant_id: 1201 }],
      });
      const quoted = await despacho(canal.a, {
        telefono: PHONE,
        tipo: "delivery",
        direccion: "Calle Real 10",
        zona_nombre: "arrecife centro",
      });
      expect(quoted.json.carrito.despacho).toMatchObject({
        alcanza_minimo: false,
        falta_para_minimo: 6,
      });
      const { status, json } = await confirmar(canal.a, {
        telefono: PHONE,
        nombre: "Luis",
        metodo_pago: "efectivo",
      });
      expect(status).toBe(422);
      expect(json).toMatchObject({ reason: "minimo_no_alcanzado", falta_para_minimo: 6 });
      // El carrito sigue en reparto: no se pasa a recogida sin que el cliente lo pida.
      expect((await getCart(canal.a, PHONE)).json.carrito.despacho.tipo).toBe("delivery");
    });

    it("«nuevo» descarta el carrito abierto y empieza otro", async () => {
      const { json } = await put(canal.a, {
        telefono: PHONE,
        nuevo: true,
        operaciones: [{ op: "agregar", menu_item_id: 1101, menu_variant_id: 1202 }],
      });
      expect(json.carrito.lineas).toHaveLength(1);
      expect(json.carrito.lineas[0].variante).toBe("Grande");
      expect(json.carrito.despacho).toBeNull();
    });

    it("caduca tras cart_expiry_minutes sin cambios", async () => {
      await ctx.sql`
        UPDATE public.agente_carrito SET updated_at = '2026-11-03T12:20:00Z'
        WHERE telefono = ${PHONE} AND estado = 'abierto'
      `;
      const { json } = await getCart(canal.a, PHONE);
      expect(json).toEqual({ carrito: null, carrito_anterior_caducado: true });
      const [row] = await ctx.sql<{ estado: string }[]>`
        SELECT estado FROM public.agente_carrito WHERE telefono = ${PHONE} ORDER BY id DESC LIMIT 1
      `;
      expect(row?.estado).toBe("caducado");
    });

    it("recogida en un número de local: ese local por defecto", async () => {
      const phone = "+34611000004";
      await put(canal.cPlaya, {
        telefono: phone,
        operaciones: [{ op: "agregar", menu_item_id: 3201 }],
      });
      const { json } = await despacho(canal.cPlaya, { telefono: phone, tipo: "retiro" });
      expect(json.carrito.despacho).toMatchObject({
        tipo: "retiro",
        local: { id: 3002, nombre: "Playa Honda" },
      });
    });
  });
});
