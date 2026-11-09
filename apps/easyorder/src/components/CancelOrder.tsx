"use client";

import { useState } from "react";
import type { Api } from "@/lib/api";
import { contactHref, isClosed } from "@/lib/tracking";
import type { TrackedOrder } from "@/lib/types";

type Props = {
  readonly api: Api;
  readonly token: string;
  readonly order: TrackedOrder;
  /** Recarga el pedido tras cancelar (o si el local lo aceptó entretanto). */
  readonly onChanged: () => void;
};

/**
 * Cancelar el pedido (pieza O): el cliente puede mientras el local no lo ha aceptado. Después, el
 * seguimiento solo ofrece contactar con el local, que decide.
 */
export function CancelOrder({ api, token, order, onChanged }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (isClosed(order.estado)) return null;

  async function cancel() {
    setBusy(true);
    setMessage(null);
    const result = await api.cancelOrder(token);
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      onChanged();
      return;
    }
    setMessage(
      result.status === 409
        ? "El local ya aceptó tu pedido: ya no se puede cancelar desde aquí. Contacta con el local."
        : "No hemos podido cancelar el pedido. Inténtalo de nuevo.",
    );
    if (result.status === 409) onChanged();
  }

  if (!order.puedeCancelar) {
    const href = contactHref(order.contactoTelefono);
    return (
      <section className="group card cancel-box" aria-label="Cambios en el pedido">
        <p>
          El local ya aceptó tu pedido. Si necesitas cambiar o anular algo, contacta con el local.
        </p>
        {href ? (
          <a className="btn" href={href}>
            Contactar con el local
          </a>
        ) : null}
        {message && (
          <p className="muted" role="status">
            {message}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="group card cancel-box" aria-label="Cancelar el pedido">
      {confirming ? (
        <>
          <p>¿Seguro que quieres cancelar el pedido? No se puede deshacer.</p>
          <div className="cancel-actions">
            <button type="button" className="btn danger" disabled={busy} onClick={cancel}>
              {busy ? "Cancelando…" : "Sí, cancelar pedido"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              No, mantenerlo
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Puedes cancelarlo mientras el local no lo haya aceptado.</p>
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Cancelar pedido
          </button>
        </>
      )}
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
