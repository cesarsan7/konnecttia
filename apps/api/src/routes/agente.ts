import { allergenLabel, ETA_SERVICE, FULFILLMENT, searchMenu } from "@konnecttia/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { resolveAgentChannel } from "../middleware/agent";
import {
  agentPresentation,
  agentSettings,
  loadAgentCustomer,
  loadRestaurantMessages,
} from "../repositories/agent";
import {
  activeVariants,
  availabilityBranch,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CART_STATE,
  type CartLine,
  cartExpiryMinutes,
  closeCart,
  createCart,
  findOpenCart,
  lineErrors,
  loadResolveContext,
  markCartConfirmed,
  sameLine,
  saveCartFulfillment,
  saveCartLines,
  saveFrequentAddress,
  viewCart,
} from "../repositories/agent-cart";
import { isPhoneBlocked } from "../repositories/antifraud";
import {
  type BranchRecord,
  loadBranches,
  openChecker,
  unavailableItems,
} from "../repositories/branches";
import { loadCatalogForItems, loadPublicMenu, type PublicMenu } from "../repositories/catalog";
import { loadEtaContext } from "../repositories/eta";
import { resolveFulfillment } from "../repositories/fulfillment";
import { findOrderByTrackingToken, ORDER_CHANNEL } from "../repositories/orders";
import { placeOrder } from "../repositories/place-order";
import {
  fulfillmentEnabled,
  loadConfig,
  openOverride,
  pickupEta,
} from "../repositories/restaurants";
import { restaurantAcceptsOrders } from "../repositories/trial";
import { orderBodySchema, QUOTE_REASON } from "./public";

/** Teléfono del cliente en E.164 con «+» (el adaptador de canal ya lo normaliza). */
const phoneSchema = z.string().regex(/^\+[1-9][0-9]{6,14}$/);
const branchIdSchema = z.coerce.number().int().positive();
const MAX_QUERY_LENGTH = 200;
const MAX_MATCHES = 8;

/** Operaciones sobre el carrito. */
export const CART_OP = {
  Add: "agregar",
  Remove: "quitar",
  Quantity: "cantidad",
  Note: "nota",
  Clear: "vaciar",
} as const;

/** Por qué una operación no se aplicó (en `pendientes`). */
export const CART_PENDING = {
  ProductNotFound: "producto_no_encontrado",
  ProductUnavailable: "producto_no_disponible",
  ChooseVariant: "elegir_variante",
  InvalidVariant: "variante_no_valida",
  LineNotFound: "linea_no_existe",
  TooManyLines: "demasiadas_lineas",
} as const;

/** Rechazos de despacho y confirmación (en `reason` o `motivo`). */
export const CART_REJECT = {
  EmptyCart: "carrito_vacio",
  FulfillmentRequired: "falta_despacho",
  PickupNeedsConfirmation: "cambio_a_recogida_sin_confirmar",
  AddressRequired: "direccion_necesaria",
  LinesUnavailable: "lineas_no_disponibles",
  MinimumNotMet: "minimo_no_alcanzado",
} as const;

/** Clave de idempotencia del pedido: un carrito crea como mucho un pedido. */
const AGENT_IDEMPOTENCY_PREFIX = "agente-carrito-";

const quantitySchema = z.number().int().min(1).max(CART_MAX_QUANTITY);
const lineSchema = z.number().int().min(1).max(CART_MAX_LINES);
const noteSchema = z.string().trim().max(200);

const cartOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal(CART_OP.Add),
    menu_item_id: z.number().int().positive(),
    menu_variant_id: z.number().int().positive().optional(),
    cantidad: quantitySchema.default(1),
    extras: z
      .array(
        z.object({ extra_id: z.number().int().positive(), cantidad: quantitySchema.default(1) }),
      )
      .max(30)
      .default([]),
    nota: noteSchema.optional(),
  }),
  z.object({ op: z.literal(CART_OP.Remove), linea: lineSchema }),
  z.object({ op: z.literal(CART_OP.Quantity), linea: lineSchema, cantidad: quantitySchema }),
  z.object({ op: z.literal(CART_OP.Note), linea: lineSchema, nota: noteSchema }),
  z.object({ op: z.literal(CART_OP.Clear) }),
]);

const cartBodySchema = z.object({
  telefono: phoneSchema,
  nuevo: z.boolean().default(false),
  operaciones: z.array(cartOperationSchema).min(1).max(20),
});

