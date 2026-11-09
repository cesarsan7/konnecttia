import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GENERIC_PRIVACY_VERSION } from "../src/repositories/privacy";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

const salchimaduro = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];
const bocadillo = [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }];

/** Pedido por la web (público). Sin `consent`, no se envía ningún campo de privacidad. */
async function webOrder(
  slug: string,
  phone: string,
  extra: Record<string, unknown> = {},
  items: unknown[] = salchimaduro,
) {
  const response = await ctx.app.request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${Math.floor(Math.random() * 200)}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Marta Pérez",
      email: "marta@test.local",
      telefono: phone,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      items,
      ...extra,
    }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as any };
}

async function orderRow(trackingToken: string) {
  const [row] = await ctx.sql<
    {
      id: number;
      privacidad_aceptada_at: Date | null;
      privacidad_version: string | null;
      telefono: string;
    }[]
  >`
    SELECT id, privacidad_aceptada_at, privacidad_version, telefono
    FROM   public.pedidos WHERE tracking_token = ${trackingToken}::uuid
  `;
  if (!row) throw new Error("pedido no encontrado");
  return row;
}

async function customerId(restauranteId: number, phone: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.usuarios WHERE restaurante_id = ${restauranteId} AND telefono = ${phone}
  `;
  if (!row) throw new Error("cliente no encontrado");
  return row.id;
}

const closeOrders = (phone: string) =>
  ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE telefono = ${phone}`;

describe.skipIf(!TEST_DATABASE_URL)("tratamiento de datos", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("consentimiento en el pedido web", () => {
    it("sin aceptar la política no se crea el pedido (422 privacy_required)", async () => {
      const before = await ctx.sql`SELECT 1 FROM public.pedidos WHERE telefono = '+34600001001'`;
      for (const extra of [{}, { privacidad_aceptada: false }]) {
        const result = await webOrder("prueba-a", "+34600001001", extra);
        expect(result.status).toBe(422);
        expect(result.body).toMatchObject({
          error: "privacy_required",
          reason: "privacy_required",
        });
      }
      const after = await ctx.sql`SELECT 1 FROM public.pedidos WHERE telefono = '+34600001001'`;
      expect(after.length).toBe(before.length);
    });

    it("con la casilla marcada guarda cuándo y qué versión (la plantilla si no hay política propia)", async () => {
      const result = await webOrder("prueba-a", "+34600001002", { privacidad_aceptada: true });
      expect(result.status).toBe(201);
      const row = await orderRow(result.body.tracking_token);
      expect(row.privacidad_aceptada_at).toBeInstanceOf(Date);
      expect(row.privacidad_version).toBe(GENERIC_PRIVACY_VERSION);
    });

    it("guarda la versión configurada del restaurante y la expone con su URL", async () => {
      await ctx.sql`
        INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
        VALUES (101, 'privacidad_url', 'https://prueba-a.example/privacidad'),
               (101, 'privacidad_version', '2026-11')
      `;
      const result = await webOrder("prueba-a", "+34600001003", { privacidad_aceptada: true });
      expect(result.status).toBe(201);
      expect((await orderRow(result.body.tracking_token)).privacidad_version).toBe("2026-11");

      const menu = await ctx.app.request("/public/prueba-a/menu");
      expect(((await menu.json()) as { restaurante: object }).restaurante).toMatchObject({
        privacidad_url: "https://prueba-a.example/privacidad",
      });
      const page = await ctx.app.request("/public/prueba-a/privacidad");
      expect(await page.json()).toMatchObject({
        privacidad_url: "https://prueba-a.example/privacidad",
        version: "2026-11",
      });
      // Otro restaurante sigue sin política propia.
      const other = await ctx.app.request("/public/prueba-b/menu");
      expect(((await other.json()) as { restaurante: object }).restaurante).toMatchObject({
        privacidad_url: null,
      });
    });

    it("una URL de privacidad que no es http(s) se ignora", async () => {
      await ctx.sql`
        INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
        VALUES (102, 'privacidad_url', 'javascript:alert(1)')
      `;
      const page = await ctx.app.request("/public/prueba-b/privacidad");
      expect(await page.json()).toMatchObject({
        privacidad_url: null,
        version: GENERIC_PRIVACY_VERSION,
        restaurante: { nombre: expect.any(String) },
      });
    });

    it("la página genérica solo trae los datos que existen y no inventa nada fiscal", async () => {
      await ctx.sql`UPDATE public.restaurante SET direccion = NULL, telefono = '' WHERE id = 102`;
      const body = (await (await ctx.app.request("/public/prueba-b/privacidad")).json()) as {
        restaurante: Record<string, unknown>;
      };
      expect(body.restaurante).toEqual({
        nombre: expect.any(String),
        direccion: null,
        telefono: null,
      });
      expect(Object.keys(body.restaurante).sort()).toEqual(["direccion", "nombre", "telefono"]);
    });

    it("el pedido manual del panel no pide ni guarda el consentimiento", async () => {
      const manual = async (phone: string, extra: Record<string, unknown>) => {
        const response = await ctx.app.request("/panel/prueba-a/orders", {
          method: "POST",
          headers: {
            ...auth("ownerA"),
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            canal: "telefono",
            nombre: "Rosa",
            telefono: phone,
            tipo_despacho: "retiro",
            metodo_pago: "efectivo",
            items: salchimaduro,
            ...extra,
          }),
        });
        // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
        return { status: response.status, body: (await response.json()) as Record<string, any> };
      };
      // Sin ninguna casilla: se crea igual.
      const plain = await manual("+34600001004", {});
      expect(plain.status).toBe(201);
      // El personal no puede consentir por el cliente: aunque lo envíe, no se guarda.
      const sent = await manual("+34600001005", {
        privacidad_aceptada: true,
        acepta_promociones: true,
      });
      expect(sent.status).toBe(201);
      for (const [id, phone] of [
        [plain.body.id, "+34600001004"],
        [sent.body.id, "+34600001005"],
      ] as const) {
        const [row] = await ctx.sql<
          { privacidad_aceptada_at: Date | null; privacidad_version: string | null }[]
        >`
          SELECT privacidad_aceptada_at, privacidad_version FROM public.pedidos WHERE id = ${id}
        `;
        expect(row).toEqual({ privacidad_aceptada_at: null, privacidad_version: null });
        const [profile] = await ctx.sql<{ acepta_promociones: boolean | null }[]>`
          SELECT acepta_promociones FROM public.usuarios WHERE restaurante_id = 101 AND telefono = ${phone}
        `;
        expect(profile?.acepta_promociones).toBeNull();
      }
    });
  });

  describe("promociones", () => {
    it("guarda el último consentimiento dado o retirado, con su fecha", async () => {
      const phone = "+34600001010";
      await webOrder("prueba-a", phone, { privacidad_aceptada: true, acepta_promociones: true });
      const id = await customerId(101, phone);
      const read = async () =>
        (
          await ctx.sql<{ acepta_promociones: boolean | null; at: Date | null }[]>`
            SELECT acepta_promociones, acepta_promociones_at AS at
            FROM public.usuarios WHERE id = ${id}
          `
        )[0];
      const given = await read();
      expect(given?.acepta_promociones).toBe(true);
      expect(given?.at).toBeInstanceOf(Date);

      // Mismo valor en otro pedido: la fecha del consentimiento no se mueve.
      await ctx.sql`
        UPDATE public.usuarios SET acepta_promociones_at = '2026-01-01 10:00'::text::timestamptz WHERE id = ${id}
      `;
      await webOrder("prueba-a", phone, { privacidad_aceptada: true, acepta_promociones: true });
      expect((await read())?.at?.toISOString()).toBe("2026-01-01T10:00:00.000Z");

      // Casilla sin marcar en el siguiente pedido: se retira y cambia la fecha.
      await webOrder("prueba-a", phone, { privacidad_aceptada: true });
      const withdrawn = await read();
      expect(withdrawn?.acepta_promociones).toBe(false);
      expect(withdrawn?.at?.toISOString()).not.toBe("2026-01-01T10:00:00.000Z");
    });

    it("la ficha del cliente muestra si acepta promociones", async () => {
      await webOrder("prueba-a", "+34600001011", {
        privacidad_aceptada: true,
        acepta_promociones: true,
      });
      const id = await customerId(101, "+34600001011");
      const detail = await call("ownerA", "GET", `/panel/prueba-a/clientes/${id}`);
      expect(detail.body.cliente).toMatchObject({ acepta_promociones: true });
      expect(detail.body.cliente.acepta_promociones_at).toEqual(expect.any(String));
    });
  });

  describe("borrar datos del cliente", () => {
    const phone = "+34600001020";

    it("anonimiza perfil y pedidos, conserva importes y deja rastro sin datos personales", async () => {
      const placed = await webOrder("prueba-a", phone, {
        privacidad_aceptada: true,
        acepta_promociones: true,
        nombre_pedido: "Marta (cumple)",
        notas: "Portal azul, llamar a Marta",
        items: [{ ...salchimaduro[0], nota: "para Marta, sin cebolla" }],
      });
      expect(placed.status).toBe(201);
      const id = await customerId(101, phone);
      await ctx.sql`
        UPDATE public.usuarios
        SET direccion_frecuente = 'Calle Mayor 1', lat_frecuente = 28.9, long_frecuente = -13.5,
            contexto = 'le gusta la masa fina'
        WHERE id = ${id}
      `;
      await ctx.sql`
        UPDATE public.pedidos
        SET direccion = 'Calle Mayor 1', lat = 28.9, lng = -13.5, chatwoot_conversation_id = '777',
            session_id = '101_777'
        WHERE telefono = ${phone}
      `;
      await ctx.sql`
        INSERT INTO public.contexto (telefono, contexto, "timestamp", restaurante_id)
        VALUES (${phone}, 'resumen del chat', '2026-11-01 10:00'::text::timestamp, 101)
      `;
      await ctx.sql`
        INSERT INTO public.n8n_chat_histories (session_id, message, restaurante_id)
        VALUES ('101_777', '{"content":"hola soy Marta"}'::jsonb, 101)
      `;
      const [before] = await ctx.sql<{ total: string; created_at: Date }[]>`
        SELECT total, created_at FROM public.pedidos WHERE telefono = ${phone}
      `;

      // Con un pedido sin cerrar no se puede borrar.
      const blocked = await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.reason).toBe("open_orders");
      await closeOrders(phone);

      const result = await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}`);
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ ok: true, pedidos_anonimizados: 1 });

      const [profile] = await ctx.sql<
        {
          nombre: string | null;
          telefono: string;
          direccion_frecuente: string | null;
          lat_frecuente: string | null;
          contexto: string | null;
          acepta_promociones: boolean;
          anonimizado_at: Date | null;
        }[]
      >`SELECT * FROM public.usuarios WHERE id = ${id}`;
      expect(profile).toMatchObject({
        nombre: null,
        telefono: `anonimizado-${id}`,
        direccion_frecuente: null,
        lat_frecuente: null,
        contexto: null,
        acepta_promociones: false,
      });
      expect(profile?.anonimizado_at).toBeInstanceOf(Date);

      const [order] = await ctx.sql<
        {
          telefono: string;
          nombre_pedido: string | null;
          direccion: string | null;
          lat: string | null;
          notas: unknown;
          items: { nota?: string; item_name: string }[];
          total: string;
          created_at: Date;
          session_id: string;
          chatwoot_conversation_id: string | null;
        }[]
      >`SELECT * FROM public.pedidos WHERE usuario_id = ${id}`;
      expect(order).toMatchObject({
        telefono: "",
        nombre_pedido: null,
        direccion: null,
        lat: null,
        notas: null,
        chatwoot_conversation_id: null,
      });
      expect(order?.session_id).toMatch(/^anonimizado-/);
      expect(order?.items[0]?.item_name).toBe("Salchimaduro");
      expect(order?.items[0]).not.toHaveProperty("nota");
      expect(order?.total).toBe(before?.total);
      expect(order?.created_at.toISOString()).toBe(before?.created_at.toISOString());

      expect(
        await ctx.sql`SELECT 1 FROM public.contexto WHERE restaurante_id = 101 AND telefono = ${phone}`,
      ).toHaveLength(0);
      expect(
        await ctx.sql`SELECT 1 FROM public.n8n_chat_histories WHERE session_id = '101_777'`,
      ).toHaveLength(0);

      // Auditoría: queda la acción, nunca el teléfono ni el nombre.
      const trail = await ctx.sql<{ detalle: unknown }[]>`
        SELECT detalle FROM public.auditoria
        WHERE accion = 'customers.delete' AND recurso_id = ${String(id)} AND restaurante_id = 101
      `;
      expect(trail).toHaveLength(1);
      expect(JSON.stringify(trail[0]?.detalle)).not.toMatch(/Marta|600001020/);

      // Ya no aparece en la lista ni en la ficha, ni se puede borrar otra vez.
      const list = await call("ownerA", "GET", "/panel/prueba-a/clientes?q=Marta");
      expect(list.body.clientes.map((c: { id: number }) => c.id)).not.toContain(id);
      expect((await call("ownerA", "GET", `/panel/prueba-a/clientes/${id}`)).status).toBe(404);
      expect((await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}`)).status).toBe(404);
    });

    it("si el cliente vuelve a pedir con el mismo teléfono se crea un perfil nuevo", async () => {
      const again = await webOrder("prueba-a", phone, { privacidad_aceptada: true });
      expect(again.status).toBe(201);
      const [profile] = await ctx.sql<{ anonimizado_at: Date | null; nombre: string }[]>`
        SELECT anonimizado_at, nombre FROM public.usuarios
        WHERE restaurante_id = 101 AND telefono = ${phone}
      `;
      expect(profile).toMatchObject({ anonimizado_at: null, nombre: "Marta Pérez" });
    });

    it("exige el permiso customers.delete y no cruza restaurantes", async () => {
      await webOrder("prueba-a", "+34600001021", { privacidad_aceptada: true });
      await closeOrders("+34600001021");
      const id = await customerId(101, "+34600001021");
      // Consulta no ve ni borra clientes.
      expect((await call("viewerA", "DELETE", `/panel/prueba-a/clientes/${id}`)).status).toBe(403);
      // Un miembro de otro restaurante no entra; con su propio slug no encuentra al cliente.
      expect((await call("ownerB", "DELETE", `/panel/prueba-a/clientes/${id}`)).status).toBe(403);
      expect((await call("ownerB", "DELETE", `/panel/prueba-b/clientes/${id}`)).status).toBe(404);
      // Sigue intacto.
      const [profile] = await ctx.sql<{ nombre: string | null }[]>`
        SELECT nombre FROM public.usuarios WHERE id = ${id}
      `;
      expect(profile?.nombre).toBe("Marta Pérez");
      expect((await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}`)).status).toBe(200);
      expect((await call("ownerA", "DELETE", "/panel/prueba-a/clientes/abc")).status).toBe(400);
    });

    it("el personal con acceso solo a clientes (sin borrar) no puede borrar", async () => {
      await webOrder(
        "prueba-c",
        "+34600001030",
        { privacidad_aceptada: true, sucursal_id: 3002 },
        bocadillo,
      );
      await closeOrders("+34600001030");
      const id = await customerId(103, "+34600001030");
      // cashierPlaya (Personal) puede ver clientes, pero no tiene customers.delete.
      expect((await call("cashierPlaya", "GET", `/panel/prueba-c/clientes/${id}`)).status).toBe(
        200,
      );
      expect((await call("cashierPlaya", "DELETE", `/panel/prueba-c/clientes/${id}`)).status).toBe(
        403,
      );
    });

    it("un encargado limitado a un local solo borra clientes cuyos pedidos están en su alcance", async () => {
      const [centro] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
      `;
      // Solo en Playa Honda (su local): puede.
      await webOrder(
        "prueba-c",
        "+34600001031",
        { privacidad_aceptada: true, sucursal_id: 3002 },
        bocadillo,
      );
      // Solo en el local principal: para él no existe.
      await webOrder(
        "prueba-c",
        "+34600001032",
        { privacidad_aceptada: true, sucursal_id: centro?.id },
        bocadillo,
      );
      // En los dos locales: borrarlo afectaría a pedidos que no gestiona.
      await webOrder(
        "prueba-c",
        "+34600001033",
        { privacidad_aceptada: true, sucursal_id: 3002 },
        bocadillo,
      );
      await webOrder(
        "prueba-c",
        "+34600001033",
        { privacidad_aceptada: true, sucursal_id: centro?.id },
        bocadillo,
      );
      for (const phone of ["+34600001031", "+34600001032", "+34600001033"])
        await closeOrders(phone);

      const own = await customerId(103, "+34600001031");
      const elsewhere = await customerId(103, "+34600001032");
      const both = await customerId(103, "+34600001033");

      expect(
        (await call("managerPlaya", "DELETE", `/panel/prueba-c/clientes/${elsewhere}`)).status,
      ).toBe(404);
      const shared = await call("managerPlaya", "DELETE", `/panel/prueba-c/clientes/${both}`);
      expect(shared.status).toBe(403);
      expect(shared.body.reason).toBe("customer_out_of_scope");
      expect((await call("managerPlaya", "DELETE", `/panel/prueba-c/clientes/${own}`)).status).toBe(
        200,
      );

      // Los no borrados siguen con sus datos; el propietario sí puede borrar el compartido.
      const rows = await ctx.sql<{ id: number; nombre: string | null }[]>`
        SELECT id, nombre FROM public.usuarios WHERE id IN ${ctx.sql([elsewhere, both, own])}
      `;
      const byId = new Map(rows.map((row) => [row.id, row.nombre]));
      expect(byId.get(elsewhere)).toBe("Marta Pérez");
      expect(byId.get(both)).toBe("Marta Pérez");
      expect(byId.get(own)).toBeNull();
      expect((await call("ownerC", "DELETE", `/panel/prueba-c/clientes/${both}`)).status).toBe(200);
    });
  });
});
