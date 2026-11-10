import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadSubscription } from "../repositories/subscriptions";

const checkoutSchema = z.object({ plan: z.string().trim().min(1).max(40) });

/**
 * Plan y facturación del restaurante: estado de la suscripción, pago (Stripe Checkout) y portal
 * del cliente (cambiar tarjeta, ver facturas, cancelar). Solo quien puede cambiar los ajustes.
 * Sin clave de Stripe, `disponible` es false y el panel no ofrece pagar.
 */
export function registerBillingRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;
  const prices = deps.stripePrices ?? {};

  const baseUrl = (origin: string | undefined) => {
    const base = origin ?? deps.panelUrl ?? null;
    return base && deps.allowedOrigins.concat(deps.panelUrl ?? []).includes(base) ? base : null;
  };

  app.get("/:slug/facturacion", requirePermission(deps, PERMISSION.SettingsUpdate), async (c) => {
    const restaurant = c.get("restaurant");
    const [plan] = await sql<{ plan_code: string }[]>`
      SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${restaurant.id}
    `;
    const subscription = await loadSubscription(sql, restaurant.id);
    return c.json({
      disponible: Boolean(deps.stripe),
      plan_actual: plan?.plan_code ?? null,
      planes_de_pago: Object.keys(prices),
      suscripcion: subscription && {
        plan: subscription.plan_code,
        estado: subscription.estado,
        periodo_fin: subscription.periodo_fin,
        cancelar_al_final: subscription.cancelar_al_final,
        tiene_portal: Boolean(subscription.stripe_customer_id),
      },
    });
  });

  app.post(
    "/:slug/facturacion/pago",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      if (!deps.stripe) return fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_billing" });
      const parsed = checkoutSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "plan" });
      const priceId = prices[parsed.data.plan];
      if (!priceId) return fail(c, 400, API_ERROR.InvalidBody, { field: "plan", reason: "plan" });
      const base = baseUrl(c.req.header("Origin"));
      if (!base) return fail(c, 400, API_ERROR.InvalidBody, { reason: "origin" });
      const restaurant = c.get("restaurant");
      const current = await loadSubscription(sql, restaurant.id);
      if (current?.estado === "activa" && current.stripe_customer_id) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "already_subscribed" });
      }
      const back = `${base}/panel/${restaurant.slug}/ajustes`;
      const session = await deps.stripe.createCheckoutSession({
        priceId,
        restauranteId: restaurant.id,
        planCode: parsed.data.plan,
        customerId: current?.stripe_customer_id ?? null,
        email: c.get("user").email,
        successUrl: `${back}?facturacion=ok`,
        cancelUrl: `${back}?facturacion=cancelado`,
      });
      await audit(sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: "facturacion.pago_iniciado",
        recursoTipo: "suscripcion",
        recursoId: String(restaurant.id),
        resultado: "ok",
        detalle: { plan: parsed.data.plan },
        requestId: c.get("requestId"),
      });
      return c.json({ url: session.url });
    },
  );

  app.post(
    "/:slug/facturacion/portal",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      if (!deps.stripe) return fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_billing" });
      const restaurant = c.get("restaurant");
      const subscription = await loadSubscription(sql, restaurant.id);
      if (!subscription?.stripe_customer_id) return fail(c, 404, API_ERROR.NotFound);
      const base = baseUrl(c.req.header("Origin"));
      if (!base) return fail(c, 400, API_ERROR.InvalidBody, { reason: "origin" });
      const session = await deps.stripe.createPortalSession({
        customerId: subscription.stripe_customer_id,
        returnUrl: `${base}/panel/${restaurant.slug}/ajustes`,
      });
      return c.json({ url: session.url });
    },
  );
}
