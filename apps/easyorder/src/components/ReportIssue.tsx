"use client";

import { useId, useState } from "react";
import type { Api } from "@/lib/api";
import {
  INCIDENT_MAX,
  INCIDENT_OPTIONS,
  incidentFormError,
  incidentSendError,
} from "@/lib/incident";
import type { TrackedOrder } from "@/lib/types";

type Props = {
  readonly api: Api;
  readonly token: string;
  readonly order: TrackedOrder;
  /** Recarga el pedido tras enviar, para actualizar cuántas incidencias hay abiertas. */
  readonly onSent: () => void;
};

/** «¿Algún problema con tu pedido?»: el cliente abre una incidencia que el local ve en el panel. */
export function ReportIssue({ api, token, order, onSent }: Props) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const openCount = order.incidenciasAbiertas ?? 0;
  if (order.puedeReportar === undefined) return null;
  if (!order.puedeReportar && openCount === 0) return null;

  async function submit() {
    const problem = incidentFormError({ tipo, descripcion });
    if (problem) return setMessage(problem);
    setBusy(true);
    setMessage(null);
    const result = await api.reportIncident(token, { tipo, descripcion: descripcion.trim() });
    setBusy(false);
    if (!result.ok) return setMessage(incidentSendError(result.status, result.body?.reason));
    setSent(true);
    setOpen(false);
    setTipo("");
    setDescripcion("");
    onSent();
  }

  return (
    <section className="group card issue-box" aria-label="Problemas con el pedido">
      {sent && (
        <p role="status">Hemos avisado al local. Revisará tu incidencia lo antes posible.</p>
      )}
      {!sent && openCount > 0 && (
        <p className="muted">
          Tienes {openCount} {openCount === 1 ? "incidencia abierta" : "incidencias abiertas"}: el
          local la está revisando.
        </p>
      )}
      {order.puedeReportar && !open && (
        <>
          {!sent && openCount === 0 && <p className="muted">¿Algún problema con tu pedido?</p>}
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            {sent || openCount > 0 ? "Añadir otra incidencia" : "Avisar de un problema"}
          </button>
        </>
      )}
      {open && (
        <form
          className="issue-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="issue-types">
            <legend>¿Qué ha pasado?</legend>
            {INCIDENT_OPTIONS.map((option) => (
              <label key={option.value} className="issue-option">
                <input
                  type="radio"
                  name={`${fieldId}-tipo`}
                  value={option.value}
                  checked={tipo === option.value}
                  onChange={() => setTipo(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
          <label htmlFor={`${fieldId}-texto`}>Cuéntanos qué ha pasado</label>
          <textarea
            id={`${fieldId}-texto`}
            className="issue-text"
            rows={4}
            maxLength={INCIDENT_MAX}
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
          />
          {message && (
            <p className="muted" role="alert">
              {message}
            </p>
          )}
          <div className="cancel-actions">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? "Enviando…" : "Enviar al local"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
