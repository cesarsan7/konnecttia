import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { maskEmail } from "../src/lib/customer-email";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

const items = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];
let phoneSeq = 0;

/** Pedido por la web (público). `email` solo se envía si se pasa. */
async function webOrder(extra: Record<string, unknown> = {}) {
  phoneSeq += 1;
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `203.0.113.${100 + phoneSeq}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Marta Pérez",
      telefono: `+3460000${String(2000 + phoneSeq)}`,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      items,
      ...extra,
    }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function track(token: string) {
  const response = await ctx.app.request(`/public/orders/${token}`);
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function patchEmail(token: string, body: unknown) {
  const response = await ctx.app.request(`/public/orders/${token}/email`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function orderIdByToken(token: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.pedidos WHERE tracking_token = ${token}::uuid
  `;
  if (!row) throw new Error("pedido no encontrado");
  return row.id;
}

describe("maskEmail", () => {
  it("deja la primera letra y el dominio", () => {
    expect(maskEmail("marta@gmail.com")).toBe("m***@gmail.com");
    expect(maskEmail("sin-arroba")).toBe("***");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("email del cliente en el pedido web", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("el checkout web exige el email y rechaza uno mal escrito", async () => {
    const missing = await webOrder();
    expect(missing.status).toBe(400);
    expect(missing.body.issues).toEqual([{ path: "email", message: "required" }]);

    for (const email of ["", "marta", "marta@", "marta@dominio", "a b@c.com"]) {
      const result = await webOrder({ email });
      expect(result.status).toBe(400);
    }
    const count = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.pedidos WHERE email_cliente IS NOT NULL`;
    expect(count[0]?.n).toBe(0);
  });

  it("guarda el email limpio (sin espacios y en minúsculas) y lo pone en el evento del outbox", async () => {
    const result = await webOrder({ email: "  Marta.Perez@Ejemplo.COM " });
    expect(result.status).toBe(201);
    const id = await orderIdByToken(result.body.tracking_token);
    const [row] = await ctx.sql<{ email_cliente: string | null }[]>`
      SELECT email_cliente FROM public.pedidos WHERE id = ${id}`;
    expect(row?.email_cliente).toBe("marta.perez@ejemplo.com");
    const [event] = await ctx.sql<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM public.outbox_evento
      WHERE agregado_id = ${String(id)} AND tipo = 'pedido.recibido'`;
    expect(event?.payload).toMatchObject({ email_cliente: "marta.perez@ejemplo.com" });
  });

  it("los cambios de estado también llevan el email para que el worker avise al cliente", async () => {
    const result = await webOrder({ email: "avisos@ejemplo.com" });
    const id = await orderIdByToken(result.body.tracking_token);
    const response = await ctx.app.request(`/panel/prueba-a/orders/${id}/status`, {
      method: "PATCH",
      headers: { ...auth("ownerA"), "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "confirmado" }),
    });
    expect(response.status).toBe(200);
    const [event] = await ctx.sql<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM public.outbox_evento
      WHERE agregado_id = ${String(id)} AND tipo = 'pedido.estado_cambiado'`;
    expect(event?.payload).toMatchObject({
      hacia: "confirmado",
      email_cliente: "avisos@ejemplo.com",
    });
  });

  it("el seguimiento muestra el email enmascarado y permite corregirlo", async () => {
    const result = await webOrder({ email: "equivocado@ejemplo.com" });
    const token = result.body.tracking_token as string;
    const before = await track(token);
    expect(before.body.emailAvisos).toBe("e***@ejemplo.com");
    expect(before.body.emailEditable).toBe(true);
    expect(JSON.stringify(before.body)).not.toContain("equivocado@");

    const fixed = await patchEmail(token, { email: " Correcto@Ejemplo.com " });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toEqual({ ok: true, email_avisos: "c***@ejemplo.com" });
    const id = await orderIdByToken(token);
    const [row] = await ctx.sql<{ email_cliente: string }[]>`
      SELECT email_cliente FROM public.pedidos WHERE id = ${id}`;
    expect(row?.email_cliente).toBe("correcto@ejemplo.com");
  });

  it("corregir el email valida el formato, el token y que el pedido siga abierto", async () => {
    const result = await webOrder({ email: "uno@ejemplo.com" });
    const token = result.body.tracking_token as string;
    expect((await patchEmail(token, { email: "no-es-un-email" })).status).toBe(400);
    expect((await patchEmail(token, {})).status).toBe(400);
    expect((await patchEmail("no-es-un-uuid", { email: "a@b.com" })).status).toBe(404);
    expect(
      (await patchEmail("00000000-0000-4000-8000-000000000000", { email: "a@b.com" })).status,
    ).toBe(404);

    await ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE tracking_token = ${token}::uuid`;
    expect((await patchEmail(token, { email: "tarde@ejemplo.com" })).status).toBe(409);
    expect((await track(token)).body.emailEditable).toBe(false);
  });

  it("borrar los datos del cliente quita el email del pedido y del outbox", async () => {
    const phone = "+34600003999";
    const result = await webOrder({ email: "borrar@ejemplo.com", telefono: phone });
    const token = result.body.tracking_token as string;
    const id = await orderIdByToken(token);
    await ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE id = ${id}`;
    const [customer] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.usuarios WHERE restaurante_id = 101 AND telefono = ${phone}`;
    const erase = await ctx.app.request(`/panel/prueba-a/clientes/${customer?.id}`, {
      method: "DELETE",
      headers: auth("ownerA"),
    });
    expect(erase.status, await erase.clone().text()).toBe(200);

    const [row] = await ctx.sql<{ email_cliente: string | null }[]>`
      SELECT email_cliente FROM public.pedidos WHERE id = ${id}`;
    expect(row?.email_cliente).toBeNull();
    const events = await ctx.sql<{ payload: Record<string, unknown> }[]>`
      SELECT payload FROM public.outbox_evento WHERE agregado_id = ${String(id)}`;
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) expect(event.payload).not.toHaveProperty("email_cliente");
    expect((await patchEmail(token, { email: "otra@ejemplo.com" })).status).toBe(409);
  });

  it("el pedido manual del panel sigue sin pedir email", async () => {
    const response = await ctx.app.request("/panel/prueba-a/orders", {
      method: "POST",
      headers: {
        ...auth("ownerA"),
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        nombre: "Cliente de mostrador",
        canal: "mostrador",
        telefono: "+34600004001",
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        items,
      }),
    });
    expect(response.status, await response.clone().text()).toBe(201);
  });
});
