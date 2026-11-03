"use client";

import { useEffect, useMemo, useState } from "react";
import { createApi } from "@/lib/api";
import { ORDER_STATUS_LABEL, paymentLabel, trackingSteps } from "@/lib/checkout";
import { euros } from "@/lib/format";
import type { TrackedOrder } from "@/lib/types";

const REFRESH_MS = 15_000;
const FINAL = new Set(["entregado", "cancelado", "expirado"]);

type Props = {
  readonly apiUrl: string;
  readonly slug: string;
  readonly token: string;
  readonly initialOrder: TrackedOrder;
};

/** Ítems guardados por la web (item_name…) o por el agente de WhatsApp (nombre…). */
type StoredItem = {
  item_name?: string;
  variant_name?: string;
  quantity?: number;
  nombre?: string;
  variante?: string;
  cantidad?: number;
};

function describeItem(item: StoredItem) {
  return {
    name: item.item_name ?? item.nombre ?? "Producto",
    variant: item.variant_name ?? item.variante ?? null,
    quantity: item.quantity ?? item.cantidad ?? 1,
  };
}

/** Estado del pedido, actualizado cada 15 s mientras no termine. */
export function Tracking({ apiUrl, slug, token, initialOrder }: Props) {
  const api = useMemo(() => createApi(apiUrl), [apiUrl]);
  const [order, setOrder] = useState(initialOrder);

  useEffect(() => {
    if (FINAL.has(order.estado)) return;
    const timer = window.setInterval(async () => {
      const result = await api.tracking(token);
      if (result.ok) setOrder(result.data);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [api, token, order.estado]);

  const steps = trackingSteps(order.tipoDespacho);
  const current = steps.indexOf(order.estado === "pagado" ? "confirmado" : order.estado);
  const items = (Array.isArray(order.items) ? (order.items as StoredItem[]) : []).map(
    (item, position) => ({ ...describeItem(item), position }),
  );
  const cancelled = order.estado === "cancelado" || order.estado === "expirado";

  return (
    <main className="shell">
      <header className="store-head">
        <p className="muted">{order.restaurante}</p>
        <h1 className="title">
          Pedido {order.pedidoCodigo ? `#${order.pedidoCodigo}` : "recibido"}
        </h1>
        <p className="status-line" aria-live="polite">
          <span className={`badge ${cancelled ? "closed" : "open"}`}>
            {ORDER_STATUS_LABEL[order.estado] ?? order.estado}
          </span>
          {order.tiempoEstimado && !FINAL.has(order.estado) && (
            <span className="muted">Tiempo estimado: {order.tiempoEstimado}</span>
          )}
        </p>
      </header>

      {!cancelled && (
        <ol className="steps">
          {steps.map((step, index) => (
            <li
              key={step}
              className={index <= current ? "done" : ""}
              aria-current={index === current ? "step" : undefined}
            >
              {ORDER_STATUS_LABEL[step]}
            </li>
          ))}
        </ol>
      )}

      {order.estadoPago === "pendiente" && order.datosBancarios && (
        <section className="group card">
          <h2>Datos para la transferencia</h2>
          <dl className="totals">
            {Object.entries(order.datosBancarios).map(([key, value]) => (
              <div key={key}>
                <dt className="capitalize">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="muted small">
            Envía el justificante al local. Prepararán el pedido cuando confirmen el pago.
          </p>
        </section>
      )}

      <section className="group card">
        <h2>{order.tipoDespacho === "delivery" ? "Entrega a domicilio" : "Recogida"}</h2>
        {order.local && (
          <p>
            {order.tipoDespacho === "delivery" ? "Sale de " : "En "}
            <strong>{order.local.nombre}</strong>
            {order.local.direccion && <span className="muted"> · {order.local.direccion}</span>}
          </p>
        )}
        <ul className="lines compact">
          {items.map((item) => (
            <li key={item.position} className="line">
              <span>
                {item.quantity}× {item.name}
                {item.variant && <span className="muted"> · {item.variant}</span>}
              </span>
            </li>
          ))}
        </ul>
        <dl className="totals">
          {order.costoEnvio > 0 && (
            <div>
              <dt>Envío</dt>
              <dd>{euros(order.costoEnvio)}</dd>
            </div>
          )}
          <div className="total">
            <dt>Total</dt>
            <dd>{euros(order.total)}</dd>
          </div>
          {order.metodoPago && (
            <div>
              <dt>Pago</dt>
              <dd>{paymentLabel(order.metodoPago)}</dd>
            </div>
          )}
        </dl>
      </section>

      <p className="center">
        <a href={`/${slug}`}>Volver a la carta</a>
      </p>
      <footer className="powered">Pedidos con EasyOrder · Konnecttia</footer>
    </main>
  );
}
