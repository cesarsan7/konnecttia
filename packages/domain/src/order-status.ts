import { FULFILLMENT, type Fulfillment } from "./delivery";

/**
 * Estados del pedido de EasyOrder (compartidos con n8n). La máquina de estados es la del panel
 * actual de EasyOrder, más la regla de pago: no se entrega un pedido con el pago pendiente.
 */
export const ORDER_STATUS = {
  Received: "recibido",
  InCart: "en_curso",
  PendingPayment: "pendiente_pago",
  Confirmed: "confirmado",
  Paid: "pagado",
  Preparing: "en_preparacion",
  Ready: "listo",
  OnTheWay: "en_camino",
  Delivered: "entregado",
  Cancelled: "cancelado",
  Expired: "expirado",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const PAYMENT_STATUS = {
  NotApplicable: "no_aplica",
  Pending: "pendiente",
  Paid: "pagado",
  Rejected: "rechazado",
} as const;

export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

const S = ORDER_STATUS;

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [S.Received]: [S.Confirmed, S.Cancelled, S.Expired],
  [S.InCart]: [S.Confirmed, S.Cancelled, S.Expired],
  [S.PendingPayment]: [S.Paid, S.Confirmed, S.Cancelled],
  [S.Confirmed]: [S.Preparing, S.Cancelled],
  [S.Paid]: [S.Preparing, S.Cancelled],
  [S.Preparing]: [S.Ready, S.Cancelled],
  [S.Ready]: [S.OnTheWay, S.Delivered, S.Cancelled],
  [S.OnTheWay]: [S.Delivered, S.Cancelled],
  [S.Delivered]: [],
  [S.Cancelled]: [],
  [S.Expired]: [],
};

export const TRANSITION_ERROR = {
  UnknownStatus: "unknown_status",
  NotAllowed: "transition_not_allowed",
  OnTheWayRequiresDelivery: "on_the_way_requires_delivery",
  PickupGoesStraightToDelivered: "pickup_requires_delivered",
  PaymentPending: "payment_pending",
} as const;

export type TransitionError = (typeof TRANSITION_ERROR)[keyof typeof TRANSITION_ERROR];

export function isOrderStatus(value: string): value is OrderStatus {
  return Object.hasOwn(ORDER_TRANSITIONS, value);
}

export function checkTransition(input: {
  readonly from: string;
  readonly to: string;
  readonly fulfillment: Fulfillment;
  readonly paymentStatus: string;
}): { ok: true } | { ok: false; error: TransitionError } {
  const { from, to, fulfillment, paymentStatus } = input;
  if (!isOrderStatus(from) || !isOrderStatus(to)) {
    return { ok: false, error: TRANSITION_ERROR.UnknownStatus };
  }
  if (!ORDER_TRANSITIONS[from].includes(to)) {
    return { ok: false, error: TRANSITION_ERROR.NotAllowed };
  }
  if (from === S.Ready && to === S.OnTheWay && fulfillment !== FULFILLMENT.Delivery) {
    return { ok: false, error: TRANSITION_ERROR.OnTheWayRequiresDelivery };
  }
  if (from === S.Ready && to === S.Delivered && fulfillment !== FULFILLMENT.Pickup) {
    return { ok: false, error: TRANSITION_ERROR.PickupGoesStraightToDelivered };
  }
  if (to === S.Delivered && paymentStatus === PAYMENT_STATUS.Pending) {
    return { ok: false, error: TRANSITION_ERROR.PaymentPending };
  }
  return { ok: true };
}
