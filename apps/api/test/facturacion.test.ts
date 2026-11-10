import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StripeClient } from "../src/lib/stripe";
import { verifyStripeSignature } from "../src/lib/stripe";
import { stateFromStripe } from "../src/repositories/subscriptions";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

const SECRET = "whsec_test_secret_for_unit_tests";
const sign = (payload: string, ts: number, secret = SECRET) =>
  `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex")}`;

describe("firma del webhook de Stripe", () => {
  const now = 1_800_000_000;
  const body = '{"id":"evt_1"}';

  it("acepta una firma válida y reciente", () => {
    expect(verifyStripeSignature(body, sign(body, now), SECRET, now)).toBe(true);
  });

  it("rechaza cuerpo alterado, secreto ajeno, cabecera ausente y firma antigua", () => {
    expect(verifyStripeSignature(`${body} `, sign(body, now), SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now, "otro_secreto_distinto"), SECRET, now)).toBe(
      false,
    );
    expect(verifyStripeSignature(body, undefined, SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, "t=1,v1=zz", SECRET, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, now - 301), SECRET, now)).toBe(false);
  });

  it("traduce los estados de Stripe", () => {
    expect(stateFromStripe("active")).toBe("activa");
    expect(stateFromStripe("past_due")).toBe("impago");
    expect(stateFromStripe("canceled")).toBe("cancelada");
    expect(stateFromStripe("incomplete")).toBe("incompleta");
  });
});

describe.skipIf(!TEST_DATABASE_URL)("cobro de la suscripción", () => {
  let ctx: TestContext;
  const checkouts: Json[] = [];
  const fake: StripeClient = {
    createCheckoutSession: async (input) => {
      checkouts.push(input);
      return { url: "https://checkout.stripe.test/s1" };
    },
    createPortalSession: async () => ({ url: "https://portal.stripe.test/p1" }),
  };
  const prices = { premium: "price_premium_test" };

  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  const app = () =>
    ctx.appWith({
      stripe: fake,
      stripeWebhookSecret: SECRET,
      stripePrices: prices,
      allowedOrigins: ["https://panel.test"],
    });

  const webhook = async (event: Json, header?: string) => {
    const payload = JSON.stringify(event);
    const response = await app().request("/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature":
          header ?? sign(payload, Math.floor(new Date("2026-11-03T13:00:00Z").getTime() / 1000)),
      },
      body: payload,
    });
    return { status: response.status, body: (await response.json()) as Json };
  };

  it("sin Stripe configurado no ofrece pagar y el webhook responde 503", async () => {
    const read = await ctx.app.request("/panel/prueba-a/facturacion", { headers: auth("ownerA") });
    expect(((await read.json()) as Json).disponible).toBe(false);
    const hook = await ctx.app.request("/webhooks/stripe", { method: "POST", body: "{}" });
    expect(hook.status).toBe(503);
  });

  it("solo quien cambia los ajustes ve la facturación y paga", async () => {
    for (const [user, slug] of [
      ["viewerA", "prueba-a"],
      ["ownerB", "prueba-a"],
    ] as const) {
      const response = await app().request(`/panel/${slug}/facturacion`, { headers: auth(user) });
      expect(response.status).toBe(403);
    }
  });

  it("crea la sesión de pago con la referencia del restaurante", async () => {
    const response = await app().request("/panel/prueba-a/facturacion/pago", {
      method: "POST",
      headers: {
        ...auth("ownerA"),
        "Content-Type": "application/json",
        Origin: "https://panel.test",
      },
      body: JSON.stringify({ plan: "premium" }),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as Json).url).toBe("https://checkout.stripe.test/s1");
    expect(checkouts[0]).toMatchObject({ restauranteId: 101, planCode: "premium" });
    const bad = await app().request("/panel/prueba-a/facturacion/pago", {
      method: "POST",
      headers: { ...auth("ownerA"), "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "inexistente" }),
    });
    expect(bad.status).toBe(400);
  });

  it("rechaza firmas inválidas sin tocar la base", async () => {
    const event = { id: "evt_bad", type: "checkout.session.completed", data: { object: {} } };
    expect((await webhook(event, "t=1,v1=abc")).status).toBe(400);
    const rows = await ctx.sql`SELECT 1 FROM public.stripe_evento WHERE id = 'evt_bad'`;
    expect(rows.length).toBe(0);
  });

  it("el pago completado asigna el plan, es idempotente y el impago se registra", async () => {
    const completed = {
      id: "evt_ok_1",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "101",
          customer: "cus_test_1",
          subscription: "sub_test_1",
          metadata: { restaurante_id: "101", plan: "premium" },
        },
      },
    };
    expect((await webhook(completed)).status).toBe(200);
    const [plan] = await ctx.sql<{ plan_code: string }[]>`
      SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = 101`;
    expect(plan?.plan_code).toBe("premium");
    const [sub] = await ctx.sql<{ estado: string; stripe_customer_id: string }[]>`
      SELECT estado, stripe_customer_id FROM public.suscripcion WHERE restaurante_id = 101`;
    expect(sub).toMatchObject({ estado: "activa", stripe_customer_id: "cus_test_1" });

    // Reintento del mismo evento: no repite nada.
    expect((await webhook(completed)).status).toBe(200);
    const events = await ctx.sql`SELECT 1 FROM public.stripe_evento WHERE id = 'evt_ok_1'`;
    expect(events.length).toBe(1);
    const trail = await ctx.sql`
      SELECT 1 FROM public.auditoria WHERE restaurante_id = 101 AND accion = 'facturacion.evento'`;
    expect(trail.length).toBe(1);

    const failed = {
      id: "evt_fail_1",
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_test_1" } },
    };
    expect((await webhook(failed)).status).toBe(200);
    const [after] = await ctx.sql<{ estado: string }[]>`
      SELECT estado FROM public.suscripcion WHERE restaurante_id = 101`;
    expect(after?.estado).toBe("impago");

    const cancelled = {
      id: "evt_del_1",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_test_1", status: "canceled" } },
    };
    expect((await webhook(cancelled)).status).toBe(200);
    const [end] = await ctx.sql<{ estado: string }[]>`
      SELECT estado FROM public.suscripcion WHERE restaurante_id = 101`;
    expect(end?.estado).toBe("cancelada");
  });

  it("ignora eventos de restaurantes o planes desconocidos", async () => {
    const unknown = {
      id: "evt_unknown",
      type: "checkout.session.completed",
      data: {
        object: { client_reference_id: "999999", metadata: { plan: "premium" }, customer: "c" },
      },
    };
    expect((await webhook(unknown)).status).toBe(200);
    const rows = await ctx.sql`SELECT 1 FROM public.suscripcion WHERE restaurante_id = 999999`;
    expect(rows.length).toBe(0);
  });
});
