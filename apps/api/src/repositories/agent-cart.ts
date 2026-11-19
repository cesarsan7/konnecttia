import {
  type Branch,
  type Catalog,
  cents,
  deliveryChargeFor,
  FULFILLMENT,
  type Fulfillment,
  type GeoPoint,
  type MenuItem,
  type PricingError,
  priceOrder,
  type RequestedLine,
} from "@konnecttia/domain";
import type { AppDeps } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR } from "../lib/http";
import type { AgentChannel } from "./agent";
import { type BranchRecord, loadBranches, openChecker, unavailableItems } from "./branches";
import { loadCatalogForItems } from "./catalog";
import { loadEtaContext } from "./eta";
import { type FulfillmentResolution, resolveFulfillment } from "./fulfillment";
import {
  CONFIG_KEY,
  fulfillmentEnabled,
  loadConfig,
  openOverride,
  type Restaurant,
  surchargeRules,
} from "./restaurants";

/**
 * Carrito del agente de WhatsApp (migración 0040). Guarda ids y cantidades; el precio, la
 * disponibilidad, el envío y el mínimo se calculan siempre aquí con la carta y la configuración
 * vigentes, igual que en la web. El pedido se crea al confirmar, con `placeOrder`.
 */

export const CART_STATE = {
  Open: "abierto",
  Confirmed: "confirmado",
  Expired: "caducado",
  Discarded: "descartado",
} as const;

/** Máximo de líneas y de unidades por línea (los mismos que acepta el pedido). */
export const CART_MAX_LINES = 50;
export const CART_MAX_QUANTITY = 99;

export type CartLine = {
  readonly menu_item_id: number;
  readonly menu_variant_id: number;
  readonly cantidad: number;
  readonly extras: readonly { readonly extra_id: number; readonly cantidad: number }[];
  readonly nota: string | null;
};

export type Cart = {
  readonly id: number;
  readonly restauranteId: number;
  readonly canalId: number;
  readonly telefono: string;
  readonly lineas: readonly CartLine[];
  readonly tipoDespacho: Fulfillment | null;
  readonly sucursalId: number | null;
  readonly direccion: string | null;
  readonly point: GeoPoint | null;
  readonly zonaId: number | null;
  readonly updatedAt: Date;
};

type CartRow = {
  id: string;
  restaurante_id: number;
  canal_id: string;
  telefono: string;
  lineas: CartLine[];
  tipo_despacho: Fulfillment | null;
  sucursal_id: string | null;
  direccion: string | null;
  lat: string | null;
  lng: string | null;
  zona_id: number | null;
  updated_at: Date;
};

function toCart(row: CartRow): Cart {
  return {
    id: Number(row.id),
    restauranteId: row.restaurante_id,
    canalId: Number(row.canal_id),
    telefono: row.telefono,
    lineas: Array.isArray(row.lineas) ? row.lineas : [],
    tipoDespacho: row.tipo_despacho,
    sucursalId: row.sucursal_id === null ? null : Number(row.sucursal_id),
    direccion: row.direccion,
    point:
      row.lat === null || row.lng === null ? null : { lat: Number(row.lat), lng: Number(row.lng) },
    zonaId: row.zona_id,
    updatedAt: row.updated_at,
  };
}

/** Minutos sin cambios tras los que caduca el carrito (`cart_expiry_minutes`). null = no caduca. */
export function cartExpiryMinutes(config: ReadonlyMap<string, string>): number | null {
  const minutes = Number(config.get(CONFIG_KEY.CartExpiryMinutes)?.trim());
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}

export type OpenCartResult = { readonly cart: Cart | null; readonly expired: boolean };

/**
 * Carrito abierto del cliente en este número. Si lleva más de `expiryMinutes` sin cambios se
 * marca caducado y no se devuelve (el cliente empieza uno nuevo).
 */
