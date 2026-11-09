import {
  branchServes,
  centsFromDecimal,
  deliveryChargeFor,
  ETA_SERVICE,
  FULFILLMENT,
  type GeoPoint,
  rankBranches,
} from "@konnecttia/domain";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { maskEmail } from "../lib/customer-email";
import { API_ERROR, fail } from "../lib/http";
import { createRateLimiter } from "../lib/rate-limit";
import { TURNSTILE_MAX_TOKEN_LENGTH } from "../lib/turnstile";
import { resolveRestaurant } from "../middleware/tenant";
import {
  checkPhoneLimits,
  isPhoneBlocked,
  orderExistsForKey,
  phoneLimits,
} from "../repositories/antifraud";
import { loadBranches, openChecker, unavailableItems } from "../repositories/branches";
import { loadPublicMenu } from "../repositories/catalog";
import { loadEtaContext } from "../repositories/eta";
import { resolveFulfillment } from "../repositories/fulfillment";
import {
  findOrderByTrackingToken,
  ORDER_CHANNEL,
  updateTrackedOrderEmail,
} from "../repositories/orders";
import {
  checkProofTarget,
  detectProofType,
  MAX_PROOF_BYTES,
  PROOF_REJECTION,
  type ProofRejection,
  proofPath,
  saveProof,
} from "../repositories/payment-proofs";
import { placeOrder } from "../repositories/place-order";
import { loadRestaurantContact, privacyPolicy } from "../repositories/privacy";
import {
  deliveryEta,
  fulfillmentEnabled,
  loadConfig,
  openOverride,
  pickupEta,
} from "../repositories/restaurants";
import { restaurantAcceptsOrders } from "../repositories/trial";

const MAX_LINES = 50;
const ORDERS_PER_IP_PER_10_MIN = 20;
const TRACKING_PER_IP_PER_MIN = 60;
/** Tope técnico por IP contra el abuso del almacenamiento (el límite por pedido va aparte). */
const PROOFS_PER_IP_PER_10_MIN = 10;
/** n8n llama desde la red interna (una sola IP para todos los chats): margen amplio. */
const QUOTES_PER_IP_PER_MIN = 300;
const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const PRIVACY_REQUIRED_REASON = "privacy_required";
const CAPTCHA_FAILED_REASON = "captcha_failed";
const PHONE_LIMIT_REASON = "phone_limit";
const ORDER_NOT_ACCEPTED_REASON = "order_not_accepted";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estado HTTP de cada motivo por el que no se admite un justificante. */
const PROOF_STATUS: Record<ProofRejection, 404 | 409> = {
  [PROOF_REJECTION.OrderNotFound]: 404,
  [PROOF_REJECTION.NotPending]: 409,
  [PROOF_REJECTION.LimitReached]: 409,
};

const positiveInt = z.number().int().positive();
/** Email del cliente: sin espacios, en minúsculas y con formato válido (máx. 254, como el SMTP). */
const emailField = z.string().trim().toLowerCase().max(254).pipe(z.email());
const emailBodySchema = z.object({ email: emailField });
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
    /** Email para los avisos del pedido. Obligatorio en el checkout web; el panel y n8n no lo piden. */
    email: emailField.optional(),
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
    /**
     * Consentimiento del checkout web. Solo `POST /public/:slug/orders` lo exige y lo guarda;
     * el pedido manual del panel recibe el mismo esquema pero ignora estos campos.
     */
    privacidad_aceptada: z.boolean().optional(),
    acepta_promociones: z.boolean().optional(),
    /** Token del captcha (Turnstile) del checkout web. El pedido manual lo ignora. */
    captcha_token: z.string().max(TURNSTILE_MAX_TOKEN_LENGTH).optional(),
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

/**
 * Cotización de despacho (sin crear pedido): la usa el agente de WhatsApp (n8n, subflujo
 * Despacho) para aplicar las mismas zonas, tarifas, mínimos y tiempos que la web.
 */
export const quoteBodySchema = z
  .object({
    tipo_despacho: z.enum([FULFILLMENT.Pickup, FULFILLMENT.Delivery]),
    /** Subtotal de productos en euros (lo calcula n8n con los precios de la base). */
    subtotal: z.number().min(0).max(100_000),
    sucursal_id: positiveInt.optional(),
    zona_id: positiveInt.optional(),
    lat: latitude.optional(),
    lng: longitude.optional(),
    codigo_postal: z.string().trim().max(10).optional(),
    zona_nombre: z.string().trim().max(120).optional(),
    /** Recogida: texto del cliente con el local («el de Carlos V»). */
    texto_local: z.string().trim().max(300).optional(),
  })
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    path: ["lng"],
    message: "lat y lng van juntas",
  });

