"use client";

import "./order-card.css";
import { euros } from "@/lib/format";
import { type Driver, driversFor } from "@/lib/panel/drivers";
import {
  canCancel,
  formatElapsed,
  laneOf,
  minutesSince,
  type OrderAction,
  orderLines,
  orderNotes,
  paymentLabel,
  primaryAction,
  STATUS_LABEL,
  summarizeLines,
  WAITING_TOO_LONG_MINUTES,
} from "@/lib/panel/orders";
import { pendingProofs } from "@/lib/panel/proofs";
import { personLabel } from "@/lib/panel/team";
import type { PanelOrder } from "@/lib/panel/types";
import { Icon } from "../Icon";
import { DeliveryPhotoViewer } from "./DeliveryPhotoViewer";
import { ProofViewer } from "./ProofViewer";

export type CardProps = {
  readonly order: PanelOrder;
  readonly now: Date;
  readonly fresh: boolean;
  readonly busy: boolean;
  readonly showBranch: boolean;
  readonly timeZone: string;
  readonly permissions: { readonly changeStatus: boolean; readonly confirmPayment: boolean };
  readonly onAction: (action: OrderAction) => void;
  readonly onCancel: () => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Imprimir la comanda (sin él no hay botón). */
  readonly onPrint?: () => void;
  /** Repartidores para asignar (solo con delivery.assign); sin ellos no hay selector. */
  readonly drivers?: readonly Driver[] | null;
  readonly onAssign?: (membershipId: number | null) => void;
};