export async function findOpenCart(
  sql: Sql,
  channel: AgentChannel,
  telefono: string,
  now: Date,
  expiryMinutes: number | null,
): Promise<OpenCartResult> {
  const rows = await sql<CartRow[]>`
    SELECT id, restaurante_id, canal_id, telefono, lineas, tipo_despacho, sucursal_id, direccion,
           lat, lng, zona_id, updated_at
    FROM   public.agente_carrito
    WHERE  canal_id = ${channel.id} AND restaurante_id = ${channel.restauranteId}
      AND  telefono = ${telefono} AND estado = ${CART_STATE.Open}
    LIMIT  1
  `;
  const row = rows[0];
  if (!row) return { cart: null, expired: false };
  const cart = toCart(row);
  if (expiryMinutes !== null && now.getTime() - cart.updatedAt.getTime() > expiryMinutes * 60_000) {
    await closeCart(sql, cart.id, CART_STATE.Expired);
    return { cart: null, expired: true };
  }
  return { cart, expired: false };
}

/** Horas durante las que el agente recuerda que un carrito caducó (para avisar al cliente). */
const EXPIRED_CART_MEMORY_HOURS = 24;

/**
 * Carrito que caducó por inactividad y con el que el cliente no ha vuelto a empezar nada: el último
 * carrito del número, si está caducado, tiene líneas y es reciente. El cron de mantenimiento lo cierra
 * antes de que el cliente vuelva, así que el agente solo se entera por aquí.
 */
export async function findRecentExpiredCart(
  sql: Sql,
  channel: AgentChannel,
  telefono: string,
  now: Date,
): Promise<Cart | null> {
  const rows = await sql<(CartRow & { estado: string })[]>`
    SELECT id, restaurante_id, canal_id, telefono, lineas, tipo_despacho, sucursal_id, direccion,
           lat, lng, zona_id, updated_at, estado
    FROM   public.agente_carrito
    WHERE  canal_id = ${channel.id} AND restaurante_id = ${channel.restauranteId}
      AND  telefono = ${telefono}
    ORDER  BY updated_at DESC, id DESC
    LIMIT  1
  `;
  const row = rows[0];
  if (!row || row.estado !== CART_STATE.Expired) return null;
  if (now.getTime() - row.updated_at.getTime() > EXPIRED_CART_MEMORY_HOURS * 3_600_000) return null;
  const cart = toCart(row);
  return cart.lineas.length > 0 ? cart : null;
}

export async function createCart(
  sql: Sql,
  channel: AgentChannel,
  telefono: string,
  now: Date,
): Promise<Cart> {
  const [row] = await sql<CartRow[]>`
    INSERT INTO public.agente_carrito (restaurante_id, canal_id, telefono, created_at, updated_at)
    VALUES (${channel.restauranteId}, ${channel.id}, ${telefono}, ${now}, ${now})
    RETURNING id, restaurante_id, canal_id, telefono, lineas, tipo_despacho, sucursal_id, direccion,
              lat, lng, zona_id, updated_at
  `;
  if (!row) throw new Error("El INSERT del carrito no devolvió filas");
  return toCart(row);
}

export async function closeCart(
  sql: Sql,
  cartId: number,
  state: typeof CART_STATE.Expired | typeof CART_STATE.Discarded,
): Promise<void> {
  await sql`
    UPDATE public.agente_carrito SET estado = ${state}, updated_at = now()
    WHERE  id = ${cartId} AND estado = ${CART_STATE.Open}
  `;
}

export async function saveCartLines(
  sql: Sql,
  cart: Cart,
  lineas: readonly CartLine[],
  now: Date,
): Promise<Cart> {
  await sql`
    UPDATE public.agente_carrito
    SET    lineas = ${sql.json(lineas as unknown as CartLine[])}, updated_at = ${now}
    WHERE  id = ${cart.id} AND estado = ${CART_STATE.Open}
  `;
  return { ...cart, lineas, updatedAt: now };
}

export type CartFulfillment = {
  readonly tipoDespacho: Fulfillment;
  readonly sucursalId: number;
  readonly direccion: string | null;
  readonly point: GeoPoint | null;
  readonly zonaId: number | null;
};

