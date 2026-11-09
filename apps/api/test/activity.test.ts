import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, path: string) {
  const response = await ctx.app.request(path, { method: "GET", headers: auth(user) });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const WINDOW = `desde=${day(-2)}&hasta=${day(2)}`;

describe.skipIf(!TEST_DATABASE_URL)("actividad de repartidores y meseros", () => {
  let centro = 0;
  let playaDriver = 0; // otherPerson (d2), solo Playa Honda
  let anyDriver = 0; // newcomer (d1), todos los locales
  let ana = 0; // mesero con usuario del panel = playaDriver
  let luis = 0; // mesero sin usuario
  const orders: Record<string, number> = {};
  const idOf = (code: string) => orders[code] ?? 0;

  beforeAll(async () => {
    ctx = await setupTestApp();
    centro =
      (
        await ctx.sql<{ id: number }[]>`
          SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
        `
      )[0]?.id ?? 0;
    const members = await ctx.sql<{ id: number; user_id: string }[]>`
      INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre) VALUES
        ('00000000-0000-0000-0000-0000000000d2', 103, 'viewer', 'otra@test.local', 'Otra'),
        ('00000000-0000-0000-0000-0000000000d1', 103, 'viewer', 'nuevo@test.local', 'Nuevo')
      RETURNING id::int AS id, user_id::text AS user_id
    `;
    playaDriver = members.find((m) => m.user_id.endsWith("d2"))?.id ?? 0;
    anyDriver = members.find((m) => m.user_id.endsWith("d1"))?.id ?? 0;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id)
      SELECT m, (SELECT id FROM public.rol WHERE code = 'driver' AND restaurante_id IS NULL)
      FROM unnest(${[playaDriver, anyDriver]}::bigint[]) AS m
    `;
    await ctx.sql`INSERT INTO public.membresia_sucursal (membership_id, sucursal_id) VALUES (${playaDriver}, 3002)`;

    const order = async (
      code: string,
      tipo: string,
      estado: string,
      local: number,
      pago: string,
      total: number,
      mesero: number | null = null,
    ) => {
      const [row] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, sucursal_id,
                                    telefono, total, estado_pago, metodo_pago, direccion, mesero_id,
                                    mesa_numero)
        VALUES (103, ${code}, ${estado}, ${tipo}, ${local}, '+34600000001', ${total}, ${pago},
                'efectivo', 'Calle Real 1', ${mesero}, ${mesero === null ? null : "4"})
        RETURNING id
      `;
      orders[code] = row?.id ?? 0;
    };
    await order("E-1", "delivery", "entregado", centro, "pagado", 20);
    await order("E-2", "delivery", "en_camino", 3002, "pendiente", 30);

    await ctx.sql`
      INSERT INTO public.pedido_reparto
        (pedido_id, restaurante_id, membership_id, asignado_por, asignado_at, salida_at, entregado_at)
      VALUES
        (${idOf("E-1")}, 103, ${anyDriver}, 'owner-c@test.local',
         now() - interval '40 minutes', now() - interval '30 minutes', now() - interval '10 minutes'),
        (${idOf("E-2")}, 103, ${playaDriver}, 'owner-c@test.local',
         now() - interval '15 minutes', now() - interval '5 minutes', NULL)
    `;
    await ctx.sql`
      INSERT INTO public.pedido_foto_entrega (pedido_id, restaurante_id, membership_id, ruta, tipo_mime, bytes)
      VALUES (${idOf("E-1")}, 103, ${anyDriver}, 'entregas/103/x/a.jpg', 'image/jpeg', 1000)
    `;
    await ctx.sql`
      INSERT INTO public.pedido_estado_log (pedido_id, restaurante_id, estado_anterior, estado_nuevo, origen, actor)
      VALUES (${idOf("E-1")}, 103, 'en_camino', 'entregado', 'reparto', 'nuevo@test.local')
    `;

    const waiters = await ctx.sql<{ id: number; nombre: string }[]>`
      INSERT INTO public.meseros (restaurante_id, nombre, sucursal_id, membership_id) VALUES
        (103, 'Ana', 3002, ${playaDriver}),
        (103, 'Luis', ${centro}, NULL)
      RETURNING id, nombre
    `;
    ana = waiters.find((w) => w.nombre === "Ana")?.id ?? 0;
    luis = waiters.find((w) => w.nombre === "Luis")?.id ?? 0;
    await order("M-1", "mesa", "entregado", 3002, "pagado", 15, ana);
    await order("M-2", "mesa", "cancelado", 3002, "no_aplica", 10, ana);
    await order("M-3", "mesa", "entregado", centro, "pagado", 40, luis);
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  const driver = (user: User, id: number, query = WINDOW) =>
    call(user, `/panel/prueba-c/actividad/repartidor/${id}?${query}`);
  const waiter = (user: User, id: number, query = WINDOW) =>
    call(user, `/panel/prueba-c/actividad/mesero/${id}?${query}`);

  it("la ficha del repartidor resume repartos, tiempos y fotos", async () => {
    const result = await driver("ownerC", anyDriver);
    expect(result.status).toBe(200);
    expect(result.body.persona).toMatchObject({ membership_id: anyDriver, nombre: "Nuevo" });
    expect(result.body.resumen).toMatchObject({
      repartos: 1,
      entregados: 1,
      en_curso: 0,
      importe_entregado: 20,
      por_cobrar: 0,
      min_hasta_salida: 10,
      min_en_ruta: 20,
    });
    expect(result.body.repartos[0]).toMatchObject({
      pedido_codigo: "E-1",
      asignado_por: "owner-c@test.local",
      fotos_entrega: 1,
    });
    const other = await driver("ownerC", playaDriver);
    expect(other.body.resumen).toMatchObject({ repartos: 1, en_curso: 1, por_cobrar: 30 });
  });

  it("filtra por fechas y local, y valida los parámetros", async () => {
    expect(
      (await driver("ownerC", anyDriver, "desde=2020-01-01&hasta=2020-01-02")).body.resumen,
    ).toMatchObject({ repartos: 0 });
    expect(
      (await driver("ownerC", anyDriver, `${WINDOW}&sucursal_id=3002`)).body.resumen,
    ).toMatchObject({ repartos: 0 });
    expect(
      (await driver("ownerC", anyDriver, `${WINDOW}&sucursal_id=${centro}`)).body.resumen,
    ).toMatchObject({ repartos: 1 });
    // Sin fechas: últimos 7 días.
    expect((await driver("ownerC", anyDriver, "")).body.resumen.repartos).toBe(1);
    expect((await driver("ownerC", anyDriver, "desde=hoy&hasta=mañana")).status).toBe(400);
    expect((await driver("ownerC", anyDriver, "desde=2026-02-31&hasta=2026-03-01")).status).toBe(
      400,
    );
    expect((await driver("ownerC", anyDriver, `${WINDOW}&sucursal_id=abc`)).status).toBe(400);
  });

  it("cada repartidor ve solo lo suyo; un local ajeno o un usuario externo, nada", async () => {
    expect((await driver("newcomer", anyDriver)).status).toBe(200);
    expect((await driver("newcomer", playaDriver)).status).toBe(404);
    expect((await driver("otherPerson", playaDriver)).status).toBe(200);
    expect((await driver("otherPerson", anyDriver)).status).toBe(404);
    // Otro restaurante: no es miembro.
    expect((await driver("ownerB", anyDriver)).status).toBe(403);
    // Persona inexistente.
    expect((await driver("ownerC", 999999)).status).toBe(404);
  });

  it("el cajero de Playa Honda solo ve repartos de su local", async () => {
    expect((await driver("cashierPlaya", playaDriver)).body.resumen.repartos).toBe(1);
    const centroDriver = await driver("cashierPlaya", anyDriver);
    expect(centroDriver.status).toBe(200);
    expect(centroDriver.body.resumen.repartos).toBe(0);
    expect(centroDriver.body.repartos).toEqual([]);
  });

  it("la ficha del mesero cuenta ventas, mesas y cancelaciones", async () => {
    const result = await waiter("ownerC", ana);
    expect(result.status).toBe(200);
    expect(result.body.persona).toMatchObject({ id: ana, nombre: "Ana" });
    expect(result.body.resumen).toEqual({ pedidos: 1, mesas: 1, importe: 15, cancelados: 1 });
    expect(result.body.pedidos).toHaveLength(2);
    expect((await waiter("ownerC", luis)).body.resumen).toMatchObject({ pedidos: 1, importe: 40 });
  });

  it("el mesero ve solo lo suyo", async () => {
    // Ana es el usuario d2.
    expect((await waiter("otherPerson", ana)).status).toBe(200);
    expect((await waiter("otherPerson", luis)).status).toBe(404);
    expect((await waiter("newcomer", ana)).status).toBe(404);
  });

  it("lista las personas visibles según quién pregunta", async () => {
    const owner = await call("ownerC", "/panel/prueba-c/actividad/personas");
    expect(owner.body.repartidores.map((d: { membership_id: number }) => d.membership_id)).toEqual(
      expect.arrayContaining([playaDriver, anyDriver]),
    );
    expect(owner.body.meseros.map((w: { nombre: string }) => w.nombre)).toEqual(["Ana", "Luis"]);
    const self = await call("otherPerson", "/panel/prueba-c/actividad/personas");
    expect(self.body.repartidores.map((d: { membership_id: number }) => d.membership_id)).toEqual([
      playaDriver,
    ]);
    expect(self.body.meseros.map((w: { nombre: string }) => w.nombre)).toEqual(["Ana"]);
    expect((await call("ownerB", "/panel/prueba-c/actividad/personas")).status).toBe(403);
  });

  it("dice quién llevó o atendió un pedido y su historial", async () => {
    const result = await call("ownerC", `/panel/prueba-c/actividad/pedido/${idOf("E-1")}`);
    expect(result.status).toBe(200);
    expect(result.body.pedido).toMatchObject({ codigo: "E-1", estado: "entregado" });
    expect(result.body.repartidor).toMatchObject({
      membership_id: anyDriver,
      nombre: "Nuevo",
      asignado_por: "owner-c@test.local",
      fotos_entrega: 1,
    });
    expect(result.body.historial).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ origen: "reparto", actor: "nuevo@test.local" }),
      ]),
    );
    const table = await call("ownerC", `/panel/prueba-c/actividad/pedido/${idOf("M-1")}`);
    expect(table.body.mesero).toMatchObject({ id: ana, nombre: "Ana", mesa: "4" });
    expect(table.body.repartidor).toBeNull();

    // Repartidor: solo sus pedidos. Cajero de Playa: solo los de su local.
    expect((await call("newcomer", `/panel/prueba-c/actividad/pedido/${idOf("E-1")}`)).status).toBe(
      200,
    );
    expect(
      (await call("otherPerson", `/panel/prueba-c/actividad/pedido/${idOf("E-1")}`)).status,
    ).toBe(404);
    expect(
      (await call("cashierPlaya", `/panel/prueba-c/actividad/pedido/${idOf("E-1")}`)).status,
    ).toBe(404);
    expect(
      (await call("cashierPlaya", `/panel/prueba-c/actividad/pedido/${idOf("E-2")}`)).status,
    ).toBe(200);
    expect((await call("ownerC", "/panel/prueba-c/actividad/pedido/999999")).status).toBe(404);
  });
});