/** Motivo legible (para el agente) de cada error de despacho. */
const QUOTE_REASON: Partial<Record<string, string>> = {
  [API_ERROR.DeliveryZoneNotFound]: "fuera_de_cobertura",
  [API_ERROR.RestaurantClosed]: "local_cerrado",
  [API_ERROR.LocationRequired]: "ubicacion_necesaria",
  [API_ERROR.BranchRequired]: "elegir_local",
  [API_ERROR.BranchNotAvailable]: "local_no_disponible",
  [API_ERROR.DeliveryNotAvailable]: "reparto_no_disponible",
  [API_ERROR.PickupNotAvailable]: "recogida_no_disponible",
};

export function publicRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const ordersLimited = createRateLimiter(ORDERS_PER_IP_PER_10_MIN, 10 * 60_000);
  const trackingLimited = createRateLimiter(TRACKING_PER_IP_PER_MIN, 60_000);
  const proofsLimited = createRateLimiter(PROOFS_PER_IP_PER_10_MIN, 10 * 60_000);
  const clientIp = (header: string | undefined) => header ?? "desconocida";
  const quotesLimited = createRateLimiter(QUOTES_PER_IP_PER_MIN, 60_000);

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

  /**
   * El cliente corrige el email de sus avisos desde el seguimiento (por si se equivocó al
   * escribirlo). Solo con el pedido abierto; el enlace de seguimiento es la credencial.
   */
  app.patch("/orders/:token/email", async (c) => {
    if (trackingLimited(clientIp(c.req.header(deps.clientIpHeader)))) {
      return fail(c, 429, API_ERROR.RateLimited);
    }
    const token = c.req.param("token");
    if (!UUID_PATTERN.test(token)) return fail(c, 404, API_ERROR.OrderNotFound);
    const parsed = emailBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const result = await updateTrackedOrderEmail(deps.sql, token, parsed.data.email);
    if (result === "not_found") return fail(c, 404, API_ERROR.OrderNotFound);
    if (result === "closed")
      return fail(c, 409, API_ERROR.InvalidTransition, { reason: "order_closed" });
    return c.json({ ok: true, email_avisos: maskEmail(parsed.data.email) });
  });

  /**
   * Justificante de pago (captura o PDF) de un pedido de Bizum o transferencia. Acceso por el
   * token del pedido, solo mientras el cobro esté pendiente y hasta el máximo por pedido. El
   * archivo se valida por su firma real y va a un bucket privado; nunca se guarda una URL.
   */
  app.post(
    "/orders/:token/justificante",
    async (c, next) => {
      if (proofsLimited(clientIp(c.req.header(deps.clientIpHeader)))) {
        return fail(c, 429, API_ERROR.RateLimited);
      }
      await next();
    },
    bodyLimit({
      maxSize: MAX_PROOF_BYTES + 64 * 1024,
      onError: (c) => fail(c, 413, API_ERROR.InvalidProof, { reason: "too_large" }),
    }),
    async (c) => {
      const token = c.req.param("token");
      if (!UUID_PATTERN.test(token)) return fail(c, 404, API_ERROR.OrderNotFound);
      const storage = deps.proofStorage;
      if (!storage) return fail(c, 503, API_ERROR.StorageNotConfigured);

      const form = await c.req.parseBody().catch(() => null);
      const file = form?.justificante;
      if (!(file instanceof File)) {
        return fail(c, 400, API_ERROR.InvalidBody, { field: "justificante" });
      }
      if (file.size > MAX_PROOF_BYTES) {
        return fail(c, 413, API_ERROR.InvalidProof, { reason: "too_large" });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length === 0) return fail(c, 400, API_ERROR.InvalidBody, { field: "justificante" });
      const type = detectProofType(bytes);
      if (!type) return fail(c, 415, API_ERROR.InvalidProof, { reason: "unsupported_type" });

      // Comprobación previa (barata) para no subir archivos que se van a rechazar.
      const early = await checkProofTarget(deps.sql, token);
      if (!early.ok) return fail(c, PROOF_STATUS[early.error], early.error);

      const path = proofPath(early.restauranteId, early.pedidoId, type);
      await storage.upload(path, bytes, type.mime);
      const saved = await saveProof(deps.sql, token, {
        ruta: path,
        tipoMime: type.mime,
        bytes: bytes.length,
      });
      if (!saved.ok) {
        await storage.remove(path).catch(() => {});
        return fail(c, PROOF_STATUS[saved.error], saved.error);
      }
      return c.json({ justificantes: saved.total }, 201);
    },
  );

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
    const etaCtx = await loadEtaContext(deps.sql, restaurant, config, deps.now());
    const pickupBase = pickupEta(config);
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
          // Tiempo de recogida actual (base + hora punta + modo ocupado + cola).
          tiempo_recogida: branch.acceptsPickup
            ? etaCtx.resolve(pickupBase, ETA_SERVICE.Pickup, branch.id)
            : null,
        }))
        .sort(
          (a, b) =>
            (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        ),
    });
  });

  // Zonas de reparto activas de los locales que reparten, para elegirlas en el checkout.
  app.get("/:slug/zonas", async (c) => {
    const restaurant = c.get("restaurant");
    if (!restaurant.deliveryEnabled) {
      return c.json({ zonas: [] });
    }
    const [allBranches, config] = await Promise.all([
      loadBranches(deps.sql, restaurant.id),
      loadConfig(deps.sql, restaurant.id),
    ]);
    const branches = allBranches.filter((branch) => branchServes(branch, FULFILLMENT.Delivery));
    const names = new Map(branches.map((branch) => [branch.id, branch.name]));
    if (names.size === 0) {
      return c.json({ zonas: [] });
    }
    const rows = await deps.sql<
      {
        delivery_zone_id: number;
        zone_name: string;
        fee: string;
        min_order_amount: string | null;
        estimated_minutes_min: number | null;
        estimated_minutes_max: number | null;
        sucursal_id: number;
        tipo_tarifa: string;
        tarifa_por_km: string | null;
        tarifa_maxima: string | null;
        envio_gratis_desde: string | null;
        cubre_todo: boolean;
      }[]
    >`
      SELECT delivery_zone_id, zone_name, fee, min_order_amount, estimated_minutes_min,
             estimated_minutes_max, sucursal_id, tipo_tarifa, tarifa_por_km, tarifa_maxima,
             envio_gratis_desde, cubre_todo
      FROM   public.delivery_zone
      WHERE  restaurante_id = ${restaurant.id}
        AND  is_active = true
        AND  sucursal_id IN ${deps.sql([...names.keys()])}
      ORDER  BY zone_name
    `;
    const amount = (value: string | null) => (value === null ? null : Number(value));
    const etaCtx = await loadEtaContext(deps.sql, restaurant, config, deps.now());
    return c.json({
      zonas: rows.map((zone) => ({
        id: zone.delivery_zone_id,
        nombre: zone.zone_name,
        tipo_tarifa: zone.tipo_tarifa,
        envio: Number(zone.fee),
        por_km: amount(zone.tarifa_por_km),
        envio_maximo: amount(zone.tarifa_maxima),
        gratis_desde: amount(zone.envio_gratis_desde),
        minimo: Number(zone.min_order_amount ?? 0),
        tiempo: etaCtx.resolve(
          deliveryEta({ min: zone.estimated_minutes_min, max: zone.estimated_minutes_max }, config),
          ETA_SERVICE.Delivery,
          zone.sucursal_id,
        ),
        toda_la_ciudad: zone.cubre_todo,
        local: names.get(zone.sucursal_id) ?? null,
      })),
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
      restaurante: {
        nombre: restaurant.nombre,
        slug: restaurant.slug,
        // Lo que la web necesita para montar el checkout sin adivinar.
        recogida: restaurant.pickupEnabled && active.some((b) => b.acceptsPickup),
        reparto: restaurant.deliveryEnabled && active.some((b) => b.acceptsDelivery),
        metodos_pago: restaurant.paymentMethods,
        // false con una prueba pendiente, rechazada o vencida: la carta se ve pero no se pide.
        acepta_pedidos: await restaurantAcceptsOrders(deps.sql, restaurant.id, deps.now()),
        // Política propia del restaurante; null = la web enlaza a /<slug>/privacidad.
        privacidad_url: privacyPolicy(config).url,
      },
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

  // Datos que muestra la página genérica de privacidad (/[slug]/privacidad). Solo lo que existe.
  app.get("/:slug/privacidad", async (c) => {
    const restaurant = c.get("restaurant");
    const [config, contact, branches] = await Promise.all([
      loadConfig(deps.sql, restaurant.id),
      loadRestaurantContact(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
    ]);
    const policy = privacyPolicy(config);
    return c.json({
      restaurante: {
        nombre: restaurant.nombre,
        direccion: contact.direccion,
        telefono: contact.telefono,
      },
      locales: branches
        .filter((branch) => branch.active)
        .map((branch) => ({
          nombre: branch.name,
          direccion: branch.address?.trim() || null,
          telefono: branch.phone?.trim() || null,
        })),
      privacidad_url: policy.url,
      version: policy.version,
    });
  });

  app.post("/:slug/cotizacion", async (c) => {
    const restaurant = c.get("restaurant");
    if (quotesLimited(`${restaurant.id}:${clientIp(c.req.header(deps.clientIpHeader))}`)) {
      return fail(c, 429, API_ERROR.RateLimited);
    }
    const parsed = quoteBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const body = parsed.data;
    const unavailable = (error: string, extra: Record<string, unknown> = {}) =>
      c.json({
        disponible: false,
        motivo: QUOTE_REASON[error] ?? error,
        tipo_despacho: body.tipo_despacho,
        metodos_pago: restaurant.paymentMethods,
        ...extra,
      });

    if (!fulfillmentEnabled(restaurant, body.tipo_despacho)) {
      return unavailable(
        body.tipo_despacho === FULFILLMENT.Delivery
          ? API_ERROR.DeliveryNotAvailable
          : API_ERROR.PickupNotAvailable,
      );
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
    const point: GeoPoint | null =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : null;
    const resolved = await resolveFulfillment(deps.sql, restaurant.id, branches, config, isOpen, {
      fulfillment: body.tipo_despacho,
      ...(body.sucursal_id !== undefined ? { branchId: body.sucursal_id } : {}),
      ...(body.zona_id !== undefined ? { zoneId: body.zona_id } : {}),
      point,
      postalCode: body.codigo_postal || null,
      zoneName: body.zona_nombre || null,
      branchHint: body.texto_local || null,
    });
    if (!resolved.ok) return unavailable(resolved.error, resolved.extra);

    const { branch, delivery } = resolved;
    const eta = (await loadEtaContext(deps.sql, restaurant, config, deps.now())).resolve(
      resolved.etaBase,
      resolved.etaService,
      branch.id,
    );
    const subtotalCents = centsFromDecimal(body.subtotal);
    const charge = delivery
      ? deliveryChargeFor(subtotalCents, {
          feeCents: delivery.feeCents,
          minOrderCents: delivery.minOrderCents,
          freeFromCents: delivery.freeFromCents,
        })
      : null;
    const euros = (value: number) => value / 100;
    return c.json({
      disponible: true,
      motivo: null,
      tipo_despacho: body.tipo_despacho,
      local: { id: branch.id, nombre: branch.name, direccion: branch.address },
      zona: delivery ? { id: delivery.zoneId, nombre: delivery.zoneName } : null,
      codigo_postal: resolved.postalCode,
      distancia_km:
        delivery?.distanceKm === null || !delivery
          ? null
          : Math.round(delivery.distanceKm * 100) / 100,
      subtotal: euros(subtotalCents),
      envio: charge ? euros(charge.feeCents) : 0,
      minimo: delivery ? euros(delivery.minOrderCents) : 0,
      alcanza_minimo: charge ? charge.meetsMinimum : true,
      falta_para_minimo: charge ? euros(charge.missingCents) : 0,
      envio_gratis_desde: delivery?.freeFromCents == null ? null : euros(delivery.freeFromCents),
      total: euros(subtotalCents + (charge?.feeCents ?? 0)),
      /** null = el restaurante no tiene tiempo configurado («a confirmar»). */
      tiempo_estimado: eta,
      metodos_pago: restaurant.paymentMethods,
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
    // Sin aceptar la política de privacidad no se pide por la web (el panel y n8n no la exigen).
    if (body.privacidad_aceptada !== true) {
      return fail(c, 422, API_ERROR.PrivacyRequired, { reason: PRIVACY_REQUIRED_REASON });
    }

    // El checkout web exige el email para avisar del pedido (el panel y n8n no lo piden).
    if (!body.email) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: [{ path: "email", message: "required" }],
      });
    }

    // Antifraude (pieza Q). Un reintento de un pedido ya creado (misma clave de idempotencia) no
    // se vuelve a juzgar: el token del captcha es de un solo uso y el pedido ya cuenta en los límites.
    const replay = await orderExistsForKey(deps.sql, restaurant.id, idempotencyKey);
    if (!replay) {
      if (deps.verifyCaptcha) {
        const human = await deps.verifyCaptcha(
          body.captcha_token,
          c.req.header(deps.clientIpHeader) ?? null,
        );
        if (!human) return fail(c, 422, API_ERROR.CaptchaFailed, { reason: CAPTCHA_FAILED_REASON });
      }
      // Mensaje neutro: la web no revela que el teléfono está bloqueado.
      if (await isPhoneBlocked(deps.sql, restaurant.id, body.telefono)) {
        return fail(c, 422, API_ERROR.OrderNotAccepted, { reason: ORDER_NOT_ACCEPTED_REASON });
      }
      const limits = phoneLimits(await loadConfig(deps.sql, restaurant.id));
      const hit = await checkPhoneLimits(deps.sql, restaurant.id, body.telefono, limits);
      if (hit) return fail(c, 429, API_ERROR.RateLimited, { reason: PHONE_LIMIT_REASON });
    }

    const placed = await placeOrder(
      deps,
      restaurant,
      body,
      idempotencyKey,
      ORDER_CHANNEL.Web,
      undefined,
      { promotions: body.acepta_promociones === true },
    );
    if (!placed.ok) return fail(c, 422, placed.error, placed.extra);
    const { order, branch, eta, priced } = placed;

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
