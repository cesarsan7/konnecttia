import {
  FULFILLMENT,
  type Fulfillment,
  type GeoPoint,
  type PricingContext,
  type PricingResult,
  priceOrder,
  type RequestedLine,
} from "@konnecttia/domain";
import type { AppDeps } from "../context";
import { API_ERROR, type ApiError } from "../lib/http";
import type { orderBodySchema } from "../routes/public";
import { type BranchRecord, loadBranches, openChecker, unavailableItems } from "./branches";
import { loadCatalogForItems } from "./catalog";
import { loadEtaContext } from "./eta";
import { resolveFulfillment } from "./fulfillment";
import { type CreatedOrder, createOrder, type OrderChannel } from "./orders";
import { privacyPolicy } from "./privacy";
import {
  fulfillmentEnabled,
  loadConfig,
  openOverride,
  type Restaurant,
  surchargeRules,
} from "./restaurants";
import { restaurantAcceptsOrders } from "./trial";

type WebOrderBody = import("zod").infer<typeof orderBodySchema>;

/** Pedido a crear: el de la web, o uno en mesa desde el panel (teléfono opcional). */
export type OrderInput = Omit<WebOrderBody, "tipo_despacho" | "telefono"> & {
  readonly tipo_despacho: Fulfillment;
  readonly telefono: string;
  readonly mesa_id?: number;
};

export type PlaceOrderResult =
  | {
      readonly ok: true;
      readonly order: CreatedOrder;
      readonly branch: BranchRecord;
      readonly eta: string | null;
      readonly priced: Extract<PricingResult, { ok: true }>;
    }
  | { readonly ok: false; readonly error: ApiError; readonly extra?: Record<string, unknown> };

/**
 * Crea un pedido con las reglas del servidor (local abierto, zona, mínimo, tarifa, tiempo,
 * disponibilidad por local y precios de la carta). Lo usan la web y el pedido manual del panel,
 * para que ambos calculen exactamente igual. `branchAllowed` permite al panel exigir que el local
 * resultante esté dentro del alcance del usuario.
 */
export async function placeOrder(
  deps: AppDeps,
  restaurant: Restaurant,
  body: OrderInput,
  idempotencyKey: string,
  channel: OrderChannel,
  branchAllowed: (branchId: number) => boolean = () => true,
  /** Consentimiento del checkout web; el pedido manual y n8n no lo piden. */
  consent?: { readonly promotions: boolean },
): Promise<PlaceOrderResult> {
  // Prueba pendiente, rechazada o vencida: no se toman pedidos (ni por la web ni desde el panel).
  if (!(await restaurantAcceptsOrders(deps.sql, restaurant.id, deps.now()))) {
    return {
      ok: false,
      error: API_ERROR.RestaurantUnavailable,
      extra: { reason: API_ERROR.RestaurantUnavailable },
    };
  }
  if (!fulfillmentEnabled(restaurant, body.tipo_despacho)) {
    return {
      ok: false,
      error:
        body.tipo_despacho === FULFILLMENT.Delivery
          ? API_ERROR.DeliveryNotAvailable
          : API_ERROR.PickupNotAvailable,
    };
  }
  if (!restaurant.paymentMethods.includes(body.metodo_pago)) {
    return {
      ok: false,
      error: API_ERROR.PaymentMethodNotAccepted,
      extra: { accepted: restaurant.paymentMethods },
    };
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

  const resolved = await resolveFulfillment(deps.sql, restaurant.id, branches, config, isOpen, {
    fulfillment: body.tipo_despacho,
    ...(body.sucursal_id !== undefined ? { branchId: body.sucursal_id } : {}),
    ...(body.zona_id !== undefined ? { zoneId: body.zona_id } : {}),
    point: customerPoint,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error as ApiError, extra: resolved.extra };
  const { branch, delivery, etaBase, etaService, postalCode } = resolved;
  if (!branchAllowed(branch.id)) {
    return {
      ok: false,
      error: API_ERROR.BranchNotAvailable,
      extra: { reason: "branch_out_of_scope" },
    };
  }

  const pricingContext: PricingContext = {
    fulfillment: body.tipo_despacho,
    surcharges: surchargeRules(config),
    ...(delivery
      ? {
          delivery: {
            feeCents: delivery.feeCents,
            minOrderCents: delivery.minOrderCents,
            freeFromCents: delivery.freeFromCents,
          },
        }
      : {}),
  };
  const eta = (await loadEtaContext(deps.sql, restaurant, config, deps.now())).resolve(
    etaBase,
    etaService,
    branch.id,
  );

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
  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const catalog = await loadCatalogForItems(deps.sql, restaurant.id, itemIds);
  const hidden = await unavailableItems(deps.sql, branch.id);
  const notHere = itemIds.filter((id) => hidden.has(id));
  if (notHere.length > 0) {
    return {
      ok: false,
      error: API_ERROR.InvalidItems,
      extra: {
        errors: notHere.map((id) => ({ code: "ITEM_NOT_AVAILABLE_AT_BRANCH", detail: String(id) })),
      },
    };
  }
  const priced = priceOrder(catalog, lines, pricingContext);
  if (!priced.ok)
    return { ok: false, error: API_ERROR.InvalidItems, extra: { errors: priced.errors } };

  const order = await createOrder(deps.sql, {
    restauranteId: restaurant.id,
    sucursalId: branch.id,
    idempotencyKey,
    canal: channel,
    nombre: body.nombre,
    telefono: body.telefono,
    nombrePedido: body.nombre_pedido ?? null,
    fulfillment: body.tipo_despacho,
    direccion: body.tipo_despacho === FULFILLMENT.Delivery ? (body.direccion ?? null) : null,
    postalCode,
    customerPoint: body.tipo_despacho === FULFILLMENT.Delivery ? customerPoint : null,
    distanciaKm: delivery?.distanceKm ?? null,
    metodoPago: body.metodo_pago,
    tiempoEstimado: eta,
    notas: body.notas ?? null,
    quote: priced.quote,
    mesaId: body.mesa_id ?? null,
    ...(consent
      ? {
          consent: {
            privacyVersion: privacyPolicy(config).version,
            promotions: consent.promotions,
          },
        }
      : {}),
  });
  return { ok: true, order, branch, eta, priced };
}