/** Tarjeta de un pedido (tablero y detalle desde la tabla). */
export function OrderCard({
  order,
  now,
  fresh,
  busy,
  showBranch,
  timeZone,
  permissions,
  onAction,
  onCancel,
  expanded,
  onToggle,
  onPrint,
  drivers = null,
  onAssign,
}: CardProps) {
  const lane = laneOf(order);
  const minutes = minutesSince(order.created_at, now);
  const late = lane === "nuevos" && minutes >= WAITING_TOO_LONG_MINUTES;
  const lines = orderLines(order.items);
  const notes = orderNotes(order.notas);
  const hasNotes = notes.length > 0 || lines.some((line) => line.note);
  const detailId = `pedido-${order.id}-detalle`;
  const action = primaryAction(order, permissions);
  const paymentPending = order.estado_pago === "pendiente";
  const delivery = order.tipo_despacho === "delivery";
  const dineIn = order.tipo_despacho === "mesa";
  const closed = lane === "cerrados";
  const time = new Date(order.created_at).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <article
      className={`k-order${fresh ? " is-fresh" : ""}${late ? " is-late" : ""}${closed ? " is-closed" : ""}`}
      aria-label={`Pedido ${order.pedido_codigo ?? order.id}`}
    >
      <header className="k-order-head">
        <button
          type="button"
          className="k-order-toggle"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
        >
          <span className="k-sr-only">{expanded ? "Ocultar detalle de " : "Ver detalle de "}</span>
          <span className="k-order-code">{order.pedido_codigo ?? `#${order.id}`}</span>
          <Icon name={expanded ? "chevronUp" : "chevronDown"} size={18} />
        </button>
        <div className="k-order-tags">
          <span className={`k-chip k-chip-${order.estado}`}>
            {STATUS_LABEL[order.estado] ?? order.estado}
          </span>
          {order.canal === "whatsapp" ? (
            <span className="k-chip k-chip-channel">WhatsApp</span>
          ) : null}
        </div>
        <span className={`k-elapsed${late ? " is-late" : ""}`} title={`Entró a las ${time}`}>
          <Icon name="clock" size={16} />
          {closed ? time : formatElapsed(minutes)}
        </span>
      </header>

      <div className="k-order-who">
        <strong>{order.nombre_pedido ?? "Cliente"}</strong>
        {expanded && order.telefono ? (
          <a className="k-small" href={`tel:${order.telefono}`}>
            <Icon name="phone" size={14} /> {order.telefono}
          </a>
        ) : null}
      </div>

      <p className="k-order-mode">
        <Icon name={delivery ? "bike" : dineIn ? "table" : "bag"} size={16} />
        <span>
          {delivery ? "Reparto" : dineIn ? (order.mesa_nombre ?? "Mesa") : "Recogida"}
          {showBranch && order.local_nombre ? ` · ${order.local_nombre}` : ""}
          {order.tiempo_estimado ? ` · ${order.tiempo_estimado}` : ""}
          {order.mesero_nombre ? ` · Atiende ${order.mesero_nombre}` : ""}
          {delivery && (order.repartidor_nombre || order.repartidor_email)
            ? ` · ${order.salida_at ? "sale con" : "reparte"} ${personLabel({ name: order.repartidor_nombre, email: order.repartidor_email }, "repartidor")}`
            : ""}
        </span>
      </p>
      {expanded ? (
        <div id={detailId} className="k-order-detail">
          {delivery && order.direccion ? (
            <a
              className="k-order-address k-small"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.direccion)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="pin" size={14} /> {order.direccion}
            </a>
          ) : null}

          {delivery && !closed && drivers && onAssign ? (
            <label className="k-field k-field-inline k-order-driver">
              <span className="k-small">Reparte</span>
              <select
                className="k-input"
                value={order.repartidor_id ?? ""}
                disabled={busy}
                onChange={(event) =>
                  onAssign(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Sin asignar</option>
                {driversFor(drivers, order.sucursal_id).map((driver) => (
                  <option key={driver.membership_id} value={driver.membership_id}>
                    {personLabel(
                      { name: driver.nombre_mostrar, email: driver.email },
                      `Repartidor ${driver.membership_id}`,
                    )}
                    {driver.en_curso > 0 ? ` · ${driver.en_curso} en curso` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <ul className="k-lines">
            {lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: las líneas de un pedido no cambian de orden.
              <li key={index}>
                <span className="k-qty">{line.quantity}×</span>
                <span>
                  {line.name}
                  {line.variant ? <span className="k-muted"> · {line.variant}</span> : null}
                  {line.extras.length > 0 ? (
                    <span className="k-line-extras">+ {line.extras.join(", ")}</span>
                  ) : null}
                  {line.note ? <span className="k-line-note">«{line.note}»</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {notes.length > 0 ? (
            <p className="k-order-note">
              <strong>Nota:</strong> {notes.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : (
        <button type="button" id={detailId} className="k-order-summary" onClick={onToggle}>
          <span className="k-summary-text">{summarizeLines(lines)}</span>
          {hasNotes ? <span className="k-chip k-chip-note">Con notas</span> : null}
        </button>
      )}

      <div className="k-order-total">
        <span className={`k-pay${paymentPending ? " is-pending" : ""}`}>
          {paymentLabel(order.metodo_pago)}
          {paymentPending
            ? " · pendiente de cobro"
            : order.estado_pago === "pagado"
              ? " · cobrado"
              : ""}
        </span>
        <strong className="k-amount">{euros(Number(order.total))}</strong>
      </div>

      {permissions.confirmPayment && !closed ? (
        <ProofViewer orderId={order.id} count={pendingProofs(order)} />
      ) : null}

      <DeliveryPhotoViewer orderId={order.id} count={order.fotos_entrega ?? 0} />

      {(!closed && (action || permissions.changeStatus)) || onPrint ? (
        <footer className="k-order-actions">
          {action && !closed ? (
            <button
              type="button"
              className="k-btn k-btn-go"
              disabled={busy}
              onClick={() => onAction(action)}
            >
              {action.kind === "payment" ? <Icon name="check" size={18} /> : null}
              {busy ? "Guardando…" : action.label}
            </button>
          ) : null}
          {!closed && paymentPending && action?.kind !== "payment" && permissions.confirmPayment ? (
            <button
              type="button"
              className="k-btn k-btn-secondary"
              disabled={busy}
              onClick={() => onAction({ kind: "payment", label: "Confirmar cobro" })}
            >
              Confirmar cobro
            </button>
          ) : null}
          {onPrint ? (
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              onClick={onPrint}
              aria-label={`Imprimir comanda de ${order.pedido_codigo ?? order.id}`}
            >
              <Icon name="print" size={16} />
              Imprimir
            </button>
          ) : null}
          {!closed && permissions.changeStatus && canCancel(order) ? (
            <button
              type="button"
              className="k-link k-link-danger"
              disabled={busy}
              onClick={onCancel}
            >
              Cancelar
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
