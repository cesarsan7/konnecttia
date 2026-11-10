import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isPushEndpoint,
  type PushPayload,
  type PushSender,
  type PushTarget,
} from "../src/lib/push";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe("endpoint de Web Push", () => {
  it("solo acepta https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("http://push.example/x")).toBe(false);
    expect(isPushEndpoint("javascript:alert(1)")).toBe(false);
    expect(isPushEndpoint("no url")).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("avisos push del tablero", () => {
  let ctx: TestContext;
  const sent: { target: PushTarget; payload: PushPayload }[] = [];
  let reply: "sent" | "gone" = "sent";
  const sender: PushSender = {
    publicKey: "BPublicKeyDeprueba".padEnd(60, "x"),
    send: async (target, payload) => {
      sent.push({ target, payload });
      return reply;
    },
  };
  const subscription = {
    endpoint: "https://push.example/endpoint-1",
    keys: { p256dh: "p256dh-clave-de-prueba", auth: "auth-clave-prueba" },
  };

  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  const app = () => ctx.appWith({ push: sender });
  const call = (user: "ownerA" | "viewerA" | "ownerB", method: string, body?: unknown) =>
    app().request("/panel/prueba-a/push", {
      method,
      headers: { ...auth(user), "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const order = (phone: string, canal?: string) =>
    app().request(canal ? "/panel/prueba-a/orders" : "/public/prueba-a/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200)}`,
        "Idempotency-Key": crypto.randomUUID(),
        ...(canal ? auth("ownerA") : {}),
      },
      body: JSON.stringify({
        nombre: "Lucía",
        telefono: phone,
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        email: "cliente@test.local",
        items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
      }),
    });

  it("sin claves VAPID no se ofrece y no se puede suscribir", async () => {
    const read = await ctx.app.request("/panel/prueba-a/push", { headers: auth("ownerA") });
    expect(((await read.json()) as Json).disponible).toBe(false);
    const post = await ctx.app.request("/panel/prueba-a/push", {
      method: "POST",
      headers: { ...auth("ownerA"), "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    expect(post.status).toBe(503);
  });

  it("solo el personal de ese restaurante se suscribe; rechaza endpoints no https", async () => {
    expect((await call("ownerB", "POST", subscription)).status).toBe(403);
    expect(
      (await call("ownerA", "POST", { ...subscription, endpoint: "http://push.example/x" })).status,
    ).toBe(400);
    expect((await call("ownerA", "POST", { endpoint: "https://x.example/1" })).status).toBe(400);
  });

  it("suscribe, avisa del pedido web nuevo y no avisa los pedidos del propio personal", async () => {
    expect((await call("ownerA", "POST", subscription)).status).toBe(201);
    expect(((await (await call("ownerA", "GET")).json()) as Json).suscrito).toBe(true);

    const placed = await order("+34600007001");
    expect(placed.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent.length).toBe(1);
    expect(sent[0]?.payload).toMatchObject({ title: "Pedido nuevo", url: "/panel/prueba-a" });
    expect(sent[0]?.target.endpoint).toBe(subscription.endpoint);
  });

  it("borra la suscripción cuando el servicio push dice que ya no existe", async () => {
    reply = "gone";
    await order("+34600007002");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const rows = await ctx.sql`SELECT 1 FROM public.push_suscripcion`;
    expect(rows.length).toBe(0);
  });

  it("darse de baja borra solo la suscripción propia", async () => {
    reply = "sent";
    await call("ownerA", "POST", subscription);
    expect((await call("viewerA", "DELETE", { endpoint: subscription.endpoint })).status).toBe(200);
    expect((await ctx.sql`SELECT 1 FROM public.push_suscripcion`).length).toBe(1);
    expect((await call("ownerA", "DELETE", { endpoint: subscription.endpoint })).status).toBe(200);
    expect((await ctx.sql`SELECT 1 FROM public.push_suscripcion`).length).toBe(0);
  });
});
