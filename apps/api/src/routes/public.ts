import {
  branchServes,
  chooseDeliveryZone,
  distanceKm,
  FULFILLMENT,
  type GeoPoint,
  type PricingContext,
  priceOrder,
  type RequestedLine,
  rankBranches,
} from "@konnecttia/domain";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { resolveRestaurant } from "../middleware/tenant";
import {
  type BranchRecord,
  coveringZones,
  loadBranches,
  openChecker,
  unavailableItems,
  zoneBranch,
} from "../repositories/branches";
import { loadCatalogForItems, loadPublicMenu } from "../repositories/catalog";
import { createOrder, findOrderByTrackingToken } from "../repositories/orders";
import {
  findDeliveryZone,
  fulfillmentEnabled,
  loadConfig,
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
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

/** Coordenadas opcionales en la query (`?lat=..&lng=..`); ambas o ninguna. */
function pointFromQuery(lat: string | undefined, lng: string | undefined): GeoPoint | null {
  const parsed = z.object({ lat: latitude, lng: longitude }).safeParse({
    lat: lat === undefined ? undefined : Number(lat),
    lng: lng === undefined ? undefined : Number(lng),
  });
  return parsed.success ? parsed.data : null;
}

function branchIdFromQuery(value: string | undefined): number | null {
  if (value === undefined) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : Number.NaN;
}

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
    /** Local elegido por el cliente para recoger. En reparto lo decide el servidor. */
    sucursal_id: positiveInt.optional(),
    /** Ubicación del cliente: elige el local más cercano y, en reparto, la zona. */
    lat: latitude.optional(),
    lng: longitude.optional(),
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
    if ((body.lat === undefined) !== (body.lng === undefined)) {
      ctx.addIssue({ code: "custom", path: ["lng"], message: "lat y lng van juntas" });
    }
    // Regla de negocio: para recoger nunca se pide dirección; para reparto es obligatoria.
    if (body.tipo_despacho === FULFILLMENT.Delivery) {
      if (!body.direccion)
        ctx.addIssue({ code: "custom", path: ["direccion"], message: "required" });
      if (!body.zona_id && body.lat === undefined) {
        ctx.addIssue({ code: "custom", path: ["zona_id"], message: "required" });
      }
    }
  });

