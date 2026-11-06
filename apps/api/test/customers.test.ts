import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { csvCell } from "../src/routes/panel-customers";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, path: string) {
  const response = await ctx.app.request(path, { headers: auth(user) });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // CSV
  }
  // biome-ignore lint/suspicious/noExplicitAny: respuestas de la API en las pruebas
  return { status: response.status, body: body as any, headers: response.headers };
}

async function placeOrder(
  slug: string,
  phone: string,
  name: string,
  items: unknown[],
  extra: Record<string, unknown> = {},
) {
  const response = await ctx.app.request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${Math.floor(Math.random() * 200)}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: name,
      telefono: phone,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items,
      ...extra,
    }),
  });
  if (response.status !== 201) throw new Error(await response.text());
}

describe("CSV", () => {
  it("neutraliza fórmulas y escapa separadores", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("Calle 1; bajo")).toBe('"Calle 1; bajo"');
    expect(csvCell(null)).toBe("");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("clientes del restaurante", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    const salchimaduro = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 2 }];
    await placeOrder("prueba-a", "+34600000201", "Marta", salchimaduro);
    await placeOrder("prueba-a", "+34600000201", "Marta", salchimaduro);
    await placeOrder("prueba-a", "+34600000202", "=Pedro", salchimaduro);
    const bocadillo = [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }];
    await placeOrder("prueba-c", "+34600000301", "Lucía", bocadillo, { sucursal_id: 3002 });
    const centro = (
      await ctx.sql<
        { id: number }[]
      >`SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal`
    )[0]?.id;
    await placeOrder("prueba-c", "+34600000302", "Andrés", bocadillo, { sucursal_id: centro });
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lista clientes con pedidos y gasto, y busca por nombre o teléfono", async () => {
    const result = await call("ownerA", "/panel/prueba-a/clientes?orden=pedidos");
    expect(result.status).toBe(200);
    expect(result.body.clientes[0]).toMatchObject({ nombre: "Marta", pedidos: 2, gastado: 38 }); // 2 × (18 € + 1 € de envases)
    expect(result.body.total).toBe(2);
    const search = await call("ownerA", "/panel/prueba-a/clientes?q=0202");
    expect(search.body.clientes.map((c: { nombre: string }) => c.nombre)).toEqual(["=Pedro"]);
    expect(result.body.clientes[0]).not.toHaveProperty("contexto");
  });

  it("muestra la ficha con historial y productos favoritos", async () => {
    const list = await call("ownerA", "/panel/prueba-a/clientes?q=Marta");
    const id = list.body.clientes[0].id;
    const detail = await call("ownerA", `/panel/prueba-a/clientes/${id}`);
    expect(detail.body.resumen).toMatchObject({ pedidos: 2, gastado: 38, ticket_medio: 19 });
    expect(detail.body.favoritos).toEqual([{ nombre: "Salchimaduro", cantidad: 4 }]);
    expect(detail.body.pedidos).toHaveLength(2);
    expect(detail.body.pedidos[0]).not.toHaveProperty("items");
  });

  it("no mezcla restaurantes", async () => {
    const list = await call("ownerA", "/panel/prueba-a/clientes?q=Marta");
    const id = list.body.clientes[0].id;
    expect((await call("ownerB", `/panel/prueba-b/clientes/${id}`)).status).toBe(404);
    expect((await call("ownerB", "/panel/prueba-b/clientes")).body.total).toBe(0);
    expect((await call("ownerB", "/panel/prueba-a/clientes")).status).toBe(403);
  });

  it("un usuario limitado a un local solo ve clientes de ese local", async () => {
    const result = await call("cashierPlaya", "/panel/prueba-c/clientes");
    expect(result.body.clientes.map((c: { nombre: string }) => c.nombre)).toEqual(["Lucía"]);
    const owner = await call("ownerC", "/panel/prueba-c/clientes?q=Andrés");
    const andres = owner.body.clientes[0].id;
    expect((await call("cashierPlaya", `/panel/prueba-c/clientes/${andres}`)).status).toBe(404);
  });

  it("exporta CSV solo con customers.export y deja rastro", async () => {
    expect((await call("cashierPlaya", "/panel/prueba-c/clientes/exportar")).status).toBe(403);
    const csv = await call("ownerA", "/panel/prueba-a/clientes/exportar");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.body).toContain(
      "nombre;telefono;direccion_frecuente;pedidos;gastado_eur;ultimo_pedido;acepta_promociones;bloqueado",
    );
    expect(csv.body).toContain("'=Pedro");
    // Sin consentimiento ni bloqueo: «No;No». Neutralización de fórmulas intacta.
    const pedro = String(csv.body)
      .split("\r\n")
      .find((line) => line.includes("'=Pedro"));
    expect(pedro?.endsWith(";No;No")).toBe(true);
    const trail =
      await ctx.sql`SELECT 1 FROM public.auditoria WHERE accion = 'customers.export' AND restaurante_id = 101`;
    expect(trail.length).toBe(1);
  });

  it("el CSV marca «Sí» en acepta_promociones y bloqueado", async () => {
    await ctx.sql`
      UPDATE public.usuarios SET acepta_promociones = true
      WHERE  restaurante_id = 101 AND telefono = '+34600000201'
    `;
    await ctx.sql`
      INSERT INTO public.cliente_bloqueado (restaurante_id, telefono)
      VALUES (101, public.fn_telefono_normalizado('+34600000202'))
    `;
    const csv = await call("ownerA", "/panel/prueba-a/clientes/exportar");
    const lines = String(csv.body).split("\r\n");
    expect(lines.find((line) => line.includes("+34600000201"))?.endsWith(";Sí;No")).toBe(true);
    expect(lines.find((line) => line.includes("+34600000202"))?.endsWith(";No;Sí")).toBe(true);
  });
});
