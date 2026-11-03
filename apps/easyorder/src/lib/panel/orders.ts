import { checkTransition, ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import type { PanelOrder } from "./types";

const S = ORDER_STATUS;

/** Columnas del tablero, en el orden en que avanza un pedido. */
export const LANES = [
  { id: "nuevos", title: "Nuevos", states: [S.Received, S.PendingPayment] },
  { id: "cocina", title: "En preparación", states: [S.Confirmed, S.Paid, S.Preparing] },
  { id: "listos", title: "Listos y en reparto", states: [S.Ready, S.OnTheWay] },
  { id: "cerrados", title: "Terminados", states: [S.Delivered, S.Cancelled, S.Expired] },
] as const;

export type LaneId = (typeof LANES)[number]["id"];

export function laneOf(order: Pick<PanelOrder, "estado">): LaneId {
  return (
    LANES.find((lane) => (lane.states as readonly string[]).includes(order.estado))?.id ?? "nuevos"
  );
}

export const STATUS_LABEL: Readonly<Record<string, string>> = {
  [S.Received]: "Nuevo",
  [S.PendingPayment]: "Esperando cobro",
  [S.Confirmed]: "Aceptado",
  [S.Paid]: "Pagado",
  [S.Preparing]: "Preparando",
  [S.Ready]: "Listo",
  [S.OnTheWay]: "En reparto",
  [S.Delivered]: "Entregado",
  [S.Cancelled]: "Cancelado",
  [S.Expired]: "Caducado",
};

export type OrderAction =
  | { readonly kind: "status"; readonly to: string; readonly label: string }
  | { readonly kind: "payment"; readonly label: string };

/** Siguiente paso habitual de cada estado (el botón principal de la tarjeta). */
const NEXT_STEP: Readonly<Record<string, { to: string; label: string }[]>> = {
  [S.Received]: [{ to: S.Confirmed, label: "Aceptar pedido" }],
  [S.Confirmed]: [{ to: S.Preparing, label: "Empezar a preparar" }],
  [S.Paid]: [{ to: S.Preparing, label: "Empezar a preparar" }],
  [S.Preparing]: [{ to: S.Ready, label: "Marcar como listo" }],
  [S.Ready]: [
    { to: S.OnTheWay, label: "Salió a repartir" },
    { to: S.Delivered, label: "Entregado al cliente" },
  ],
  [S.OnTheWay]: [{ to: S.Delivered, label: "Entregado" }],
};

/**
 * Acción principal de un pedido, validada con la misma máquina de estados que la API. Con el cobro
 * pendiente, la acción es confirmar el cobro cuando el pedido no puede avanzar sin él (o cuando
 * espera cobro), y si no, el paso siguiente de cocina.
 */
export function primaryAction(
  order: Pick<PanelOrder, "estado" | "estado_pago" | "tipo_despacho">,
  can: { readonly changeStatus: boolean; readonly confirmPayment: boolean },
): OrderAction | null {
  const paymentPending = order.estado_pago === PAYMENT_STATUS.Pending;
  if (paymentPending && order.estado === S.PendingPayment) {
    return can.confirmPayment ? { kind: "payment", label: "Confirmar cobro" } : null;
  }
  if (!can.changeStatus) return null;
  const fulfillment = order.tipo_despacho ?? "retiro";
  const step = (NEXT_STEP[order.estado] ?? []).find(
    (candidate) =>
      checkTransition({
        from: order.estado,
        to: candidate.to,
        fulfillment,
        paymentStatus: order.estado_pago,
      }).ok,
  );
  if (step) return { kind: "status", to: step.to, label: step.label };
  // Listo para entregar pero sin cobrar: hay que confirmar el cobro primero.
  if (paymentPending && can.confirmPayment) return { kind: "payment", label: "Confirmar cobro" };
  return null;
}

/** ¿Se puede cancelar desde el estado actual? */
export function canCancel(order: Pick<PanelOrder, "estado" | "estado_pago" | "tipo_despacho">) {
  return checkTransition({
    from: order.estado,
    to: S.Cancelled,
    fulfillment: order.tipo_despacho ?? "retiro",
    paymentStatus: order.estado_pago,
  }).ok;
}

export type OrderLine = {
  readonly quantity: number;
  readonly name: string;
  readonly variant: string | null;
  readonly extras: readonly string[];
  readonly note: string | null;
};

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const count = (value: unknown, fallback = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Líneas del pedido en un formato común. La web guarda `item_name/quantity` y los pedidos de
 * WhatsApp (n8n) pueden guardar `nombre/cantidad`; el panel antiguo de EasyOrder ya leía ambos.
 */
export function orderLines(items: unknown): OrderLine[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const quantity = count(item.quantity ?? item.cantidad);
    const extras = Array.isArray(item.extras)
      ? item.extras.map((rawExtra) => {
          const extra = (rawExtra ?? {}) as Record<string, unknown>;
          const name = text(extra.name) ?? text(extra.nombre) ?? "Extra";
          const extraQty = count(extra.quantity ?? extra.cantidad);
          // La cantidad del extra viene multiplicada por la de la línea.
          const perUnit = Math.round(extraQty / quantity);
          return perUnit > 1 ? `${perUnit}× ${name}` : name;
        })
      : [];
    return {
      quantity,
      name: text(item.item_name) ?? text(item.nombre) ?? text(item.name) ?? "Producto",
      variant: text(item.variant_name),
      extras,
      note: text(item.nota) ?? text(item.notas),
    };
  });
}

/** Notas generales del pedido (no las de cada producto ni los suplementos). */
export function orderNotes(notas: unknown): string[] {
  if (typeof notas === "string") return notas.trim() ? [notas.trim()] : [];
  if (!Array.isArray(notas)) return [];
  return notas
    .map((raw) => (raw ?? {}) as Record<string, unknown>)
    .filter((note) => note.item === "general" || note.item === undefined)
    .map((note) => text(note.nota))
    .filter((note): note is string => note !== null);
}

/** Minutos desde que entró el pedido. */
export function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `hace ${hours} h ${minutes % 60} min` : `hace ${Math.floor(hours / 24)} d`;
}

/** Minutos a partir de los cuales un pedido sin aceptar se marca como «esperando demasiado». */
export const WAITING_TOO_LONG_MINUTES = 5;

export const PAYMENT_METHOD_LABEL: Readonly<Record<string, string>> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  bizum: "Bizum",
  sin_indicar: "Sin indicar",
};

export function paymentLabel(method: string | null): string {
  if (!method) return "Sin indicar";
  return PAYMENT_METHOD_LABEL[method] ?? method.charAt(0).toUpperCase() + method.slice(1);
}

/** Pedidos que no estaban en la carga anterior y que piden atención (para el aviso sonoro). */
export function newArrivals(previous: ReadonlySet<number> | null, orders: readonly PanelOrder[]) {
  if (previous === null) return [];
  return orders.filter((order) => laneOf(order) === "nuevos" && !previous.has(order.id));
}
