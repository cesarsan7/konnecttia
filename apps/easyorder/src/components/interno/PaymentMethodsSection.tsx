"use client";

import { useState } from "react";
import {
  methodsThatWouldBeRemoved,
  paymentLabel,
  platformErrorMessage,
  samePaymentSelection,
} from "@/lib/interno/logic";
import type { RestaurantDetail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./payment-methods.css";

type Props = {
  readonly detail: RestaurantDetail;
  readonly onChanged: () => Promise<void>;
};

export function PaymentMethodsSection({ detail, onChanged }: Props) {
  const { api, canWrite, toast } = usePlatform();
  const { catalogo, permitidos, activos } = detail.metodos_pago;
  // null = sin límite: todos los métodos que existan.
  const [selection, setSelection] = useState<readonly string[] | null>(permitidos);
  const [busy, setBusy] = useState(false);

  const unchanged = samePaymentSelection(permitidos, selection);
  const empty = selection !== null && selection.length === 0;
  const removed = methodsThatWouldBeRemoved(activos, selection);

  function toggle(method: string) {
    const current = selection ?? catalogo;
    setSelection(
      current.includes(method) ? current.filter((m) => m !== method) : [...current, method],
    );
  }

  async function save() {
    setBusy(true);
    const result = await api.changePaymentMethods(detail.restaurante.id, selection);
    setBusy(false);
    if (!result.ok) {
      toast(platformErrorMessage(result.status, result.body), "error");
      return;
    }
    const quitados = result.data.metodos_quitados.map(paymentLabel);
    toast(
      quitados.length > 0
        ? `Guardado. Se quitó de sus métodos activos: ${quitados.join(", ")}.`
        : "Métodos permitidos guardados.",
    );
    if (result.data.sin_metodos_activos) {
      toast("El restaurante se ha quedado sin ningún método de pago activo.", "error");
    }
    await onChanged();
  }

  return (
    <section className="k-card k-mp" aria-labelledby="mp-title">
      <h2 id="mp-title" className="k-title">
        Métodos de pago permitidos
      </h2>
      <p className="k-muted k-small">
        Lo que este restaurante puede activar en sus Ajustes. Ahora tiene activos:{" "}
        {activos.length > 0 ? activos.map(paymentLabel).join(", ") : "ninguno"}.
      </p>

      <fieldset className="k-mp-set" disabled={!canWrite || busy}>
        <legend className="k-sr-only">Métodos de pago permitidos</legend>
        <label className="k-mp-option">
          <input
            type="checkbox"
            checked={selection === null}
            onChange={(event) => setSelection(event.target.checked ? null : [...catalogo])}
          />
          <span>Todos (sin límite)</span>
        </label>
        {catalogo.map((method) => (
          <label key={method} className="k-mp-option">
            <input
              type="checkbox"
              checked={selection === null || selection.includes(method)}
              disabled={selection === null}
              onChange={() => toggle(method)}
            />
            <span>{paymentLabel(method)}</span>
          </label>
        ))}
      </fieldset>

      {removed.length > 0 ? (
        <p className="k-warn" role="status">
          Al guardar se quitará de lo que el restaurante tiene activo:{" "}
          {removed.map(paymentLabel).join(", ")}.
        </p>
      ) : null}
      {empty ? <p className="k-alert">Elige al menos un método, o marca «Todos».</p> : null}

      {canWrite ? (
        <div className="k-mp-actions">
          <button
            type="button"
            className="k-btn k-btn-primary"
            disabled={busy || unchanged || empty}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        <p className="k-muted k-small">Tu rol es de consulta: no puedes cambiar los métodos.</p>
      )}
    </section>
  );
}