export async function saveCartFulfillment(
  sql: Sql,
  cart: Cart,
  fulfillment: CartFulfillment,
  now: Date,
): Promise<Cart> {
  await sql`
    UPDATE public.agente_carrito
    SET    tipo_despacho = ${fulfillment.tipoDespacho}, sucursal_id = ${fulfillment.sucursalId},
           direccion = ${fulfillment.direccion}, lat = ${fulfillment.point?.lat ?? null},
           lng = ${fulfillment.point?.lng ?? null}, zona_id = ${fulfillment.zonaId},
           updated_at = ${now}
    WHERE  id = ${cart.id} AND estado = ${CART_STATE.Open}
  `;
  return { ...cart, ...fulfillment, updatedAt: now };
}

export async function markCartConfirmed(sql: Sql, cartId: number, pedidoId: number): Promise<void> {
  await sql`
    UPDATE public.agente_carrito
    SET    estado = ${CART_STATE.Confirmed}, pedido_id = ${pedidoId}, updated_at = now()
    WHERE  id = ${cartId}
  `;
}

/** Dirección habitual del cliente en ESTE restaurante (nunca en otro con el mismo teléfono). */
export async function saveFrequentAddress(
  sql: Sql,
  restauranteId: number,
  telefono: string,
  direccion: string,
  point: GeoPoint | null,
): Promise<void> {
  await sql`
    INSERT INTO public.usuarios (restaurante_id, telefono, direccion_frecuente, lat_frecuente,
                                 long_frecuente, created_at, updated_at)
    VALUES (${restauranteId}, ${telefono}, ${direccion}, ${point?.lat ?? null},
            ${point?.lng ?? null}, now(), now())
    ON CONFLICT (restaurante_id, telefono) DO UPDATE
    SET direccion_frecuente = EXCLUDED.direccion_frecuente,
        lat_frecuente = COALESCE(EXCLUDED.lat_frecuente, public.usuarios.lat_frecuente),
        long_frecuente = COALESCE(EXCLUDED.long_frecuente, public.usuarios.long_frecuente),
        updated_at = now()
  `;
}

/** Línea del carrito en el formato que entiende `priceOrder`. */
export function requestedLine(line: CartLine): RequestedLine {
  return {
    itemId: line.menu_item_id,
    variantId: line.menu_variant_id,
    quantity: line.cantidad,
    modifiers: line.extras.map((extra) => ({ optionId: extra.extra_id, quantity: extra.cantidad })),
    ...(line.nota ? { note: line.nota } : {}),
  };
}

/** Variantes que el cliente puede elegir de un producto (activas). */
export function activeVariants(item: MenuItem) {
  return item.variants.filter((variant) => variant.active);
}

/** Dos líneas son la misma si coinciden producto, variante, extras y nota: se suman. */
export function sameLine(a: CartLine, b: CartLine): boolean {
  const extras = (line: CartLine) =>
    [...line.extras]
      .sort((x, y) => x.extra_id - y.extra_id)
      .map((extra) => `${extra.extra_id}x${extra.cantidad}`)
      .join(",");
  return (
    a.menu_item_id === b.menu_item_id &&
    a.menu_variant_id === b.menu_variant_id &&
    (a.nota ?? "") === (b.nota ?? "") &&
    extras(a) === extras(b)
  );
}

/** Errores de precio de una sola línea (producto, variante, extras y cantidades). */
export function lineErrors(catalog: Catalog, line: CartLine): readonly PricingError[] {
  const result = priceOrder(catalog, [requestedLine(line)], {
    fulfillment: FULFILLMENT.Pickup,
    surcharges: [],
  });
  return result.ok ? [] : result.errors;
}

// ---------------------------------------------------------------------------
// Vista del carrito: precios, disponibilidad y despacho calculados ahora.
// ---------------------------------------------------------------------------

const euros = (cents: number) => cents / 100;

