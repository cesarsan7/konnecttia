import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let seq = 0;
const items = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function webOrder() {
  seq += 1;
  const telefono = `+3460000${String(6000 + seq)}`;
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${190 + seq}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Marta Pérez",
      email: "marta@example.com",
      telefono,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items,
    }),
  });
  const body = (await response.json()) as Json;
  expect(response.status).toBe(201);
  return { token: body.tracking_token as string, telefono };
}

async function report(token: string, body: unknown) {
  const response = await ctx.app.request(`/public/orders/${token}/incidencias`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

async function track(token: string) {
  const response = await ctx.app.request(`/public/orders/${token}`);
  return (await response.json()) as Json;
}

async function panel(
  user: keyof typeof import("./harness").USERS,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await ctx.app.request(path, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

describe.skipIf(!TEST_DATABASE_URL)("incidencias del cliente (pieza P)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("el cliente abre una incidencia y el local la ve, con el aviso en el tablero", async () => {
    const { token } = await webOrder();
    expect((await track(token)).puedeReportar).toBe(true);

    const created = await report(token, { tipo: "falta_algo", descripcion: "Falta la bebida" });
    expect(created.status).toBe(201);
    expect((await track(token)).incidenciasAbiertas).toBe(1);

    const list = await panel("ownerA", "GET", "/panel/prueba-a/incidencias?estado=abierta");
    expect(list.status).toBe(200);
    const mine = list.body.incidencias.find((i: Json) => i.descripcion === "Falta la bebida");
    expect(mine).toMatchObject({ tipo: "falta_algo", estado: "abierta" });
    expect(list.body.abiertas).toBeGreaterThanOrEqual(1);

    const board = await panel("ownerA", "GET", "/panel/prueba-a/orders?vista=tablero");
    expect(board.body.pedidos.some((p: Json) => p.incidencias_abiertas > 0)).toBe(true);
  });

  it("valida el tipo y el texto", async () => {
    const { token } = await webOrder();
    expect((await report(token, { tipo: "inventado", descripcion: "Algo raro" })).status).toBe(400);
    expect((await report(token, { tipo: "otro", descripcion: "  " })).status).toBe(400);
    expect((await report(token, { tipo: "otro", descripcion: "x".repeat(1001) })).status).toBe(400);
    expect((await report("no-es-token", { tipo: "otro", descripcion: "Hola" })).status).toBe(404);
    expect((await report(crypto.randomUUID(), { tipo: "otro", descripcion: "Hola" })).status).toBe(
      404,
    );
  });

  it("limita las incidencias abiertas por pedido y no admite pedidos cancelados", async () => {
    const { token } = await webOrder();
    for (let n = 1; n <= 3; n += 1) {
      expect(
        (await report(token, { tipo: "retraso", descripcion: `Tarda mucho ${n}` })).status,
      ).toBe(201);
    }
    const fourth = await report(token, { tipo: "retraso", descripcion: "Otra más" });
    expect(fourth.status).toBe(429);
    expect(fourth.body.reason).toBe("too_many_open");
    expect((await track(token)).puedeReportar).toBe(false);

    const second = await webOrder();
    await ctx.sql`UPDATE public.pedidos SET estado = 'cancelado' WHERE tracking_token = ${second.token}::uuid`;
    const rejected = await report(second.token, { tipo: "otro", descripcion: "Ya cancelado" });
    expect(rejected.status).toBe(409);
    expect(rejected.body.reason).toBe("order_not_reportable");
  });

  it("el local la resuelve con una nota, la reabre y queda en la auditoría", async () => {
    const { token } = await webOrder();
    await report(token, { tipo: "llego_mal", descripcion: "Llegó frío" });
    const [row] = await ctx.sql<{ id: number }[]>`
      SELECT i.id FROM public.pedido_incidencia i JOIN public.pedidos p ON p.id = i.pedido_id
      WHERE  p.tracking_token = ${token}::uuid
    `;
    const id = row?.id;

    expect(
      (await panel("viewerA", "PATCH", `/panel/prueba-a/incidencias/${id}`, { estado: "resuelta" }))
        .status,
    ).toBe(403);

    const done = await panel("ownerA", "PATCH", `/panel/prueba-a/incidencias/${id}`, {
      estado: "resuelta",
      nota: "Se ofreció un descuento",
    });
    expect(done.status).toBe(200);
    const resolved = await panel("ownerA", "GET", "/panel/prueba-a/incidencias?estado=resuelta");
    expect(resolved.body.incidencias.find((i: Json) => i.id === id)).toMatchObject({
      estado: "resuelta",
      nota_resolucion: "Se ofreció un descuento",
      resuelta_por: "owner-a@test.local",
    });

    const reopened = await panel("ownerA", "PATCH", `/panel/prueba-a/incidencias/${id}`, {
      estado: "abierta",
    });
    expect(reopened.status).toBe(200);
    const [audit] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.auditoria
      WHERE  recurso_tipo = 'pedido_incidencia' AND recurso_id = ${String(id)}
    `;
    expect(audit?.n).toBe(2);
  });

  it("un restaurante no ve ni toca las incidencias de otro", async () => {
    const { token } = await webOrder();
    await report(token, { tipo: "otro", descripcion: "Solo para el local A" });
    const other = await panel("ownerB", "GET", "/panel/prueba-b/incidencias");
    expect(other.status).toBe(200);
    expect(other.body.incidencias.some((i: Json) => i.descripcion === "Solo para el local A")).toBe(
      false,
    );
    const [row] = await ctx.sql<{ id: number }[]>`
      SELECT i.id FROM public.pedido_incidencia i WHERE i.descripcion = 'Solo para el local A'
    `;
    const cross = await panel("ownerB", "PATCH", `/panel/prueba-b/incidencias/${row?.id}`, {
      estado: "resuelta",
    });
    expect(cross.status).toBe(404);
  });

  it("borrar los datos del cliente vacía el texto de sus incidencias", async () => {
    const { token, telefono } = await webOrder();
    await report(token, { tipo: "otro", descripcion: "Mi dirección es Calle Falsa 123" });
    await ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE tracking_token = ${token}::uuid`;
    const [user] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.usuarios WHERE restaurante_id = 101 AND telefono = ${telefono}
    `;
    expect((await panel("ownerA", "DELETE", `/panel/prueba-a/clientes/${user?.id}`)).status).toBe(
      200,
    );
    const [after] = await ctx.sql<{ descripcion: string }[]>`
      SELECT i.descripcion FROM public.pedido_incidencia i
      JOIN   public.pedidos p ON p.id = i.pedido_id
      WHERE  p.tracking_token = ${token}::uuid
    `;
    expect(after?.descripcion).toBe("");
  });
});
