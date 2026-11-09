import {
  canClientCancel,
  checkTransition,
  type Fulfillment,
  ORDER_STATUS,
  PAYMENT_STATUS,
} from "@konnecttia/domain";
import type { TransactionSql } from "postgres";
import { emailPayload } from "../lib/customer-email";
import type { Sql } from "../lib/db";
import { OUTBOX_EVENT } from "./orders";

type Tx = TransactionSql<{ bigint: number }>;

export type StatusChange =
  | { readonly kind: "updated"; readonly from: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "out_of_scope"; readonly from: string }
  | { readonly kind: "rejected"; readonly from: string; readonly error: string };

/**
 * Cambia el estado de un pedido con la máquina de estados del dominio, en una transacción:
 * bloquea la fila, comprueba el paso (y el cobro), deja origen y actor para el historial
 * (fn_log_estado_pedido) y publica el evento en el outbox. Lo usan el tablero y «Mis repartos».
 * `allowed` decide si quien cambia puede tocar ese pedido (local, reparto asignado…).
 */
export async function changeOrderStatus(
  sql: Sql,
  input: {
    readonly restaurantId: number;
    readonly orderId: number;
    readonly target: string;
    readonly origin: string;
    readonly actor: string;
    readonly allowed: (order: {
      sucursal_id: number | null;
      tipo_despacho: Fulfillment;
    }) => boolean;
    /** Si se indica, solo se cambia un pedido que esté ahora en uno de estos estados. */
    readonly onlyFrom?: readonly string[];
    /** Se ejecuta dentro de la misma transacción tras el cambio (p. ej. horas del reparto). */
    readonly after?: (tx: Tx) => Promise<void>;
  },
): Promise<StatusChange> {
  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        id: number;
        estado: string;
        estado_pago: string;
        tipo_despacho: Fulfillment;
        sucursal_id: number | null;
        email_cliente: string | null;
      }[]
    >`
      SELECT id, estado, estado_pago, tipo_despacho, sucursal_id, email_cliente
      FROM   public.pedidos
      WHERE  id = ${input.orderId} AND restaurante_id = ${input.restaurantId}
      FOR UPDATE
    `;
    const order = rows[0];
    if (!order) return { kind: "not_found" as const };
    if (!input.allowed(order)) return { kind: "out_of_scope" as const, from: order.estado };

    if (input.onlyFrom && !input.onlyFrom.includes(order.estado)) {
      return { kind: "rejected" as const, from: order.estado, error: "not_allowed_from" };
    }

    const check = checkTransition({
      from: order.estado,
      to: input.target,
      fulfillment: order.tipo_despacho,
      paymentStatus: order.estado_pago,
    });
    if (!check.ok) return { kind: "rejected" as const, from: order.estado, error: check.error };

    // El trigger fn_log_estado_pedido lee estos valores para el historial de estados.
    await tx`SELECT set_config('app.origen', ${input.origin}, true), set_config('app.actor', ${input.actor}, true)`;
    // Pasar a «pagado» confirma también el cobro: si no, el pedido no podría entregarse.
    const paid = input.target === ORDER_STATUS.Paid && order.estado_pago === PAYMENT_STATUS.Pending;
    await tx`
      UPDATE public.pedidos
      SET    estado = ${input.target}, updated_at = now(),
             estado_pago = ${paid ? PAYMENT_STATUS.Paid : order.estado_pago}
      WHERE  id = ${input.orderId} AND restaurante_id = ${input.restaurantId}
    `;
    await tx`
      INSERT INTO public.outbox_evento
        (restaurante_id, tipo, agregado_tipo, agregado_id, payload, clave_idempotencia)
      VALUES (
        ${input.restaurantId}, ${OUTBOX_EVENT.OrderStatusChanged}, 'pedido', ${String(input.orderId)},
        ${tx.json({ pedido_id: input.orderId, desde: order.estado, hacia: input.target, ...emailPayload(order.email_cliente) })},
        ${`${OUTBOX_EVENT.OrderStatusChanged}:${input.orderId}:${order.estado}:${input.target}`}
      )
      ON CONFLICT (clave_idempotencia) DO NOTHING
    `;
    if (input.after) await input.after(tx);
    return { kind: "updated" as const, from: order.estado };
  });
}

export type ClientCancel = "cancelled" | "not_found" | "not_cancellable";

/**
 * El cliente cancela su pedido desde el seguimiento (pieza O). Usa el mismo cambio de estado que el
 * tablero, con origen «cliente», y solo vale mientras el local no haya aceptado el pedido.
 */
export async function cancelTrackedOrder(sql: Sql, token: string): Promise<ClientCancel> {
  const [order] = await sql<
    { id: number; restaurante_id: number; estado: string; justificantes: number }[]
  >`
    SELECT p.id, p.restaurante_id, p.estado,
           (SELECT count(*)::int FROM public.pedido_justificante j WHERE j.pedido_id = p.id)
             AS justificantes
    FROM   public.pedidos p
    WHERE  p.tracking_token = ${token}::uuid
  `;
  if (!order) return "not_found";
  if (!canClientCancel({ estado: order.estado, justificantes: order.justificantes })) {
    return "not_cancellable";
  }
  const result = await changeOrderStatus(sql, {
    restaurantId: order.restaurante_id,
    orderId: order.id,
    target: ORDER_STATUS.Cancelled,
    origin: "cliente",
    actor: "cliente",
    allowed: () => true,
    onlyFrom: [ORDER_STATUS.Received, ORDER_STATUS.PendingPayment],
  });
  return result.kind === "updated" ? "cancelled" : "not_cancellable";
}