export type CartProblem = {
  readonly linea: number;
  readonly codigo: string;
  readonly producto: string | null;
};

export type CartView = {
  readonly id: number;
  readonly lineas: readonly {
    readonly linea: number;
    readonly producto: string;
    readonly variante: string;
    readonly cantidad: number;
    readonly extras: readonly { nombre: string; cantidad: number; precio: number }[];
    readonly nota: string | null;
    readonly precio_unitario: number;
    readonly importe: number;
  }[];
  /** Líneas que ya no se pueden servir (producto retirado o agotado en el local). */
  readonly problemas: readonly CartProblem[];
  readonly subtotal: number;
  readonly suplementos: readonly { concepto: string; importe: number }[];
  readonly envio: number;
  readonly total: number;
  readonly despacho: DespachoView | null;
  readonly metodos_pago: readonly string[];
  readonly caduca_en_minutos: number | null;
  readonly siguiente_paso: NextStep;
  readonly instruccion: string;
};

/** Qué toca hacer ahora con este carrito; el agente lo sigue en vez de deducirlo. */
export const NEXT_STEP = {
  AddProducts: "anadir_productos",
  FixProblems: "resolver_problemas",
  Fulfillment: "elegir_despacho",
  Address: "pedir_direccion",
  Unavailable: "despacho_no_disponible",
  Minimum: "completar_minimo",
  Confirm: "resumen_pago_y_confirmar",
} as const;
export type NextStep = (typeof NEXT_STEP)[keyof typeof NEXT_STEP];

const NEXT_STEP_TEXT: Readonly<Record<NextStep, string>> = {
  [NEXT_STEP.AddProducts]: "El carrito está vacío: ayuda al cliente a elegir productos.",
  [NEXT_STEP.FixProblems]:
    "Hay líneas que ya no se pueden servir: díselo y pregunta qué prefiere cambiar.",
  [NEXT_STEP.Fulfillment]:
    "Confirma lo que acabas de añadir, invítale a añadir algo más y pregunta si recoge o pide a domicilio en una sola frase (p. ej. «¿Quieres añadir algo más o prefieres recoger en el local o a domicilio?»); termina el turno con ofrecer_opciones (tipo despacho). Si el cliente ya dijo cómo lo quiere, llama a elegir_despacho.",
  [NEXT_STEP.Address]:
    "Falta la dirección: termina el turno con ofrecer_opciones (tipo direccion) para que elija «Escribir dirección» o «Enviar ubicación».",
  [NEXT_STEP.Unavailable]:
    "El despacho no está disponible ahora (ver despacho.motivo): díselo y ofrece otra opción.",
  [NEXT_STEP.Minimum]:
    "No alcanza el mínimo de reparto: di cuánto falta y ofrece añadir productos o recoger en el local.",
  [NEXT_STEP.Confirm]:
    "Muestra el resumen solo con estas líneas, precios y total. Si el cliente aún no eligió la forma de pago, pregúntala (ofrecer_opciones tipo pago); si ya la eligió, no la repitas: pregunta si confirma (ofrecer_opciones tipo confirmar). Confirma solo cuando el cliente acepte.",
};

export function nextStep(
  lines: number,
  problems: number,
  despacho: DespachoView | null,
): { siguiente_paso: NextStep; instruccion: string } {
  const step = (value: NextStep) => ({
    siguiente_paso: value,
    instruccion: NEXT_STEP_TEXT[value],
  });
  if (lines === 0) return step(NEXT_STEP.AddProducts);
  if (problems > 0) return step(NEXT_STEP.FixProblems);
  if (!despacho) return step(NEXT_STEP.Fulfillment);
  if (despacho.tipo === FULFILLMENT.Delivery && !despacho.direccion) {
    return step(NEXT_STEP.Address);
  }
  if (!despacho.disponible) return step(NEXT_STEP.Unavailable);
  if (!despacho.alcanza_minimo) return step(NEXT_STEP.Minimum);
  return step(NEXT_STEP.Confirm);
}

