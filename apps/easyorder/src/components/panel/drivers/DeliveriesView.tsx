"use client";

import { useCallback, useEffect, useState } from "react";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import { type Delivery, deliveryStep, mapsLink } from "@/lib/panel/drivers";
import {
  orderLines,
  orderNotes,
  paymentLabel,
  STATUS_LABEL,
  summarizeLines,
} from "@/lib/panel/orders";
import { Icon } from "../Icon";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

const REFRESH_MS = 20_000;

/**
 * «Mis repartos»: la pantalla del repartidor (pensada para el móvil). Solo ve los pedidos que
 * tiene asignados y los marca «en camino» y «entregado». Con cobro pendiente (transferencia,
 * Bizum) no puede entregar hasta que el local lo confirme.
 */
export function DeliveriesView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const [list, setList] = useState<readonly Delivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const allowed = can(PERMISSION.OrdersDeliverAssigned);
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: access.restaurante.zona_horaria,
  });

  const load = useCallback(async () => {
    const result = await api.myDeliveries(slug);
    if (result.ok) {
      setList(result.data.repartos);
      setError(null);
    } else {
      setError(describePanelError(result.status, result.body));
    }
  }, [api, slug]);

  useEffect(() => {
    if (!allowed) return;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [allowed, load]);

  async function advance(delivery: Delivery, step: "salida" | "entregado") {
    setBusy(delivery.id);
    const result = await api.deliveryStep(slug, delivery.id, step);
    setBusy(null);
    if (!result.ok) setError(describePanelError(result.status, result.body));
    await load();
  }

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Mis repartos</h1>
      </div>
      {allowed ? (
        <div className="k-head-tools">
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() => void load()}
          >
            <Icon name="refresh" size={18} />
            Actualizar
          </button>
        </div>
      ) : null}
    </header>
  );

  if (!allowed) {
    return (
      <div className="k-page">
        {header}
        <p className="k-card">Tu usuario no reparte pedidos en este restaurante.</p>
      </div>
    );
  }

  const active = (list ?? []).filter(
    (delivery) => !delivery.entregado_at && delivery.estado !== "cancelado",
  );
  const done = (list ?? []).filter(
    (delivery) => delivery.entregado_at || delivery.estado === "cancelado",
  );

  return (
    <div className="k-page">
      {header}
      {error ? (
        <p className="k-alert" role="alert">
          {error}
        </p>
      ) : null}
      {list === null ? <div className="k-skeleton k-skeleton-tall" aria-busy="true" /> : null}
      {list && active.length === 0 ? (
        <div className="k-card k-empty-state">
          <h2 className="k-title">Sin repartos pendientes</h2>
          <p className="k-muted">Cuando el local te asigne un pedido aparecerá aquí.</p>
        </div>
      ) : null}
      <ol className="k-deliveries">
        {active.map((delivery) => {
          const step = deliveryStep(delivery);
          const map = mapsLink(delivery);
          const pending = delivery.estado_pago === "pendiente";
          const notes = orderNotes(delivery.notas);
          return (
            <li key={delivery.id} className="k-card k-delivery">
              <header className="k-delivery-head">
                <strong className="k-order-code">
                  {delivery.pedido_codigo ?? `#${delivery.id}`}
                </strong>
                <span className={`k-chip k-chip-${delivery.estado}`}>
                  {STATUS_LABEL[delivery.estado] ?? delivery.estado}
                </span>
              </header>
              <p className="k-delivery-who">
                <strong>{delivery.nombre_pedido ?? "Cliente"}</strong>
                {delivery.telefono ? (
                  <a className="k-btn k-btn-secondary k-btn-sm" href={`tel:${delivery.telefono}`}>
                    <Icon name="phone" size={16} /> Llamar
                  </a>
                ) : null}
              </p>
              {delivery.direccion ? (
                map ? (
                  <a className="k-delivery-address" href={map} target="_blank" rel="noreferrer">
                    <Icon name="pin" size={18} /> {delivery.direccion}
                  </a>
                ) : (
                  <p className="k-delivery-address">{delivery.direccion}</p>
                )
              ) : null}
              <p className="k-small">{summarizeLines(orderLines(delivery.items))}</p>
              {notes.length > 0 ? (
                <p className="k-order-note">
                  <strong>Nota:</strong> {notes.join(" · ")}
                </p>
              ) : null}
              <p className={`k-delivery-pay${pending ? " is-pending" : ""}`}>
                {pending
                  ? `Cobro pendiente (${paymentLabel(delivery.metodo_pago)}): avisa al local antes de entregar`
                  : `Cobrar ${euros(Number(delivery.total))} · ${paymentLabel(delivery.metodo_pago)}`}
              </p>
              <p className="k-small k-muted">
                {delivery.local_nombre ? `${delivery.local_nombre} · ` : ""}
                Asignado {time.format(new Date(delivery.asignado_at))}
                {delivery.salida_at ? ` · salida ${time.format(new Date(delivery.salida_at))}` : ""}
              </p>
              {step ? (
                <button
                  type="button"
                  className="k-btn k-btn-go k-btn-block"
                  disabled={busy !== null}
                  onClick={() => void advance(delivery, step.action)}
                >
                  {busy === delivery.id ? "Guardando…" : step.label}
                </button>
              ) : delivery.estado !== "en_camino" ? (
                <p className="k-small k-muted">Aún se está preparando.</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {done.length > 0 ? (
        <section className="k-card k-cat" aria-label="Entregados hoy">
          <header className="k-cat-head">
            <h2 className="k-title">Entregados hoy</h2>
            <span className="k-muted k-small">{done.length}</span>
          </header>
          <ul className="k-items">
            {done.map((delivery) => (
              <li key={delivery.id} className="k-item">
                <span className="k-item-main">
                  <strong>{delivery.pedido_codigo ?? `#${delivery.id}`}</strong>
                  <span className="k-small k-muted">
                    {delivery.direccion ?? ""}
                    {delivery.entregado_at
                      ? ` · ${time.format(new Date(delivery.entregado_at))}`
                      : ""}
                  </span>
                </span>
                <span className="k-amount">{euros(Number(delivery.total))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
