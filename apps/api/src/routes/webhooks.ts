import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { verifyStripeSignature } from "../lib/stripe";
import { audit } from "../repositories/access";
import { applyStripeEvent, type StripeEvent } from "../repositories/subscriptions";

/**
 * Webhooks de terceros. Stripe firma el cuerpo EXACTO: se lee como texto antes de interpretarlo.
 * Un evento de otro tipo, o ya procesado, responde 200 para que Stripe no lo reintente.
 */
export function webhookRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post("/stripe", async (c) => {
    const secret = deps.stripeWebhookSecret;
    if (!secret) return c.json({ error: "service_unavailable" }, 503);
    const payload = await c.req.text();
    const valid = verifyStripeSignature(
      payload,
      c.req.header("Stripe-Signature"),
      secret,
      Math.floor(deps.now().getTime() / 1000),
    );
    if (!valid) return c.json({ error: "invalid_signature" }, 400);

    let event: StripeEvent;
    try {
      event = JSON.parse(payload) as StripeEvent;
    } catch {
      return c.json({ error: "invalid_body" }, 400);
    }
    if (typeof event.id !== "string" || typeof event.type !== "string" || !event.data?.object) {
      return c.json({ error: "invalid_body" }, 400);
    }

    const planByPrice = new Map<string, string>(
      Object.entries(deps.stripePrices ?? {}).map(([plan, price]) => [price, plan]),
    );
    const outcome = await applyStripeEvent(deps.sql, event, planByPrice, deps.now());
    if (outcome.handled && outcome.restauranteId !== null) {
      await audit(deps.sql, {
        restauranteId: outcome.restauranteId,
        actorTipo: "sistema",
        actorId: "stripe",
        accion: "facturacion.evento",
        recursoTipo: "suscripcion",
        recursoId: String(outcome.restauranteId),
        resultado: "ok",
        detalle: { tipo: event.type, detalle: outcome.detail },
        requestId: c.get("requestId"),
      });
    }
    return c.json({ recibido: true });
  });

  return app;
}