export type DespachoView = {
  readonly tipo: Fulfillment;
  readonly disponible: boolean;
  /** Motivo si no está disponible ahora (local cerrado, fuera de cobertura…). */
  readonly motivo: string | null;
  readonly local: { id: number; nombre: string; direccion: string | null } | null;
  readonly direccion: string | null;
  readonly zona: string | null;
  readonly minimo: number;
  readonly alcanza_minimo: boolean;
  readonly falta_para_minimo: number;
  readonly tiempo_estimado: string | null;
};

export type ResolveContext = {
  readonly branches: readonly BranchRecord[];
  readonly config: ReadonlyMap<string, string>;
  readonly isOpen: (branch: Branch) => boolean;
};

export async function loadResolveContext(
  deps: AppDeps,
  restaurant: Restaurant,
): Promise<ResolveContext> {
  const [branches, config] = await Promise.all([
    loadBranches(deps.sql, restaurant.id),
    loadConfig(deps.sql, restaurant.id),
  ]);
  const active = branches.filter((branch) => branch.active);
  const isOpen = await openChecker(deps.sql, restaurant, active, openOverride(config), deps.now());
  return { branches: active, config, isOpen };
}

/** Local con el que se comprueba la disponibilidad antes de elegir despacho. */
export function availabilityBranch(
  ctx: ResolveContext,
  cart: Pick<Cart, "sucursalId">,
  channel: AgentChannel,
): BranchRecord | null {
  const id = cart.sucursalId ?? channel.sucursalId;
  if (id !== null) return ctx.branches.find((branch) => branch.id === id) ?? null;
  return ctx.branches.length === 1 ? (ctx.branches[0] ?? null) : null;
}

/** Vuelve a resolver el despacho guardado (local abierto, zona y tarifa vigentes). */
export async function resolveCartFulfillment(
  deps: AppDeps,
  restaurant: Restaurant,
  ctx: ResolveContext,
  cart: Cart,
): Promise<FulfillmentResolution | null> {
  if (!cart.tipoDespacho) return null;
  if (!fulfillmentEnabled(restaurant, cart.tipoDespacho)) {
    return {
      ok: false,
      error:
        cart.tipoDespacho === FULFILLMENT.Delivery
          ? API_ERROR.DeliveryNotAvailable
          : API_ERROR.PickupNotAvailable,
    };
  }
  return resolveFulfillment(deps.sql, restaurant.id, ctx.branches, ctx.config, ctx.isOpen, {
    fulfillment: cart.tipoDespacho,
    ...(cart.tipoDespacho === FULFILLMENT.Pickup && cart.sucursalId !== null
      ? { branchId: cart.sucursalId }
      : {}),
    ...(cart.tipoDespacho === FULFILLMENT.Delivery && cart.zonaId !== null
      ? { zoneId: cart.zonaId }
      : {}),
    point: cart.point,
  });
}