const despachoBodySchema = z
  .object({
    telefono: phoneSchema,
    tipo: z.enum([FULFILLMENT.Pickup, FULFILLMENT.Delivery]),
    sucursal_id: branchIdSchema.optional(),
    texto_local: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
    direccion: z.string().trim().max(300).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    codigo_postal: z.string().trim().max(10).optional(),
    zona_nombre: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
    cambio_confirmado: z.boolean().default(false),
  })
  .refine((body) => (body.lat === undefined) === (body.lng === undefined), {
    message: "lat y lng van juntas",
    path: ["lng"],
  });

const confirmBodySchema = z.object({
  telefono: phoneSchema,
  nombre: z.string().trim().min(1).max(120),
  metodo_pago: z.string().trim().min(1).max(40),
  notas: z.string().trim().max(500).optional(),
});

const cartaQuerySchema = z.object({
  sucursal_id: branchIdSchema.optional(),
  q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  categoria: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
});

/**
 * Local con el que se consulta la carta: el pedido explícitamente (si es de este restaurante y
 * está activo), el del número de WhatsApp o, si solo hay uno activo, ese. null = sin local.
 */
function pickBranch(
  active: readonly BranchRecord[],
  requested: number | undefined,
  channelBranch: number | null,
): BranchRecord | null | "not_found" {
  if (requested !== undefined) {
    return active.find((branch) => branch.id === requested) ?? "not_found";
  }
  if (channelBranch !== null) {
    return active.find((branch) => branch.id === channelBranch) ?? null;
  }
  return active.length === 1 ? (active[0] ?? null) : null;
}

type AgentProduct = {
  readonly id: number;
  readonly nombre: string;
  readonly categoria: string;
  readonly descripcion: string | null;
  readonly variantes: readonly { id: number; nombre: string; precio: number }[];
  readonly extras: readonly { id: number; nombre: string; precio: number }[];
  /** Texto listo para el cliente; nunca dice «sin alérgenos» si el dato falta. */
  readonly alergenos: string;
};

function agentProducts(menu: PublicMenu, hidden: ReadonlySet<number>): AgentProduct[] {
  return menu.categories.flatMap((category) =>
    category.items
      .filter((item) => !hidden.has(item.id))
      .map((item) => ({
        id: item.id,
        nombre: item.name,
        categoria: category.name,
        descripcion: item.description,
        variantes: item.variants.map((variant) => ({
          id: variant.id,
          nombre: variant.name,
          precio: variant.price,
        })),
        extras: item.extras.map((extra) => ({
          id: extra.id,
          nombre: extra.name,
          precio: extra.price,
        })),
        alergenos: allergenLabel(item.allergens),
      })),
  );
}

/**
 * Rutas para el agente de WhatsApp en n8n (ADR 0012, punto 5): la conversación vive en n8n; los
 * datos y las reglas, aquí, con la misma lógica que la web.
 */
