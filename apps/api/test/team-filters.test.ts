import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function get(user: User, path: string) {
  const response = await ctx.app.request(path, { headers: auth(user) });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const list = (user: User, query: string) => get(user, `/panel/prueba-c/orders/historial?${query}`);
const overview = (user: User, query = "") =>
  get(user, `/panel/prueba-c/reports/overview?desde=2026-11-03&hasta=2026-11-03${query}`);

const codes = (body: Record<string, unknown>) =>
  (body.pedidos as { pedido_codigo: string }[]).map((order) => order.pedido_codigo).sort();

// biome-ignore lint/suspicious/noExplicitAny: filas JSON
const byCode = (body: Record<string, any>, code: string) =>
  body.pedidos.find((order: { pedido_codigo: string }) => order.pedido_codigo === code);

describe.skipIf(!TEST_DATABASE_URL)("filtros y estadísticas por mesero y repartidor", () => {
  let centro = 0;
  let ana = 0;
  let luis = 0;
  let rayo = 0;
  let sinNombre = 0;

  beforeAll(async () => {
    ctx = await setupTestApp();
    centro =
      (
        await ctx.sql<{ id: number }[]>`
          SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
        `
      )[0]?.id ?? 0;

    const waiters = await ctx.sql<{ id: number; nombre: string }[]>`
      INSERT INTO public.meseros (restaurante_id, nombre, activo, sucursal_id)
      VALUES (103, 'Ana', true, ${centro}), (103, 'Luis', true, 3002)
      RETURNING id::int AS id, nombre
    `;
    ana = waiters.find((w) => w.nombre === "Ana")?.id ?? 0;
    luis = waiters.find((w) => w.nombre === "Luis")?.id ?? 0;
    // Un mesero de otro restaurante: filtrar por su id en el restaurante C no devuelve nada.
    await ctx.sql`INSERT INTO public.meseros (restaurante_id, nombre, activo) VALUES (101, 'Ajeno', true)`;

    const members = await ctx.sql<{ id: number; email: string }[]>`
      INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre, apodo) VALUES
        ('00000000-0000-0000-0000-00000000aa01', 103, 'viewer', 'rayo@test.local', 'Raúl', 'Rayo'),
        ('00000000-0000-0000-0000-00000000aa02', 103, 'viewer', 'sinnombre@test.local', NULL, NULL)
      RETURNING id::int AS id, email
    `;
    rayo = members.find((m) => m.email === "rayo@test.local")?.id ?? 0;
    sinNombre = members.find((m) => m.email === "sinnombre@test.local")?.id ?? 0;

    // Un usuario que solo ve estadísticas (sin mesas ni reparto) y el cajero de Playa Honda con
    // estadísticas añadidas, pero sin ver el equipo.
    const [soloStats] = await ctx.sql<{ id: number }[]>`
      INSERT INTO public.rol (restaurante_id, code, nombre) VALUES (103, 'solo_stats', 'Solo estadísticas')
      RETURNING id
    `;
    await ctx.sql`
      INSERT INTO public.rol_permiso (rol_id, permiso_code) VALUES (${soloStats?.id ?? 0}, 'analytics.view')
    `;
    const [analyst] = await ctx.sql<{ id: number }[]>`
      INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email)
      VALUES ('00000000-0000-0000-0000-0000000000d1', 103, 'viewer', 'nuevo@test.local')
      RETURNING id::int AS id
    `;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${analyst?.id ?? 0}, ${soloStats?.id ?? 0})
    `;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id)
      SELECT m.id, ${soloStats?.id ?? 0} FROM public.local_memberships m
      WHERE m.restaurante_id = 103 AND m.user_id = '00000000-0000-0000-0000-0000000000c2'
    `;

    // código, tipo, estado, local, total, mesero, repartidor, salida, entrega (UTC, 3/11/2026)
    const orders: [
      string,
      string,
      string,
      number,
      number,
      number | null,
      number | null,
      string | null,
      string | null,
    ][] = [
      ["M-1", "mesa", "entregado", centro, 20, ana, null, null, null],
      ["M-2", "mesa", "entregado", centro, 40, ana, null, null, null],
      ["M-3", "mesa", "cancelado", centro, 99, ana, null, null, null],
      ["M-4", "mesa", "entregado", 3002, 30, luis, null, null, null],
      ["D-1", "delivery", "entregado", centro, 25, null, rayo, "12:00", "12:20"],
      ["D-2", "delivery", "entregado", 3002, 15, null, rayo, "13:00", "13:40"],
      ["D-3", "delivery", "entregado", 3002, 10, null, sinNombre, null, "14:00"],
      ["D-4", "delivery", "en_camino", centro, 12, null, rayo, "15:00", null],
      ["W-1", "retiro", "entregado", centro, 8, null, null, null, null],
    ];
    for (const [code, tipo, estado, local, total, mesero, driver, salida, entrega] of orders) {
      const [order] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, canal,
                                    estado_pago, metodo_pago, total, sucursal_id, telefono,
                                    mesero_id, created_at, updated_at)
        VALUES (103, ${code}, ${estado}, ${tipo}, 'mostrador', 'no_aplica', 'efectivo', ${total},
                ${local}, '+34600000001', ${mesero}, '2026-11-03 11:00'::text::timestamp,
                '2026-11-03 11:00'::text::timestamp)
        RETURNING id::int AS id
      `;
      if (driver !== null) {
        await ctx.sql`
          INSERT INTO public.pedido_reparto (pedido_id, restaurante_id, membership_id, repartidor_email,
                                             asignado_por, salida_at, entregado_at)
          VALUES (${order?.id ?? 0}, 103, ${driver}, 'copia@test.local', 'test',
                  ${salida === null ? null : `2026-11-03 ${salida}`}::text::timestamptz,
                  ${entrega === null ? null : `2026-11-03 ${entrega}`}::text::timestamptz)
        `;
      }
    }
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("historial", () => {
    it("filtra por mesero y por repartidor", async () => {
      expect(codes((await list("ownerC", `mesero=${ana}`)).body)).toEqual(["M-1", "M-2", "M-3"]);
      expect(codes((await list("ownerC", `mesero=${luis}`)).body)).toEqual(["M-4"]);
      expect(codes((await list("ownerC", `repartidor=${rayo}`)).body)).toEqual([
        "D-1",
        "D-2",
        "D-4",
      ]);
      expect(codes((await list("ownerC", `repartidor=${sinNombre}`)).body)).toEqual(["D-3"]);
      // Se combinan con el resto de filtros.
      expect(
        codes((await list("ownerC", `repartidor=${rayo}&estado=entregado&local=3002`)).body),
      ).toEqual(["D-2"]);
      expect(codes((await list("ownerC", `mesero=${ana}&repartidor=${rayo}`)).body)).toEqual([]);
    });

    it("un id sin pedidos o de otro restaurante no devuelve nada", async () => {
      const foreign = (
        await ctx.sql<{ id: number }[]>`
          SELECT id::int AS id FROM public.meseros WHERE nombre = 'Ajeno'
        `
      )[0]?.id;
      const other = await list("ownerC", `mesero=${foreign}`);
      expect(other.status).toBe(200);
      expect(other.body.total).toBe(0);
      expect((await list("ownerC", "repartidor=999999")).body.total).toBe(0);
    });

    it("rechaza ids que no son enteros positivos", async () => {
      for (const query of [
        "mesero=abc",
        "mesero=0",
        "mesero=-1",
        "mesero=1.5",
        "mesero=1;drop",
        "repartidor=abc",
        "repartidor=0",
        "repartidor=-3",
        "repartidor=2e3",
        "repartidor=99999999999999999999",
      ]) {
        expect((await list("ownerC", query)).status, query).toBe(400);
      }
      // Vacío = sin filtro.
      expect((await list("ownerC", "mesero=&repartidor=")).body.total).toBe(9);
    });

    it("devuelve mesero y repartidor de cada pedido, y el email solo a quien ve el equipo", async () => {
      const owner = await list("ownerC", "");
      expect(byCode(owner.body, "M-1")).toMatchObject({ mesero_id: ana, mesero_nombre: "Ana" });
      expect(byCode(owner.body, "D-1")).toMatchObject({
        repartidor_id: rayo,
        repartidor_nombre: "Rayo",
        repartidor_email: "copia@test.local",
      });
      expect(byCode(owner.body, "D-3")).toMatchObject({
        repartidor_id: sinNombre,
        repartidor_nombre: null,
      });
      // El cajero de Playa Honda no ve el equipo: sin email, con el nombre.
      const cashier = await list("cashierPlaya", "");
      expect(byCode(cashier.body, "D-2")).toMatchObject({
        repartidor_nombre: "Rayo",
        repartidor_email: null,
      });
    });

    it("respeta los locales del usuario", async () => {
      // Ana solo atiende en el centro: el cajero de Playa Honda no ve sus pedidos.
      expect(codes((await list("cashierPlaya", `mesero=${ana}`)).body)).toEqual([]);
      expect(codes((await list("cashierPlaya", `mesero=${luis}`)).body)).toEqual(["M-4"]);
      // De los repartos de Rayo solo ve el de su local.
      expect(codes((await list("cashierPlaya", `repartidor=${rayo}`)).body)).toEqual(["D-2"]);
      expect((await list("cashierPlaya", `repartidor=${rayo}&local=${centro}`)).status).toBe(403);
    });
  });

  describe("estadísticas", () => {
    it("agrupa por mesero: pedidos, importe y ticket medio, sin cancelados", async () => {
      const { status, body } = await overview("ownerC");
      expect(status).toBe(200);
      expect(body.meseros).toEqual([
        { mesero_id: ana, mesero: "Ana", pedidos: 2, ventas: 60, ticket_medio: 30 },
        { mesero_id: luis, mesero: "Luis", pedidos: 1, ventas: 30, ticket_medio: 30 },
      ]);
    });

    it("agrupa por repartidor: solo entregados, con el tiempo medio de salida a entrega", async () => {
      const { body } = await overview("ownerC");
      expect(body.repartidores).toEqual([
        {
          membership_id: rayo,
          nombre: "Rayo",
          email: "rayo@test.local",
          repartos: 2,
          ventas: 40,
          // 20 min y 40 min.
          minutos_medios: 30,
        },
        {
          membership_id: sinNombre,
          nombre: null,
          email: "sinnombre@test.local",
          repartos: 1,
          ventas: 10,
          // Sin hora de salida no hay tiempo.
          minutos_medios: null,
        },
      ]);
    });

    it("respeta el filtro de local y el periodo", async () => {
      const playa = await overview("ownerC", "&local=3002");
      expect(playa.body.meseros.map((row: { mesero: string }) => row.mesero)).toEqual(["Luis"]);
      expect(playa.body.repartidores).toEqual([
        expect.objectContaining({
          membership_id: rayo,
          repartos: 1,
          ventas: 15,
          minutos_medios: 40,
        }),
        expect.objectContaining({ membership_id: sinNombre, repartos: 1 }),
      ]);
      const empty = await get(
        "ownerC",
        "/panel/prueba-c/reports/overview?desde=2026-11-01&hasta=2026-11-02",
      );
      expect(empty.body.meseros).toEqual([]);
      expect(empty.body.repartidores).toEqual([]);
    });

    it("un usuario limitado a un local solo ve lo de su local, sin emails si no ve el equipo", async () => {
      const { status, body } = await overview("cashierPlaya");
      expect(status).toBe(200);
      expect(body.meseros.map((row: { mesero: string }) => row.mesero)).toEqual(["Luis"]);
      expect(body.repartidores).toHaveLength(2);
      for (const row of body.repartidores) expect(row.email).toBeNull();
      expect(body.repartidores[0]).toMatchObject({ nombre: "Rayo", repartos: 1 });
    });

    it("sin permiso de mesas ni de reparto los bloques salen vacíos", async () => {
      const { status, body } = await overview("newcomer");
      expect(status).toBe(200);
      expect(body.resumen.pedidos).toBeGreaterThan(0);
      expect(body.meseros).toEqual([]);
      expect(body.repartidores).toEqual([]);
    });

    it("otro restaurante no ve datos del C", async () => {
      const response = await ctx.app.request(
        "/panel/prueba-a/reports/overview?desde=2026-11-03&hasta=2026-11-03",
        { headers: auth("ownerA") },
      );
      const body = (await response.json()) as { meseros: unknown[]; repartidores: unknown[] };
      expect(body.meseros).toEqual([]);
      expect(body.repartidores).toEqual([]);
    });
  });
});
