import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { isPushEndpoint } from "../lib/push";
import { requirePermission } from "../middleware/auth";
import { hasSubscription, removeSubscription, saveSubscription } from "../repositories/push";

const subscribeSchema = z.object({
  endpoint: z.string().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().max(2000) });

/**
 * Avisos push del tablero: cada persona activa los suyos en su navegador. Quien puede ver los
 * pedidos (`orders.view`) puede recibirlos. Sin claves VAPID, `disponible` es false.
 */
export function registerPushRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  app.get("/:slug/push", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    return c.json({
      disponible: Boolean(deps.push),
      clave_publica: deps.push?.publicKey ?? null,
      suscrito: deps.push
        ? await hasSubscription(sql, c.get("restaurant").id, c.get("user").userId)
        : false,
    });
  });

  app.post("/:slug/push", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    if (!deps.push) return fail(c, 503, API_ERROR.ServiceUnavailable, { reason: "no_push" });
    const parsed = subscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !isPushEndpoint(parsed.data.endpoint)) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: "endpoint" });
    }
    await saveSubscription(sql, {
      restauranteId: c.get("restaurant").id,
      userId: c.get("user").userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    });
    return c.json({ ok: true }, 201);
  });

  app.delete("/:slug/push", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const parsed = unsubscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "endpoint" });
    await removeSubscription(
      sql,
      c.get("restaurant").id,
      c.get("user").userId,
      parsed.data.endpoint,
    );
    return c.json({ ok: true });
  });
}