export function agenteRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  app.use("/canales/:canalId/*", resolveAgentChannel(deps));

  /**
   * Todo lo que el agente necesita al empezar un turno: identidad, si puede tomar pedidos, locales
   * abiertos y datos del cliente en este restaurante.
   */
  app.get("/canales/:canalId/contexto", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const telefono = phoneSchema.safeParse(c.req.query("telefono"));
    if (!telefono.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: [{ path: "telefono", message: "E.164 con «+»" }],
      });
    }
    const [config, branches, messages, customer, accepts, blocked] = await Promise.all([
      loadConfig(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
      loadRestaurantMessages(deps.sql, restaurant.id),
      loadAgentCustomer(deps.sql, restaurant.id, telefono.data),
      restaurantAcceptsOrders(deps.sql, restaurant.id, deps.now()),
      isPhoneBlocked(deps.sql, restaurant.id, telefono.data),
    ]);
    const settings = agentSettings(config);
    const active = branches.filter((branch) => branch.active);
    const isOpen = await openChecker(
      deps.sql,
      restaurant,
      active,
      openOverride(config),
      deps.now(),
    );
    const etaCtx = await loadEtaContext(deps.sql, restaurant, config, deps.now());
    const pickupBase = pickupEta(config);
    const locales = active.map((branch) => ({
      id: branch.id,
      nombre: branch.name,
      direccion: branch.address,
      abierto: isOpen(branch),
      recogida: branch.acceptsPickup && restaurant.pickupEnabled,
      reparto: branch.acceptsDelivery && restaurant.deliveryEnabled,
      tiempo_recogida: branch.acceptsPickup
        ? etaCtx.resolve(pickupBase, ETA_SERVICE.Pickup, branch.id)
        : null,
    }));
    const channelBranch = locales.find((local) => local.id === channel.sucursalId) ?? null;
    // Un número de un local concreto responde por ese local: si está cerrado, no se pide por él.
    const abierto = channelBranch ? channelBranch.abierto : locales.some((local) => local.abierto);

    return c.json({
      restaurante: { id: restaurant.id, nombre: restaurant.nombre, slug: restaurant.slug },
      agente: {
        activo: settings.activo,
        presentacion: agentPresentation(restaurant.nombre, settings.nombreVisible),
        nombre_visible: settings.nombreVisible,
        tono: settings.tono,
        instrucciones: settings.instrucciones,
        pausa_minutos: settings.pausaMinutos,
        pausa_derivar_minutos: settings.pausaDerivarMinutos,
      },
      mensajes: messages,
      canal: { id: channel.id, sucursal_id: channel.sucursalId },
      local_del_canal: channelBranch,
      abierto,
      // Mensaje neutro si no: el agente no dice el motivo (prueba vencida o teléfono bloqueado).
      puede_pedir: accepts && !blocked,
      recogida: restaurant.pickupEnabled && locales.some((local) => local.recogida),
      reparto: restaurant.deliveryEnabled && locales.some((local) => local.reparto),
      metodos_pago: restaurant.paymentMethods,
      locales,
      cliente: {
        telefono: telefono.data,
        nombre: customer.nombre,
        direccion_frecuente: customer.direccionFrecuente,
      },
    });
  });

  /**
   * Carta real para el agente: solo lo activo y, con local, sin lo agotado allí. Con `q`, los
   * productos que mejor encajan con lo que escribió el cliente (con la variante y los extras que
   * nombró); el agente elige entre ellos o pregunta, nunca inventa.
   */
  app.get("/canales/:canalId/carta", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const parsed = cartaQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    const query = parsed.data;
    const [menu, branches] = await Promise.all([
      loadPublicMenu(deps.sql, restaurant.id),
      loadBranches(deps.sql, restaurant.id),
    ]);
    const branch = pickBranch(
      branches.filter((candidate) => candidate.active),
      query.sucursal_id,
      channel.sucursalId,
    );
    if (branch === "not_found") {
      return fail(c, 404, API_ERROR.BranchNotAvailable);
    }
    const hidden = branch ? await unavailableItems(deps.sql, branch.id) : new Set<number>();
    let products = agentProducts(menu, hidden);
    if (query.categoria) {
      const wanted = searchMenu(
        query.categoria,
        products.map((product) => ({
          id: product.id,
          name: "",
          category: product.categoria,
          description: null,
          variants: [],
          extras: [],
        })),
        products.length,
      );
      const ids = new Set(wanted.map((match) => match.itemId));
      products = products.filter((product) => ids.has(product.id));
    }
    const local = branch ? { id: branch.id, nombre: branch.name } : null;

    if (!query.q) {
      return c.json({ local, productos: products });
    }
    const byId = new Map(products.map((product) => [product.id, product]));
    const matches = searchMenu(
      query.q,
      products.map((product) => ({
        id: product.id,
        name: product.nombre,
        category: product.categoria,
        description: product.descripcion,
        variants: product.variantes.map((variant) => ({ id: variant.id, name: variant.nombre })),
        extras: product.extras.map((extra) => ({ id: extra.id, name: extra.nombre })),
      })),
      MAX_MATCHES,
    );
    return c.json({
      local,
      candidatos: matches.flatMap((match) => {
        const product = byId.get(match.itemId);
        if (!product) return [];
        return [
          {
            ...product,
            puntuacion: Math.round(match.score * 100) / 100,
            variante_id: match.variantId,
            extra_ids: match.extraIds,
          },
        ];
      }),
    });
  });

  // -------------------------------------------------------------------------
  // Carrito (migración 0040). Precios, disponibilidad, envío y mínimo: siempre de la API.
  // -------------------------------------------------------------------------

  const invalid = (c: Context<AppEnv>, issues: z.core.$ZodIssue[]) =>
    fail(c, 400, API_ERROR.InvalidBody, {
      issues: issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  const reason = (error: string) => QUOTE_REASON[error] ?? error;

  app.get("/canales/:canalId/carrito", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const telefono = phoneSchema.safeParse(c.req.query("telefono"));
    if (!telefono.success) return invalid(c, telefono.error.issues);
    const ctx = await loadResolveContext(deps, restaurant);
    const { cart, expired } = await findOpenCart(
      deps.sql,
      channel,
      telefono.data,
      deps.now(),
      cartExpiryMinutes(ctx.config),
    );
    return c.json({
      carrito: cart ? await viewCart(deps, restaurant, channel, cart, reason, ctx) : null,
      carrito_anterior_caducado: expired,
    });
  });

  /**
   * Cambia el carrito con ids de la carta. Lo que no se puede aplicar (falta elegir variante,
   * agotado, extra que no es del producto…) vuelve en `pendientes` con el motivo y las opciones;
   * el resto se aplica. `nuevo: true` descarta el carrito abierto (el cliente pidió otro pedido).
   */
  app.put("/canales/:canalId/carrito", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const parsed = cartBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const body = parsed.data;
    const now = deps.now();
    const ctx = await loadResolveContext(deps, restaurant);
    const found = await findOpenCart(
      deps.sql,
      channel,
      body.telefono,
      now,
      cartExpiryMinutes(ctx.config),
    );
    let cart = found.cart;
    if (cart && body.nuevo) {
      await closeCart(deps.sql, cart.id, CART_STATE.Discarded);
      cart = null;
    }
    cart ??= await createCart(deps.sql, channel, body.telefono, now);

    const itemIds = new Set(cart.lineas.map((line) => line.menu_item_id));
    for (const operation of body.operaciones) {
      if (operation.op === CART_OP.Add) itemIds.add(operation.menu_item_id);
    }
    const branch = availabilityBranch(ctx, cart, channel);
    const [catalog, hidden] = await Promise.all([
      loadCatalogForItems(deps.sql, restaurant.id, [...itemIds]),
      branch ? unavailableItems(deps.sql, branch.id) : Promise.resolve(new Set<number>()),
    ]);

    const lines: CartLine[] = [...cart.lineas];
    const removals = new Set<number>();
    const pending: Record<string, unknown>[] = [];
    let changed = false;
    body.operaciones.forEach((operation, position) => {
      const reject = (motivo: string, extra: Record<string, unknown> = {}) =>
        pending.push({ operacion: position + 1, motivo, ...extra });
      const exists = (linea: number) => linea >= 1 && linea <= lines.length;
      switch (operation.op) {
        case CART_OP.Add: {
          const item = catalog.get(operation.menu_item_id);
          if (!item) return reject(CART_PENDING.ProductNotFound);
          const producto = item.name;
          if (!item.active || hidden.has(item.id)) {
            return reject(CART_PENDING.ProductUnavailable, { producto });
          }
          const variants = activeVariants(item);
          const opciones = variants.map((variant) => ({
            id: variant.id,
            nombre: variant.name,
            precio: variant.priceCents / 100,
          }));
          let variantId = operation.menu_variant_id;
          if (variantId === undefined) {
            if (variants.length !== 1) {
              return reject(CART_PENDING.ChooseVariant, { producto, opciones });
            }
            variantId = variants[0]?.id;
          } else if (!variants.some((variant) => variant.id === variantId)) {
            return reject(CART_PENDING.InvalidVariant, { producto, opciones });
          }
          if (variantId === undefined) return reject(CART_PENDING.ProductUnavailable, { producto });
          const line: CartLine = {
            menu_item_id: item.id,
            menu_variant_id: variantId,
            cantidad: operation.cantidad,
            extras: operation.extras.map((extra) => ({
              extra_id: extra.extra_id,
              cantidad: extra.cantidad,
            })),
            nota: operation.nota || null,
          };
          const errors = lineErrors(catalog, line);
          if (errors.length > 0) {
            return reject(errors[0]?.code ?? CART_PENDING.ProductUnavailable, { producto });
          }
          const same = lines.findIndex((existing) => sameLine(existing, line));
          const current = lines[same];
          if (current) {
            const cantidad = Math.min(current.cantidad + line.cantidad, CART_MAX_QUANTITY);
            lines[same] = { ...current, cantidad };
          } else {
            if (lines.length >= CART_MAX_LINES) return reject(CART_PENDING.TooManyLines);
            lines.push(line);
          }
          changed = true;
          return;
        }
        case CART_OP.Remove:
          if (!exists(operation.linea)) return reject(CART_PENDING.LineNotFound);
          removals.add(operation.linea - 1);
          changed = true;
          return;
        case CART_OP.Quantity: {
          const current = lines[operation.linea - 1];
          if (!current) return reject(CART_PENDING.LineNotFound);
          lines[operation.linea - 1] = { ...current, cantidad: operation.cantidad };
          changed = true;
          return;
        }
        case CART_OP.Note: {
          const current = lines[operation.linea - 1];
          if (!current) return reject(CART_PENDING.LineNotFound);
          lines[operation.linea - 1] = { ...current, nota: operation.nota || null };
          changed = true;
          return;
        }
        case CART_OP.Clear:
          lines.forEach((_, index) => {
            removals.add(index);
          });
          changed = true;
          return;
      }
    });
    if (changed) {
      const kept = lines.filter((_, index) => !removals.has(index));
      cart = await saveCartLines(deps.sql, cart, kept, now);
    }
    return c.json({
      carrito: await viewCart(deps, restaurant, channel, cart, reason, ctx),
      pendientes: pending,
      carrito_anterior_caducado: found.expired,
    });
  });

  /**
   * Recogida o reparto del carrito, con las mismas reglas que la cotización de la web. Pasar de
   * reparto a recogida exige `cambio_confirmado: true` (el cliente lo confirmó expresamente).
   */
  app.put("/canales/:canalId/carrito/despacho", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const parsed = despachoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const body = parsed.data;
    const now = deps.now();
    const ctx = await loadResolveContext(deps, restaurant);
    const { cart } = await findOpenCart(
      deps.sql,
      channel,
      body.telefono,
      now,
      cartExpiryMinutes(ctx.config),
    );
    if (!cart || cart.lineas.length === 0) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: CART_REJECT.EmptyCart });
    }
    if (
      cart.tipoDespacho === FULFILLMENT.Delivery &&
      body.tipo === FULFILLMENT.Pickup &&
      !body.cambio_confirmado
    ) {
      return fail(c, 409, API_ERROR.Conflict, { reason: CART_REJECT.PickupNeedsConfirmation });
    }
    const unavailable = (error: string, extra: Record<string, unknown> = {}) =>
      c.json({ disponible: false, motivo: reason(error), tipo_despacho: body.tipo, ...extra });
    if (!fulfillmentEnabled(restaurant, body.tipo)) {
      return unavailable(
        body.tipo === FULFILLMENT.Delivery
          ? API_ERROR.DeliveryNotAvailable
          : API_ERROR.PickupNotAvailable,
      );
    }
    const point =
      body.lat !== undefined && body.lng !== undefined ? { lat: body.lat, lng: body.lng } : null;
    if (body.tipo === FULFILLMENT.Delivery && !body.direccion) {
      return unavailable(CART_REJECT.AddressRequired);
    }
    // Recogida: el local pedido, el que nombra el cliente o el del número de WhatsApp.
    const branchId =
      body.sucursal_id ?? (body.texto_local ? undefined : (channel.sucursalId ?? undefined));
    const resolved = await resolveFulfillment(
      deps.sql,
      restaurant.id,
      ctx.branches,
      ctx.config,
      ctx.isOpen,
      body.tipo === FULFILLMENT.Pickup
        ? {
            fulfillment: body.tipo,
            ...(branchId !== undefined ? { branchId } : {}),
            point,
            branchHint: body.texto_local || null,
          }
        : {
            fulfillment: body.tipo,
            point,
            postalCode: body.codigo_postal || null,
            zoneName: body.zona_nombre || null,
          },
    );
    if (!resolved.ok) return unavailable(resolved.error, resolved.extra);

    const delivery = body.tipo === FULFILLMENT.Delivery;
    const saved = await saveCartFulfillment(
      deps.sql,
      cart,
      {
        tipoDespacho: body.tipo,
        sucursalId: resolved.branch.id,
        direccion: delivery ? (body.direccion ?? null) : null,
        point: delivery ? point : null,
        zonaId: resolved.delivery?.zoneId ?? null,
      },
      now,
    );
    if (delivery && body.direccion) {
      await saveFrequentAddress(deps.sql, restaurant.id, body.telefono, body.direccion, point);
    }
    return c.json({
      disponible: true,
      carrito: await viewCart(deps, restaurant, channel, saved, reason, ctx),
    });
  });

  /**
   * Confirma el carrito: crea el pedido con `placeOrder` (canal whatsapp), exactamente con las
   * reglas de la web (local abierto, zona, mínimo, agotados, forma de pago, precios).
   */
  app.post("/canales/:canalId/carrito/confirmar", async (c) => {
    const restaurant = c.get("restaurant");
    const channel = c.get("agentChannel");
    const parsed = confirmBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return invalid(c, parsed.error.issues);
    const body = parsed.data;
    const ctx = await loadResolveContext(deps, restaurant);
    const { cart } = await findOpenCart(
      deps.sql,
      channel,
      body.telefono,
      deps.now(),
      cartExpiryMinutes(ctx.config),
    );
    if (!cart || cart.lineas.length === 0) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: CART_REJECT.EmptyCart });
    }
    if (!cart.tipoDespacho) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: CART_REJECT.FulfillmentRequired });
    }
    // Mensaje neutro, como en la web: no se dice que el teléfono está bloqueado.
    if (await isPhoneBlocked(deps.sql, restaurant.id, body.telefono)) {
      return fail(c, 422, API_ERROR.OrderNotAccepted);
    }
    const view = await viewCart(deps, restaurant, channel, cart, reason, ctx);
    if (view.problemas.length > 0) {
      return fail(c, 422, API_ERROR.Unprocessable, {
        reason: CART_REJECT.LinesUnavailable,
        problemas: view.problemas,
      });
    }
    if (view.despacho && !view.despacho.disponible) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: view.despacho.motivo });
    }
    if (view.despacho && !view.despacho.alcanza_minimo) {
      return fail(c, 422, API_ERROR.Unprocessable, {
        reason: CART_REJECT.MinimumNotMet,
        minimo: view.despacho.minimo,
        falta_para_minimo: view.despacho.falta_para_minimo,
      });
    }
    if (!restaurant.paymentMethods.includes(body.metodo_pago)) {
      return fail(c, 422, API_ERROR.PaymentMethodNotAccepted, {
        accepted: restaurant.paymentMethods,
      });
    }

    const delivery = cart.tipoDespacho === FULFILLMENT.Delivery;
    const order = orderBodySchema.safeParse({
      nombre: body.nombre,
      telefono: body.telefono,
      tipo_despacho: cart.tipoDespacho,
      metodo_pago: body.metodo_pago,
      ...(delivery && cart.direccion ? { direccion: cart.direccion } : {}),
      ...(delivery && cart.zonaId !== null ? { zona_id: cart.zonaId } : {}),
      ...(delivery && cart.point ? { lat: cart.point.lat, lng: cart.point.lng } : {}),
      ...(!delivery && cart.sucursalId !== null ? { sucursal_id: cart.sucursalId } : {}),
      ...(body.notas ? { notas: body.notas } : {}),
      items: cart.lineas.map((line) => ({
        menu_item_id: line.menu_item_id,
        menu_variant_id: line.menu_variant_id,
        quantity: line.cantidad,
        extras: line.extras.map((extra) => ({
          extra_id: extra.extra_id,
          quantity: extra.cantidad,
        })),
        ...(line.nota ? { nota: line.nota } : {}),
      })),
    });
    if (!order.success) return invalid(c, order.error.issues);

    const placed = await placeOrder(
      deps,
      restaurant,
      order.data,
      `${AGENT_IDEMPOTENCY_PREFIX}${cart.id}`,
      ORDER_CHANNEL.WhatsApp,
    );
    if (!placed.ok) return fail(c, 422, placed.error, placed.extra);
    await markCartConfirmed(deps.sql, cart.id, placed.order.id);

    const tracked = await findOrderByTrackingToken(deps.sql, placed.order.trackingToken);
    const base = deps.panelUrl?.replace(/\/+$/, "") ?? null;
    return c.json(
      {
        pedido_codigo: placed.order.pedidoCodigo,
        estado: placed.order.estado,
        estado_pago: tracked?.estadoPago ?? null,
        seguimiento_url: base
          ? `${base}/${restaurant.slug}/pedido/${placed.order.trackingToken}`
          : null,
        local: {
          id: placed.branch.id,
          nombre: placed.branch.name,
          direccion: placed.branch.address,
        },
        tipo_despacho: cart.tipoDespacho,
        direccion: delivery ? cart.direccion : null,
        tiempo_estimado: placed.eta,
        lineas: view.lineas,
        subtotal: placed.priced.quote.subtotalCents / 100,
        suplementos: placed.priced.quote.surcharges.map((surcharge) => ({
          concepto: surcharge.label,
          importe: surcharge.amountCents / 100,
        })),
        costo_envio: placed.priced.quote.deliveryFeeCents / 100,
        total: placed.order.totalCents / 100,
        metodo_pago: body.metodo_pago,
        // Solo con transferencia o Bizum pendientes: los datos para pagar (como el seguimiento web).
        datos_pago: tracked?.datosBancarios ?? null,
      },
      placed.order.created ? 201 : 200,
    );
  });

  return app;
}
