import {
  FULFILLMENT,
  isOpenAt,
  type PricingContext,
  priceOrder,
  type RequestedLine,
} from "@konnecttia/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { resolveRestaurant } from "../middleware/tenant";
import { loadCatalogForItems, loadPublicMenu } from "../repositories/catalog";
import { createOrder, findOrderByTrackingToken } from "../repositories/orders";
import {
  findDeliveryZone,
  fulfillmentEnabled,
  loadConfig,
  loadSchedule,
  openOverride,
  pickupEta,
  surchargeRules,
} from "../repositories/restaurants";

const MAX_LINES = 50;
const ORDERS_PER_IP_PER_10_MIN = 20;
const TRACKING_PER_IP_PER_MIN = 60;
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const positiveInt = z.number().int().positive();

/**
 * Cuerpo del pedido. No hay ningún campo de precio: el total lo calcula el servidor.
 * Los nombres de campo siguen la API de EasyOrder para facilitar la migración del frontend.
 */
export const orderBodySchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    telefono: z
      .string()
      .trim()
      .regex(/^\+?[0-9]{7,20}$/, "Teléfono no válido"),
    nombre_pedido: z.string().trim().max(120).optional(),
    tipo_despacho: z.enum([FULFILLMENT.Pickup, FULFILLMENT.Delivery]),
    metodo_pago: z.string().trim().min(1).max(40),
    direccion: z.string().trim().max(300).optional(),
    zona_id: positiveInt.optional(),
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
      .max(MAX_LINES),
  })
  .superRefine((body, ctx) => {
    // Regla de negocio: para recoger nunca se pide dirección; para reparto es obligatoria.
    if (body.tipo_despacho === FULFILLMENT.Delivery) {
      if (!body.direccion)
        ctx.addIssue({ code: "custom", path: ["direccion"], message: "required" });
      if (!body.zona_id) ctx.addIssue({ code: "custom", path: ["zona_id"], message: "required" });
    }
  });

export function publicRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const ordersLimited = createRateLimiter(ORDERS_PER_IP_PER_10_MIN, 10 * 60_000);
  const trackingLimited = createRateLimiter(TRACKING_PER_IP_PER_MIN, 60_000);
  const clientIp = (header: string | undefined) => header ?? "desconocida";

  // Seguimiento por token aleatorio: no depende del restaurante ni del código visible.
  app.get("/orders/:token", async (c) => {
    if (trackingLimited(clientIp(c.req.header(deps.clientIpHeader)))) {
      return fail(c, 429, API_ERROR.RateLimited);
    }
    const token = c.req.param("token");
    if (!UUID_PATTERN.test(token)) {
      return fail(c, 404, API_ERROR.OrderNotFound);
    }
    const order = await findOrderByTrackingToken(deps.sql, token);
    return order ? c.json(order) : fail(c, 404, API_ERROR.OrderNotFound);
  });

  app.use("/:slug/*", resolveRestaurant(deps));

  app.get("/:slug/menu", async (c) => {
    const restaurant = c.get("restaurant");
    const [menu, schedule, config] = await Promise.all([
      loadPublicMenu(deps.sql, restaurant.id),
      loadSchedule(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    return c.json({
      restaurante: { nombre: restaurant.nombre, slug: restaurant.slug },
      abierto: isOpenAt(schedule, restaurant.zonaHoraria, deps.now(), openOverride(config)),
      ...menu,
    });
  });

  app.post("/:slug/orders", async (c) => {
    const restaurant = c.get("restaurant");
    if (ordersLimited(`${restaurant.id}:${clientIp(c.req.header(deps.clientIpHeader))}`)) {
      return fail(c, 429, API_ERROR.RateLimited);
    }

    const idempotencyKey = c.req.header(IDEMPOTENCY_HEADER) ?? "";
    if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
      return fail(c, 400, API_ERROR.IdempotencyKeyRequired, { header: IDEMPOTENCY_HEADER });
    }

    const parsed = orderBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const body = parsed.data;

    if (!fulfillmentEnabled(restaurant, body.tipo_despacho)) {
      return fail(
        c,
        422,
        body.tipo_despacho === FULFILLMENT.Delivery
          ? API_ERROR.DeliveryNotAvailable
          : API_ERROR.PickupNotAvailable,
      );
    }
    if (!restaurant.paymentMethods.includes(body.metodo_pago)) {
      return fail(c, 422, API_ERROR.PaymentMethodNotAccepted, {
        accepted: restaurant.paymentMethods,
      });
    }

    const [schedule, config] = await Promise.all([
      loadSchedule(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    if (!isOpenAt(schedule, restaurant.zonaHoraria, deps.now(), openOverride(config))) {
      return fail(c, 422, API_ERROR.RestaurantClosed);
    }

    let pricingContext: PricingContext = {
      fulfillment: FULFILLMENT.Pickup,
      surcharges: surchargeRules(config),
    };
    let eta = pickupEta(config);
    let postalCode: string | null = null;
    if (body.tipo_despacho === FULFILLMENT.Delivery) {
      const zone = await findDeliveryZone(deps.sql, restaurant.id, body.zona_id ?? 0, config);
      if (!zone) {
        return fail(c, 422, API_ERROR.DeliveryZoneNotFound);
      }
      pricingContext = { ...pricingContext, fulfillment: FULFILLMENT.Delivery, delivery: zone };
      eta = zone.eta;
      postalCode = zone.postalCode;
    }

    const lines: RequestedLine[] = body.items.map((item) => ({
      itemId: item.menu_item_id,
      variantId: item.menu_variant_id,
      quantity: item.quantity,
      modifiers: (item.extras ?? []).map((extra) => ({
        optionId: extra.extra_id,
        quantity: extra.quantity,
      })),
      ...(item.nota ? { note: item.nota } : {}),
    }));
    const catalog = await loadCatalogForItems(deps.sql, restaurant.id, [
      ...new Set(lines.map((line) => line.itemId)),
    ]);
    const priced = priceOrder(catalog, lines, pricingContext);
    if (!priced.ok) {
      return fail(c, 422, API_ERROR.InvalidItems, { errors: priced.errors });
    }

    const order = await createOrder(deps.sql, {
      restauranteId: restaurant.id,
      idempotencyKey,
      nombre: body.nombre,
      telefono: body.telefono,
      nombrePedido: body.nombre_pedido ?? null,
      fulfillment: body.tipo_despacho,
      direccion: body.tipo_despacho === FULFILLMENT.Delivery ? (body.direccion ?? null) : null,
      postalCode,
      metodoPago: body.metodo_pago,
      tiempoEstimado: eta,
      notas: body.notas ?? null,
      quote: priced.quote,
    });

    return c.json(
      {
        pedido_codigo: order.pedidoCodigo,
        tracking_token: order.trackingToken,
        estado: order.estado,
        tiempo_estimado: eta,
        subtotal: priced.quote.subtotalCents / 100,
        suplementos: priced.quote.surcharges.map((surcharge) => ({
          concepto: surcharge.label,
          importe: surcharge.amountCents / 100,
        })),
        costo_envio: priced.quote.deliveryFeeCents / 100,
        total: order.totalCents / 100,
      },
      order.created ? 201 : 200,
    );
  });

  return app;
}
