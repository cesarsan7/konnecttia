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

describe.skipIf(!TEST_DATABASE_URL)("repartidores", () => {
  let centro = 0;
  let playaDriver = 0;
  let anyDriver = 0;
  const orders: Record<string, number> = {};

  beforeAll(async () => {
    ctx = await setupTestApp();
    centro =
      (
        await ctx.sql<{ id: number }[]>`
          SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
        `
      )[0]?.id ?? 0;
    // Dos repartidores: «otra» solo en Playa Honda y «nuevo» en todos los locales.
    const members = await ctx.sql<{ id: number; user_id: string }[]>`
      INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email) VALUES
        ('00000000-0000-0000-0000-0000000000d2', 103, 'viewer', 'otra@test.local'),
        ('00000000-0000-0000-0000-0000000000d1', 103, 'viewer', 'nuevo@test.local')
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
    for (const [code, tipo, estado, local, pago] of [
      ["R-1", "delivery", "listo", 3002, "no_aplica"],
      ["R-2", "delivery", "en_preparacion", centro, "no_aplica"],
      ["R-3", "retiro", "listo", 3002, "no_aplica"],
      ["R-4", "delivery", "listo", 3002, "pendiente"],
    ] as const) {
      const [row] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, sucursal_id,
                                    telefono, total, estado_pago, metodo_pago, direccion)
        VALUES (103, ${code}, ${estado}, ${tipo}, ${local}, '+34600000001', 20, ${pago},
                ${pago === "pendiente" ? "transferencia" : "efectivo"}, 'Calle Real 1')
        RETURNING id
      `;
      orders[code] = row?.id ?? 0;
    }
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lista los repartidores que puede asignar cada usuario", async () => {
    const owner = await call("ownerC", "GET", "/panel/prueba-c/repartidores");
    expect(owner.status).toBe(200);
    const emails = owner.body.repartidores.map((d: { email: string }) => d.email);
    expect(emails).toEqual(expect.arrayContaining(["otra@test.local", "nuevo@test.local"]));
    expect(
      owner.body.repartidores.find((d: { email: string }) => d.email === "otra@test.local").locales,
    ).toEqual([3002]);
    // El repartidor no asigna.
    expect((await call("otherPerson", "GET", "/panel/prueba-c/repartidores")).status).toBe(403);
  });

  it("asigna solo pedidos de reparto en marcha a quien reparte en ese local", async () => {
    const assign = (code: string, membership: number | null, user: User = "ownerC") =>
      call(user, "PUT", `/panel/prueba-c/orders/${orders[code]}/repartidor`, {
        membership_id: membership,
      });
    expect((await assign("R-1", playaDriver)).status).toBe(200);
    expect((await assign("R-3", playaDriver)).body.reason).toBe("not_delivery");
    // «otra» no reparte en el Centro; «nuevo» sí.
    expect((await assign("R-2", playaDriver)).body.reason).toBe("not_a_driver");
    expect((await assign("R-2", anyDriver)).status).toBe(200);
    // El cajero (Personal, Playa Honda) puede asignar en su local, no en el Centro.
    expect((await assign("R-4", playaDriver, "cashierPlaya")).status).toBe(200);
    expect((await assign("R-2", null, "cashierPlaya")).status).toBe(404);
    // Un miembro sin el permiso de repartir no es repartidor.
    const [cashier] = await ctx.sql<{ id: number }[]>`
      SELECT id::int AS id FROM public.local_memberships WHERE user_id = '00000000-0000-0000-0000-0000000000c2'
    `;
    expect((await assign("R-1", cashier?.id ?? 0)).body.reason).toBe("not_a_driver");

    const board = await call("ownerC", "GET", "/panel/prueba-c/orders?vista=tablero");
    const r1 = board.body.pedidos.find((p: { id: number }) => p.id === orders["R-1"]);
    expect(r1).toMatchObject({ repartidor_id: playaDriver, repartidor_email: "otra@test.local" });
  });

  it("el repartidor solo ve y entrega sus repartos, con trazabilidad", async () => {
    const mine = await call("otherPerson", "GET", "/panel/prueba-c/mis-repartos");
    expect(mine.status).toBe(200);
    expect(mine.body.repartos.map((r: { pedido_codigo: string }) => r.pedido_codigo)).toEqual([
      "R-1",
      "R-4",
    ]);
    // No puede tocar un pedido de otro repartidor ni usar el tablero.
    expect(
      (await call("otherPerson", "POST", `/panel/prueba-c/mis-repartos/${orders["R-2"]}/salida`))
        .status,
    ).toBe(404);
    expect((await call("otherPerson", "GET", "/panel/prueba-c/orders?vista=tablero")).status).toBe(
      403,
    );
    expect(
      (
        await call("otherPerson", "PATCH", `/panel/prueba-c/orders/${orders["R-1"]}/status`, {
          estado: "entregado",
        })
      ).status,
    ).toBe(403);

    expect(
      (await call("otherPerson", "POST", `/panel/prueba-c/mis-repartos/${orders["R-1"]}/salida`))
        .status,
    ).toBe(200);
    expect(
      (await call("otherPerson", "POST", `/panel/prueba-c/mis-repartos/${orders["R-1"]}/entregado`))
        .status,
    ).toBe(200);
    // Con el cobro pendiente (transferencia) no se entrega.
    const pending = await call(
      "otherPerson",
      "POST",
      `/panel/prueba-c/mis-repartos/${orders["R-4"]}/entregado`,
    );
    expect(pending.status).toBe(422);

    const [trace] = await ctx.sql<
      { salida_at: Date | null; entregado_at: Date | null; asignado_por: string }[]
    >`
      SELECT salida_at, entregado_at, asignado_por FROM public.pedido_reparto WHERE pedido_id = ${orders["R-1"] ?? 0}
    `;
    expect(trace?.salida_at).not.toBeNull();
    expect(trace?.entregado_at).not.toBeNull();
    expect(trace?.asignado_por).toBe("owner-c@test.local");
    const log = await ctx.sql<{ estado_nuevo: string; origen: string; actor: string }[]>`
      SELECT estado_nuevo, origen, actor FROM public.pedido_estado_log WHERE pedido_id = ${orders["R-1"] ?? 0} ORDER BY id
    `;
    expect(log).toEqual([
      { estado_nuevo: "en_camino", origen: "reparto", actor: "otra@test.local" },
      { estado_nuevo: "entregado", origen: "reparto", actor: "otra@test.local" },
    ]);
    // El entregado de hoy sigue en su lista, al final.
    const after = await call("otherPerson", "GET", "/panel/prueba-c/mis-repartos");
    expect(after.body.repartos.map((r: { pedido_codigo: string }) => r.pedido_codigo)).toEqual([
      "R-4",
      "R-1",
    ]);
    // Ya entregado: no se reasigna.
    expect(
      (
        await call("ownerC", "PUT", `/panel/prueba-c/orders/${orders["R-1"]}/repartidor`, {
          membership_id: anyDriver,
        })
      ).body.reason,
    ).toBe("order_closed");
  });
});