export async function viewCart(
  deps: AppDeps,
  restaurant: Restaurant,
  channel: AgentChannel,
  cart: Cart,
  quoteReason: (error: string) => string,
  ctx?: ResolveContext,
): Promise<CartView> {
  const context = ctx ?? (await loadResolveContext(deps, restaurant));
  const resolved = await resolveCartFulfillment(deps, restaurant, context, cart);
  const branch =
    resolved?.ok === true ? resolved.branch : availabilityBranch(context, cart, channel);
  const itemIds = [...new Set(cart.lineas.map((line) => line.menu_item_id))];
  const [catalog, hidden] = await Promise.all([
    loadCatalogForItems(deps.sql, restaurant.id, itemIds),
    branch ? unavailableItems(deps.sql, branch.id) : Promise.resolve(new Set<number>()),
  ]);

  const problems: CartProblem[] = [];
  const valid: { index: number; line: CartLine }[] = [];
  cart.lineas.forEach((line, index) => {
    const name = catalog.get(line.menu_item_id)?.name ?? null;
    if (hidden.has(line.menu_item_id)) {
      problems.push({ linea: index + 1, codigo: "ITEM_NOT_AVAILABLE_AT_BRANCH", producto: name });
      return;
    }
    const errors = lineErrors(catalog, line);
    if (errors.length > 0) {
      problems.push({ linea: index + 1, codigo: errors[0]?.code ?? "invalid", producto: name });
      return;
    }
    valid.push({ index, line });
  });

  // Precio como en el pedido: con la tarifa de la zona, pero sin exigir aún el mínimo (el agente
  // debe poder decir cuánto falta). El mínimo se calcula aparte con las condiciones reales.
  const delivery = resolved?.ok ? resolved.delivery : null;
  const pricingFulfillment =
    cart.tipoDespacho === FULFILLMENT.Delivery && !delivery
      ? FULFILLMENT.Pickup
      : (cart.tipoDespacho ?? FULFILLMENT.Pickup);
  const priced =
    valid.length > 0
      ? priceOrder(
          catalog,
          valid.map((entry) => requestedLine(entry.line)),
          {
            fulfillment: pricingFulfillment,
            surcharges: surchargeRules(context.config),
            ...(delivery
              ? {
                  delivery: {
                    feeCents: delivery.feeCents,
                    minOrderCents: cents(0),
                    freeFromCents: delivery.freeFromCents,
                  },
                }
              : {}),
          },
        )
      : null;
  const quote = priced?.ok ? priced.quote : null;
  const subtotalCents = quote?.subtotalCents ?? cents(0);

  let despacho: DespachoView | null = null;
  if (cart.tipoDespacho) {
    const charge = delivery
      ? deliveryChargeFor(subtotalCents, {
          feeCents: delivery.feeCents,
          minOrderCents: delivery.minOrderCents,
          freeFromCents: delivery.freeFromCents,
        })
      : null;
    const eta =
      resolved?.ok === true
        ? (await loadEtaContext(deps.sql, restaurant, context.config, deps.now())).resolve(
            resolved.etaBase,
            resolved.etaService,
            resolved.branch.id,
          )
        : null;
    despacho = {
      tipo: cart.tipoDespacho,
      disponible: resolved?.ok === true,
      motivo: resolved && !resolved.ok ? quoteReason(resolved.error) : null,
      local:
        resolved?.ok === true
          ? {
              id: resolved.branch.id,
              nombre: resolved.branch.name,
              direccion: resolved.branch.address,
            }
          : null,
      direccion: cart.direccion,
      zona: delivery?.zoneName ?? null,
      minimo: delivery ? euros(delivery.minOrderCents) : 0,
      alcanza_minimo: charge ? charge.meetsMinimum : true,
      falta_para_minimo: charge ? euros(charge.missingCents) : 0,
      tiempo_estimado: eta,
    };
  }

  return {
    id: cart.id,
    lineas: (quote?.lines ?? []).map((line, position) => ({
      linea: (valid[position]?.index ?? position) + 1,
      producto: line.name,
      variante: line.variantName,
      cantidad: line.quantity,
      extras: line.modifiers.map((modifier) => ({
        nombre: modifier.name,
        cantidad: modifier.quantity,
        precio: euros(modifier.unitPriceCents),
      })),
      nota: line.note ?? null,
      precio_unitario: euros(line.unitPriceCents),
      importe: euros(line.lineTotalCents),
    })),
    problemas: problems,
    subtotal: euros(subtotalCents),
    suplementos: (quote?.surcharges ?? []).map((surcharge) => ({
      concepto: surcharge.label,
      importe: euros(surcharge.amountCents),
    })),
    envio: euros(quote?.deliveryFeeCents ?? 0),
    total: euros(quote?.totalCents ?? 0),
    despacho,
    metodos_pago: restaurant.paymentMethods,
    caduca_en_minutos: cartExpiryMinutes(context.config),
    ...nextStep(valid.length, problems.length, despacho),
  };
}
