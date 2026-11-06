import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function roleId(code: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.rol WHERE code = ${code} AND restaurante_id IS NULL
  `;
  return row?.id ?? 0;
}

/** Miembro de «prueba-c» (restaurante 103) con ese email. */
async function memberByEmail(email: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id::int AS id FROM public.local_memberships
    WHERE  restaurante_id = 103 AND email = ${email}
  `;
  return row?.id ?? 0;
}

/** Miembro de «prueba-c» (restaurante 103) de ese usuario. */
async function memberByUser(userId: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id::int AS id FROM public.local_memberships
    WHERE  restaurante_id = 103 AND user_id = ${userId}::uuid
  `;
  return row?.id ?? 0;
}

describe.skipIf(!TEST_DATABASE_URL)("nombre y apodo del equipo", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("al aceptar una invitación el nombre es obligatorio y el apodo opcional", async () => {
    const created = await call("ownerC", "POST", "/panel/prueba-c/equipo/invitaciones", {
      email: "nuevo@test.local",
      rol_id: await roleId("driver"),
      sucursal_ids: [],
    });
    const token = created.body.token as string;
    const accept = (body?: unknown) =>
      call("newcomer", "POST", `/me/invitaciones/${token}/aceptar`, body);

    // Sin cuerpo (cliente antiguo), con el nombre en blanco o ausente: 400 y la invitación sigue viva.
    for (const body of [undefined, {}, { nombre: "   " }, { apodo: "Nu" }]) {
      expect(await accept(body)).toMatchObject({ status: 400, body: { reason: "name_required" } });
    }
    const tooLong = await accept({ nombre: "x".repeat(81) });
    expect(tooLong).toMatchObject({ status: 400, body: { field: "nombre" } });
    expect((await call("newcomer", "GET", `/me/invitaciones/${token}`)).body.estado).toBe("valida");

    expect((await accept({ nombre: "  Nuria Nueva ", apodo: "  " })).status).toBe(200);
    const [row] = await ctx.sql<{ nombre: string; apodo: string | null }[]>`
      SELECT nombre, apodo FROM public.local_memberships
      WHERE  restaurante_id = 103 AND email = 'nuevo@test.local'
    `;
    expect(row).toEqual({ nombre: "Nuria Nueva", apodo: null });

    // Una invitación ya usada sigue respondiendo 409 aunque no lleve nombre.
    const used = await call("newcomer", "POST", `/me/invitaciones/${token}/aceptar`);
    expect(used).toMatchObject({ status: 409, body: { reason: "usada" } });
  });

  it("el acceso devuelve nombre, apodo y `mostrar` (apodo antes que nombre)", async () => {
    const before = await call("newcomer", "GET", "/panel/prueba-c/acceso");
    expect(before.body.usuario).toEqual({
      email: "nuevo@test.local",
      nombre: "Nuria Nueva",
      apodo: null,
      mostrar: "Nuria Nueva",
    });
    const saved = await call("newcomer", "PUT", "/panel/prueba-c/me/perfil", {
      nombre: "Nuria Nueva",
      apodo: " Nu ",
    });
    expect(saved).toMatchObject({ status: 200, body: { apodo: "Nu", mostrar: "Nu" } });
    expect((await call("newcomer", "GET", "/panel/prueba-c/acceso")).body.usuario).toMatchObject({
      nombre: "Nuria Nueva",
      apodo: "Nu",
      mostrar: "Nu",
    });
    // Quitar el apodo vuelve al nombre.
    const cleared = await call("newcomer", "PUT", "/panel/prueba-c/me/perfil", {
      nombre: "Nuria Nueva",
      apodo: null,
    });
    expect(cleared.body.mostrar).toBe("Nuria Nueva");
  });

  it("los miembros antiguos no tienen nombre: `mostrar` es null", async () => {
    const access = await call("ownerC", "GET", "/panel/prueba-c/acceso");
    expect(access.body.usuario).toMatchObject({ nombre: null, apodo: null, mostrar: null });
  });

  it("valida el perfil propio y no lo deja a quien no es miembro", async () => {
    const put = (body: unknown) => call("newcomer", "PUT", "/panel/prueba-c/me/perfil", body);
    expect((await put({ nombre: "" })).status).toBe(400);
    expect((await put({ apodo: "Solo apodo" })).status).toBe(400);
    expect((await put({ nombre: "x".repeat(81) })).status).toBe(400);
    expect((await put({ nombre: "Ok", apodo: "y".repeat(81) })).status).toBe(400);
    // Sin ser miembro de ese restaurante no hay perfil que editar.
    expect(
      (await call("ownerB", "PUT", "/panel/prueba-c/me/perfil", { nombre: "Intruso" })).status,
    ).toBe(403);
  });

  it("quien gestiona el equipo edita el nombre de otros; el resto no", async () => {
    const nuria = await memberByEmail("nuevo@test.local");
    const path = `/panel/prueba-c/equipo/miembros/${nuria}/perfil`;

    const edited = await call("ownerC", "PUT", path, { nombre: "Nuria N.", apodo: "Nurita" });
    expect(edited).toMatchObject({ status: 200, body: { mostrar: "Nurita" } });
    const list = await call("ownerC", "GET", "/panel/prueba-c/equipo");
    expect(list.body.miembros).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: "nuevo@test.local",
          nombre: "Nuria N.",
          apodo: "Nurita",
          mostrar: "Nurita",
        }),
        expect.objectContaining({ eres_tu: true, nombre: null, mostrar: null }),
      ]),
    );
    const trail = await ctx.sql`
      SELECT 1 FROM public.auditoria
      WHERE  accion = 'team.profile' AND recurso_id = ${String(nuria)} AND detalle->>'propio' = 'false'
    `;
    expect(trail.length).toBe(1);

    // El encargado ve el equipo pero no lo gestiona; el Personal ni lo ve; otro restaurante, tampoco.
    expect((await call("managerPlaya", "PUT", path, { nombre: "X" })).status).toBe(403);
    expect((await call("cashierPlaya", "PUT", path, { nombre: "X" })).status).toBe(403);
    expect((await call("ownerB", "PUT", path, { nombre: "X" })).status).toBe(403);
    const foreign = `/panel/prueba-b/equipo/miembros/${nuria}/perfil`;
    expect((await call("ownerB", "PUT", foreign, { nombre: "X" })).status).toBe(404);
    expect((await call("ownerC", "PUT", path, { nombre: "" })).status).toBe(400);
  });

  it("quien gestiona solo algunos locales no edita a miembros de otros", async () => {
    const nuria = await memberByEmail("nuevo@test.local");
    await ctx.sql`
      INSERT INTO public.membresia_sucursal (membership_id, sucursal_id) VALUES (${nuria}, 3002)
    `;
    // Un rol propio con gestión del equipo, asignado al cajero de Playa Honda (solo ese local).
    const cashier = await memberByUser("00000000-0000-0000-0000-0000000000c2");
    const [role] = await ctx.sql<{ id: number }[]>`
      INSERT INTO public.rol (restaurante_id, code, nombre)
      VALUES (103, 'jefe_playa', 'Jefe de Playa') RETURNING id
    `;
    await ctx.sql`
      INSERT INTO public.rol_permiso (rol_id, permiso_code)
      VALUES (${role?.id ?? 0}, 'team.view'), (${role?.id ?? 0}, 'team.manage')
    `;
    await ctx.sql`DELETE FROM public.membresia_rol WHERE membership_id = ${cashier}`;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${cashier}, ${role?.id ?? 0})
    `;

    // Nuria está solo en Playa Honda: la edita. El propietario (todos los locales), no.
    const own = await call(
      "cashierPlaya",
      "PUT",
      `/panel/prueba-c/equipo/miembros/${nuria}/perfil`,
      { nombre: "Nuria P." },
    );
    expect(own.status).toBe(200);
    const owner = await memberByUser("00000000-0000-0000-0000-0000000000c1");
    const other = await call(
      "cashierPlaya",
      "PUT",
      `/panel/prueba-c/equipo/miembros/${owner}/perfil`,
      { nombre: "Jefe" },
    );
    expect(other.status).toBe(404);

    // Se devuelve al cajero su rol de Personal para las pruebas siguientes.
    await ctx.sql`DELETE FROM public.membresia_rol WHERE membership_id = ${cashier}`;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${cashier}, ${await roleId("staff")})
    `;
  });

  describe("el email solo lo ve quien ve el equipo", () => {
    let driver = 0;
    let orderId = 0;

    beforeAll(async () => {
      const [created] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre, apodo)
        VALUES ('00000000-0000-0000-0000-0000000000d2', 103, 'viewer', 'otra@test.local',
                'Olga Otra', 'Olguita')
        RETURNING id::int AS id
      `;
      driver = created?.id ?? 0;
      await ctx.sql`
        INSERT INTO public.membresia_rol (membership_id, rol_id)
        VALUES (${driver}, ${await roleId("driver")})
      `;
      const [order] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, sucursal_id,
                                    telefono, total, estado_pago, metodo_pago, direccion)
        VALUES (103, 'N-1', 'listo', 'delivery', 3002, '+34600000001', 20, 'no_aplica', 'efectivo',
                'Calle Real 1')
        RETURNING id
      `;
      orderId = order?.id ?? 0;
      // Mesero enlazado al mismo miembro.
      await ctx.sql`
        INSERT INTO public.meseros (nombre, restaurante_id, sucursal_id, membership_id)
        VALUES ('Olga (sala)', 103, 3002, ${driver})
      `;
    });

    it("repartidores: el nombre para todos, el email solo con team.view", async () => {
      const owner = await call("ownerC", "GET", "/panel/prueba-c/repartidores");
      expect(owner.body.repartidores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: "otra@test.local", nombre_mostrar: "Olguita" }),
        ]),
      );
      // El Personal asigna repartos pero no ve el equipo.
      const staff = await call("cashierPlaya", "GET", "/panel/prueba-c/repartidores");
      expect(staff.body.repartidores).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: null, nombre_mostrar: "Olguita" }),
        ]),
      );
      expect(
        staff.body.repartidores.every((row: { email: string | null }) => row.email === null),
      ).toBe(true);
    });

    it("asignar devuelve el nombre y el tablero lo muestra sin email al Personal", async () => {
      const assign = await call(
        "cashierPlaya",
        "PUT",
        `/panel/prueba-c/orders/${orderId}/repartidor`,
        { membership_id: driver },
      );
      expect(assign).toMatchObject({
        status: 200,
        body: { repartidor: { nombre_mostrar: "Olguita", email: null } },
      });
      const find = (rows: { id: number }[]) => rows.find((row) => row.id === orderId);
      const staffBoard = await call("cashierPlaya", "GET", "/panel/prueba-c/orders?vista=tablero");
      expect(find(staffBoard.body.pedidos)).toMatchObject({
        repartidor_nombre: "Olguita",
        repartidor_email: null,
      });
      const ownerBoard = await call("ownerC", "GET", "/panel/prueba-c/orders?vista=tablero");
      expect(find(ownerBoard.body.pedidos)).toMatchObject({
        repartidor_nombre: "Olguita",
        repartidor_email: "otra@test.local",
      });
    });

    it("meseros enlazados: nombre del miembro para todos, email solo con team.view", async () => {
      const waiter = (rows: { nombre: string }[]) =>
        rows.find((row) => row.nombre === "Olga (sala)");
      const owner = await call("ownerC", "GET", "/panel/prueba-c/mesas/meseros");
      expect(waiter(owner.body.meseros)).toMatchObject({
        email: "otra@test.local",
        nombre_mostrar: "Olguita",
      });
      const staff = await call("cashierPlaya", "GET", "/panel/prueba-c/mesas/meseros");
      expect(waiter(staff.body.meseros)).toMatchObject({ email: null, nombre_mostrar: "Olguita" });
    });
  });
});
