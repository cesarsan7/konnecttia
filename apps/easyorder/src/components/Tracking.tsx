"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createApi } from "@/lib/api";
import { brandStyle, publicLogo } from "@/lib/brand";
import { ORDER_STATUS_LABEL, paymentLabel, trackingSteps } from "@/lib/checkout";
import { euros } from "@/lib/format";
import { needsPaymentInfo } from "@/lib/payment-proof";
import { copyText, isClosed } from "@/lib/tracking";
import type { TrackedOrder } from "@/lib/types";
import { CancelOrder } from "./CancelOrder";
import { EmailAvisos } from "./EmailAvisos";
import { PaymentProof } from "./PaymentProof";
import { ReportIssue } from "./ReportIssue";
import "./tracking.css";

const REFRESH_MS = 15_000;
const COPIED_MS = 3_000;

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

/**
 * Aviso mientras el pedido sigue abierto: no cerrar la página y cómo volver con el enlace.
 * Si el navegador no deja copiar, se muestra la URL seleccionada para copiarla a mano.
 */
function KeepOpenNotice() {
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (manualUrl) field.current?.select();
  }, [manualUrl]);

  async function copyLink() {
    const url = window.location.href;
    if (await copyText(url, navigator.clipboard)) {
      setManualUrl(null);
      setCopied(true);
    } else {
      setManualUrl(url);
    }
  }

  return (
    <section className="track-notice" aria-label="Guarda el enlace de tu pedido">
      <p className="track-notice-title">
        No cierres esta página: aquí verás el estado de tu pedido.
      </p>
      <p className="track-notice-hint">Si la cierras, vuelve con este enlace.</p>
      <div className="track-notice-actions">
        <button type="button" className="btn" onClick={copyLink}>
          Copiar enlace
        </button>
        <span className="track-notice-done" role="status">
          {copied ? "Enlace copiado" : ""}
        </span>
      </div>
      {manualUrl && (
        <input
          ref={field}
          className="track-notice-url"
          readOnly
          value={manualUrl}
          aria-label="Enlace de tu pedido"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </section>
  );
}

/** Estado del pedido, actualizado cada 15 s mientras no termine. */
export function Tracking({ apiUrl, slug, token, initialOrder }: Props) {
  const api = useMemo(() => createApi(apiUrl), [apiUrl]);
  const [order, setOrder] = useState(initialOrder);

  const refresh = useCallback(async () => {
    const result = await api.tracking(token);
    if (result.ok) setOrder(result.data);
  }, [api, token]);

  useEffect(() => {
    if (isClosed(order.estado)) return;
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh, order.estado]);

  const steps = trackingSteps(order.tipoDespacho);
  const current = steps.indexOf(order.estado === "pagado" ? "confirmado" : order.estado);
  const items = (Array.isArray(order.items) ? (order.items as StoredItem[]) : []).map(
    (item, position) => ({ ...describeItem(item), position }),
  );
  const logo = publicLogo(order.logoUrl);
  const cancelled = order.estado === "cancelado" || order.estado === "expirado";

  return (
    <main className="shell" style={brandStyle(order.colorMarca)}>
      <header className="store-head">
        {logo && (
          // biome-ignore lint/performance/noImgElement: logo del restaurante en una URL externa (Storage)
          <img className="store-logo" src={logo} alt={`Logo de ${order.restaurante}`} />
        )}
        <p className="muted">{order.restaurante}</p>
        <h1 className="title">
          Pedido {order.pedidoCodigo ? `#${order.pedidoCodigo}` : "recibido"}
        </h1>
        <p className="status-line" aria-live="polite">
          <span className={`badge ${cancelled ? "closed" : "open"}`}>
            {ORDER_STATUS_LABEL[order.estado] ?? order.estado}
          </span>
          {order.tiempoEstimado && !isClosed(order.estado) && (
            <span className="muted">Tiempo estimado: {order.tiempoEstimado}</span>
          )}
        </p>
      </header>

      {!isClosed(order.estado) && <KeepOpenNotice />}

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

      {needsPaymentInfo(order) && (
        <PaymentProof api={api} token={token} order={order} onUploaded={refresh} />
      )}

      <CancelOrder api={api} token={token} order={order} onChanged={refresh} />

      <ReportIssue api={api} token={token} order={order} onSent={refresh} />

      <EmailAvisos api={api} token={token} order={order} onSaved={refresh} />

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