function roundKm(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

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

  // Locales que atienden al público, con su estado y, si se envía la ubicación, la distancia.
  app.get("/:slug/locales", async (c) => {
    const restaurant = c.get("restaurant");
    const from = pointFromQuery(c.req.query("lat"), c.req.query("lng"));
    const [branches, config] = await Promise.all([
      loadBranches(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    const visible = branches.filter((branch) => branch.active);
    const isOpen = await openChecker(
      deps.sql,
      restaurant,
      visible,
      openOverride(config),
      deps.now(),
    );
    const pickupOrder = rankBranches(visible, FULFILLMENT.Pickup, { from });
    const distance = new Map(
      pickupOrder.map((candidate) => [candidate.branch.id, candidate.distanceKm]),
    );
    const order = new Map(pickupOrder.map((candidate, index) => [candidate.branch.id, index]));
    return c.json({
      locales: visible
        .map((branch) => ({
          id: branch.id,
          nombre: branch.name,
          slug: branch.slug,
          direccion: branch.address,
          telefono: branch.phone,
          lat: branch.location?.lat ?? null,
          lng: branch.location?.lng ?? null,
          principal: branch.isPrincipal,
          recogida: branch.acceptsPickup && restaurant.pickupEnabled,
          reparto: branch.acceptsDelivery && restaurant.deliveryEnabled,
          abierto: isOpen(branch),
          distancia_km: roundKm(distance.get(branch.id) ?? null),
        }))
        .sort(
          (a, b) =>
            (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
    });
  });

  app.get("/:slug/menu", async (c) => {
    const restaurant = c.get("restaurant");
    const requested = branchIdFromQuery(c.req.query("local"));
    const [menu, branches, config] = await Promise.all([
      loadPublicMenu(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    const active = branches.filter((branch) => branch.active);
    const branch =
      requested === null ? null : active.find((candidate) => candidate.id === requested);
    if (requested !== null && !branch) {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const isOpen = await openChecker(
      deps.sql,
      restaurant,
      active,
      openOverride(config),
      deps.now(),
    );
    // Sin local elegido, la carta se muestra abierta si algún local atiende ahora.
    const abierto = branch ? isOpen(branch) : active.some(isOpen);
    const hidden = branch ? await unavailableItems(deps.sql, branch.id) : new Set<number>();
    return c.json({
      restaurante: { nombre: restaurant.nombre, slug: restaurant.slug },
      local: branch ? { id: branch.id, nombre: branch.name } : null,
      abierto,
      categories: menu.categories
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => !hidden.has(item.id)),
        }))
        .filter((category) => category.items.length > 0),
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

    const [branches, config] = await Promise.all([
      loadBranches(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    const isOpen = await openChecker(
      deps.sql,
      restaurant,
      branches,
      openOverride(config),
      deps.now(),
    );
    const customerPoint: GeoPoint | null =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : null;

    let pricingContext: PricingContext = {
      fulfillment: FULFILLMENT.Pickup,
      surcharges: surchargeRules(config),
    };
    let eta = pickupEta(config);
    let postalCode: string | null = null;
    let branch: BranchRecord | undefined;

    if (body.tipo_despacho === FULFILLMENT.Pickup) {
      if (body.sucursal_id !== undefined) {
        branch = branches.find((candidate) => candidate.id === body.sucursal_id);
        if (!branch || !branchServes(branch, FULFILLMENT.Pickup)) {
          return fail(c, 422, API_ERROR.BranchNotAvailable);
        }
        if (!isOpen(branch)) return fail(c, 422, API_ERROR.RestaurantClosed);
      } else {
        const open = rankBranches(branches, FULFILLMENT.Pickup, { from: customerPoint, isOpen });
        if (open.length === 0) return fail(c, 422, API_ERROR.RestaurantClosed);
        // Con varios locales abiertos y sin ubicación, el cliente debe elegir dónde recoge.
        if (open.length > 1 && !customerPoint) {
          return fail(c, 422, API_ERROR.BranchRequired, {
            locales: open.map((candidate) => ({
              id: candidate.branch.id,
              nombre: candidate.branch.name,
            })),
          });
        }
        branch = open[0]?.branch;
      }
    } else {
      let zoneId: number | undefined;
      if (body.zona_id !== undefined) {
        const branchId = await zoneBranch(deps.sql, restaurant.id, body.zona_id);
        branch = branches.find((candidate) => candidate.id === branchId);
        if (!branch) return fail(c, 422, API_ERROR.DeliveryZoneNotFound);
        if (!branchServes(branch, FULFILLMENT.Delivery)) {
          return fail(c, 422, API_ERROR.DeliveryNotAvailable);
        }
        if (!isOpen(branch)) return fail(c, 422, API_ERROR.RestaurantClosed);
        zoneId = body.zona_id;
      } else {
        // Reparte el local abierto más cercano entre los que cubren la ubicación del cliente.
        const covering = await coveringZones(deps.sql, restaurant.id, {
          point: customerPoint,
          postalCode: null,
        });
        const choice = chooseDeliveryZone(covering, branches, customerPoint, isOpen);
        if (!choice) {
          const closedOnly = chooseDeliveryZone(covering, branches, customerPoint);
          return fail(
            c,
            422,
            closedOnly ? API_ERROR.RestaurantClosed : API_ERROR.DeliveryZoneNotFound,
          );
        }
        branch = choice.branch;
        zoneId = choice.zoneId;
      }
      const zone = await findDeliveryZone(deps.sql, restaurant.id, zoneId, config);
      if (!zone) {
        return fail(c, 422, API_ERROR.DeliveryZoneNotFound);
      }
      pricingContext = { ...pricingContext, fulfillment: FULFILLMENT.Delivery, delivery: zone };
      eta = zone.eta;
      postalCode = zone.postalCode;
    }
    if (!branch) {
      return fail(c, 422, API_ERROR.BranchNotAvailable);
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
    const hidden = await unavailableItems(deps.sql, branch.id);
    const notHere = [...new Set(lines.map((line) => line.itemId))].filter((id) => hidden.has(id));
    if (notHere.length > 0) {
      return fail(c, 422, API_ERROR.InvalidItems, {
        errors: notHere.map((id) => ({ code: "ITEM_NOT_AVAILABLE_AT_BRANCH", detail: String(id) })),
      });
    }
    const priced = priceOrder(catalog, lines, pricingContext);
    if (!priced.ok) {
      return fail(c, 422, API_ERROR.InvalidItems, { errors: priced.errors });
    }

    const order = await createOrder(deps.sql, {
      restauranteId: restaurant.id,
      sucursalId: branch.id,
      idempotencyKey,
      nombre: body.nombre,
      telefono: body.telefono,
      nombrePedido: body.nombre_pedido ?? null,
      fulfillment: body.tipo_despacho,
      direccion: body.tipo_despacho === FULFILLMENT.Delivery ? (body.direccion ?? null) : null,
      postalCode,
      customerPoint: body.tipo_despacho === FULFILLMENT.Delivery ? customerPoint : null,
      distanciaKm:
        body.tipo_despacho === FULFILLMENT.Delivery && customerPoint && branch.location
          ? distanceKm(customerPoint, branch.location)
          : null,
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
        local: { id: branch.id, nombre: branch.name, direccion: branch.address },
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
