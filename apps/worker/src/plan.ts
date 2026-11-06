import { FULFILLMENT, ORDER_STATUS } from "@konnecttia/domain";
import {
  type MailMessage,
  newOrderEmail,
  ORDER_DELIVERY_KIND,
  ORDER_NOTICE,
  type OrderDeliveryKind,
  type OrderNotice,
  orderNoticeEmail,
} from "@konnecttia/notifications";
import type { NoticeConfig } from "./config";
import { isEmail } from "./config";

/** Tipos de evento del outbox que escribe la API (`apps/api/src/repositories/orders.ts`). */
export const OUTBOX_EVENT = {
  OrderReceived: "pedido.recibido",
  OrderStatusChanged: "pedido.estado_cambiado",
} as const;

export const HANDLED_EVENTS: readonly string[] = Object.values(OUTBOX_EVENT);

/** Motivos por los que un evento no envía nada (se guardan en `outbox_evento.ultimo_error`). */
export const SKIP_REASON = {
  NoProvider: "sin_proveedor_email",
  ModuleOff: "modulo_inactivo",
  OrderMissing: "pedido_no_encontrado",
  BadPayload: "payload_invalido",
  LocalDisabled: "aviso_local_apagado",
  LocalNoRecipients: "aviso_local_sin_destinatarios",
  InternalChannel: "canal_interno",
  CustomerDisabled: "aviso_cliente_apagado",
  CustomerStatusIgnored: "estado_sin_aviso_cliente",
  CustomerNoEmail: "sin_email_cliente",
  NoPublicUrl: "sin_url_publica",
} as const;

/** Canales en los que el pedido lo crea el propio personal desde el panel: no hace falta avisarles. */
const INTERNAL_CHANNELS: ReadonlySet<string> = new Set(["mostrador", "telefono"]);

/** Estado del pedido → aviso al cliente. */
const NOTICE_BY_STATUS: Readonly<Record<string, OrderNotice>> = {
  [ORDER_STATUS.Confirmed]: ORDER_NOTICE.Accepted,
  [ORDER_STATUS.Ready]: ORDER_NOTICE.Ready,
  [ORDER_STATUS.OnTheWay]: ORDER_NOTICE.OnTheWay,
  [ORDER_STATUS.Cancelled]: ORDER_NOTICE.Cancelled,
};

export type OrderForNotice = {
  readonly id: number;
  readonly codigo: string | null;
  readonly tipoDespacho: string | null;
  readonly canal: string;
  readonly nombre: string | null;
  readonly totalCents: number;
  readonly trackingToken: string;
  readonly restauranteNombre: string;
  readonly restauranteSlug: string | null;
};

export type PlanInput = {
  readonly tipo: string;
  readonly payload: unknown;
  readonly order: OrderForNotice;
  readonly config: NoticeConfig;
  readonly moduleActive: boolean;
  readonly panelUrl: string | null;
  readonly webUrl: string | null;
};

export const RECIPIENT = { Local: "local", Customer: "cliente" } as const;
export type RecipientKind = (typeof RECIPIENT)[keyof typeof RECIPIENT];

export type Delivery = {
  readonly kind: RecipientKind;
  readonly to: string;
  readonly message: Omit<MailMessage, "to">;
};

export type Plan = {
  readonly deliveries: readonly Delivery[];
  /** Por qué no hay envíos (vacío si los hay). */
  readonly skipped: readonly string[];
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Email del cliente si el evento lo trae. El checkout aún no lo recoge, así que hoy es siempre null. */
export function customerEmailFromPayload(payload: unknown): string | null {
  const value = record(payload).email_cliente;
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return isEmail(email) ? email : null;
}

function deliveryKind(tipoDespacho: string | null): OrderDeliveryKind {
  if (tipoDespacho === FULFILLMENT.Delivery) return ORDER_DELIVERY_KIND.Delivery;
  if (tipoDespacho === FULFILLMENT.DineIn) return ORDER_DELIVERY_KIND.DineIn;
  return ORDER_DELIVERY_KIND.Pickup;
}

const joinUrl = (base: string, ...parts: string[]) =>
  [base.replace(/\/+$/, ""), ...parts.map(encodeURIComponent)].join("/");

/** Decide qué emails salen de un evento. Pura: no toca base de datos ni red. */
export function planDeliveries(input: PlanInput): Plan {
  const { order, config } = input;
  if (!input.moduleActive) return { deliveries: [], skipped: [SKIP_REASON.ModuleOff] };

  const deliveries: Delivery[] = [];
  const skipped: string[] = [];
  const codigo = order.codigo ?? `#${order.id}`;
  const delivery = deliveryKind(order.tipoDespacho);

  if (input.tipo === OUTBOX_EVENT.OrderReceived) {
    // Aviso al local.
    if (!config.localEnabled) skipped.push(SKIP_REASON.LocalDisabled);
    else if (INTERNAL_CHANNELS.has(order.canal)) skipped.push(SKIP_REASON.InternalChannel);
    else if (config.localRecipients.length === 0) skipped.push(SKIP_REASON.LocalNoRecipients);
    else {
      const message = newOrderEmail({
        restaurante: order.restauranteNombre,
        codigo,
        delivery,
        totalCents: order.totalCents,
        nombre: order.nombre,
        panelUrl:
          input.panelUrl && order.restauranteSlug
            ? joinUrl(input.panelUrl, "panel", order.restauranteSlug)
            : null,
      });
      for (const to of config.localRecipients)
        deliveries.push({ kind: RECIPIENT.Local, to, message });
    }
    // Confirmación de la recepción al cliente.
    planCustomer(input, ORDER_NOTICE.Received, deliveries, skipped, codigo, delivery);
  } else if (input.tipo === OUTBOX_EVENT.OrderStatusChanged) {
    const target = record(input.payload).hacia;
    const notice = typeof target === "string" ? NOTICE_BY_STATUS[target] : undefined;
    if (typeof target !== "string") skipped.push(SKIP_REASON.BadPayload);
    else if (!notice || !config.customerStatuses.has(target))
      skipped.push(SKIP_REASON.CustomerStatusIgnored);
    else planCustomer(input, notice, deliveries, skipped, codigo, delivery);
  }

  return { deliveries, skipped: deliveries.length > 0 ? [] : skipped };
}

function planCustomer(
  input: PlanInput,
  notice: OrderNotice,
  deliveries: Delivery[],
  skipped: string[],
  codigo: string,
  delivery: OrderDeliveryKind,
): void {
  const { order, config } = input;
  if (!config.customerEnabled) {
    skipped.push(SKIP_REASON.CustomerDisabled);
    return;
  }
  const to = customerEmailFromPayload(input.payload);
  if (!to) {
    skipped.push(SKIP_REASON.CustomerNoEmail);
    return;
  }
  if (!input.webUrl || !order.restauranteSlug) {
    skipped.push(SKIP_REASON.NoPublicUrl);
    return;
  }
  deliveries.push({
    kind: RECIPIENT.Customer,
    to,
    message: orderNoticeEmail({
      restaurante: order.restauranteNombre,
      codigo,
      notice,
      delivery,
      totalCents: order.totalCents,
      trackingUrl: joinUrl(input.webUrl, order.restauranteSlug, "pedido", order.trackingToken),
    }),
  });
}
