import { canAccessBranch, PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { ORDER_CHANNEL } from "../repositories/orders";
import { placeOrder } from "../repositories/place-order";
import { orderBodySchema } from "./public";

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** Canal del pedido manual: el equipo lo toma por teléfono o en el mostrador. */
const manualChannel = z.enum([ORDER_CHANNEL.Phone, ORDER_CHANNEL.Counter]);

/**
 * Pedido manual desde el panel (orders.create). Usa exactamente el mismo cálculo que la web
 * (placeOrder): local abierto, zona, mínimo, tarifa, tiempo, agotados por local y precios de la
 * carta. El navegador solo envía ids y cantidades. El local que resulte debe ser del usuario.
 */
export function registerManualOrderRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.post("/:slug/orders", requirePermission(deps, PERMISSION.OrdersCreate), async (c) => {
    const restaurant = c.get("restaurant");
    const user = c.get("user");
    const access = c.get("access");
    const idempotencyKey = c.req.header(IDEMPOTENCY_HEADER) ?? "";
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return fail(c, 400, API_ERROR.IdempotencyKeyRequired, { header: IDEMPOTENCY_HEADER });
    }
    const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const channel = manualChannel.safeParse(raw?.canal);
    const parsed = orderBodySchema.safeParse(raw);
    if (!channel.success || !parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: [
          ...(channel.success ? [] : [{ path: "canal", message: "telefono | mostrador" }]),
          ...(parsed.success
            ? []
            : parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              }))),
        ],
      });
    }
    const body = parsed.data;
    // Un usuario limitado a unos locales solo crea pedidos en ellos.
    if (body.sucursal_id !== undefined && !canAccessBranch(access, body.sucursal_id)) {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const placed = await placeOrder(
      deps,
      restaurant,
      body,
      `panel-${idempotencyKey}`,
      channel.data,
      (branchId) => canAccessBranch(access, branchId),
    );
    if (!placed.ok) return fail(c, 422, placed.error, placed.extra);
    const { order, branch, eta, priced } = placed;
    if (order.created) {
      await audit(deps.sql, {
        restauranteId: restaurant.id,
        actorTipo: "usuario",
        actorId: user.userId,
        accion: PERMISSION.OrdersCreate,
        recursoTipo: "pedido",
        recursoId: String(order.id),
        resultado: "ok",
        detalle: { canal: channel.data, local: branch.id, total: order.totalCents / 100 },
        requestId: c.get("requestId"),
      });
    }
    return c.json(
      {
        id: order.id,
        pedido_codigo: order.pedidoCodigo,
        tracking_token: order.trackingToken,
        estado: order.estado,
        local: { id: branch.id, nombre: branch.name },
        tiempo_estimado: eta,
        subtotal: priced.quote.subtotalCents / 100,
        costo_envio: priced.quote.deliveryFeeCents / 100,
        total: order.totalCents / 100,
      },
      order.created ? 201 : 200,
    );
  });
}
