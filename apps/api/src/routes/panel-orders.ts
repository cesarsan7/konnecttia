import { can, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { FULFILLMENT } from "@konnecttia/domain";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { ORDER_CHANNEL } from "../repositories/orders";
import { type OrderInput, placeOrder } from "../repositories/place-order";
import { orderBodySchema } from "./public";

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

/** Canal del pedido manual: el equipo lo toma por teléfono o en el mostrador (también en mesa). */
const manualChannel = z.enum([ORDER_CHANNEL.Phone, ORDER_CHANNEL.Counter]);

const positiveInt = z.number().int().positive();

/** Pedido en mesa: sin dirección ni zona; nombre y teléfono opcionales. */
const dineInSchema = z.object({
  mesa_id: positiveInt,
  nombre: z.string().trim().max(120).optional(),
  telefono: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{7,20}$/)
    .optional(),
  metodo_pago: z.string().trim().min(1).max(40),
  notas: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menu_item_id: positiveInt,
        menu_variant_id: positiveInt,
        quantity: positiveInt,
        extras: z
          .array(z.object({ extra_id: positiveInt, quantity: positiveInt }))
          .max(30)
          .optional(),
        nota: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(50),
});

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
    let body: OrderInput;
    if (raw?.tipo_despacho === FULFILLMENT.DineIn) {
      // Mesa: requiere el módulo de mesas; el local es el de la mesa y el teléfono es opcional.
      if (!can(access, PERMISSION.TablesView)) {
        return fail(c, 403, API_ERROR.Forbidden, { permission: PERMISSION.TablesView });
      }
      const parsed = dineInSchema.safeParse(raw);
      if (!channel.success || !parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
      const [table] = await deps.sql<{ id: number; nombre: string; sucursal_id: number | null }[]>`
        SELECT id, nombre, sucursal_id FROM public.mesa
        WHERE  id = ${parsed.data.mesa_id} AND restaurante_id = ${restaurant.id} AND activa
      `;
      if (!table || table.sucursal_id === null || !canAccessBranch(access, table.sucursal_id)) {
        return fail(c, 404, API_ERROR.NotFound, { reason: "table_not_found" });
      }
      body = {
        ...parsed.data,
        tipo_despacho: FULFILLMENT.DineIn,
        sucursal_id: table.sucursal_id,
        nombre: parsed.data.nombre || table.nombre,
        nombre_pedido: table.nombre,
        telefono: parsed.data.telefono ?? "",
      };
    } else {
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
      body = parsed.data;
    }
    // Un usuario limitado a unos locales solo crea pedidos en ellos.
    if (body.sucursal_id !== undefined && !canAccessBranch(access, body.sucursal_id)) {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const placed = await placeOrder(
      deps,
      restaurant,
      body,
      `panel-${idempotencyKey}`,
      channel.success ? channel.data : ORDER_CHANNEL.Counter,
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
