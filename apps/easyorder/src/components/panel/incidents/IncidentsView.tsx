"use client";

import { useCallback, useEffect, useState } from "react";
import { ORDER_STATUS_LABEL } from "@/lib/checkout";
import { formatMoment } from "@/lib/panel/activity";
import { describePanelError } from "@/lib/panel/api";
import { formatPhone } from "@/lib/panel/customers";
import {
  type Incident,
  type IncidentList,
  incidentError,
  incidentHandler,
  incidentLabel,
} from "@/lib/panel/incidents";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";
import "./incidents.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly list: IncidentList }
  | { readonly kind: "error"; readonly message: string };

const FILTERS = [
  { value: "abierta", label: "Abiertas" },
  { value: "resuelta", label: "Resueltas" },
  { value: "todas", label: "Todas" },
] as const;

/** Incidencias que los clientes abren desde el seguimiento de su pedido (pieza P). */
export function IncidentsView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [filter, setFilter] = useState<string>("abierta");
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canResolve = can(PERMISSION.OrdersUpdate);

  const load = useCallback(async () => {
    const result = await api.incidents(slug, filter, page);
    setState(
      result.ok
        ? { kind: "ready", list: result.data }
        : { kind: "error", message: describePanelError(result.status, result.body) },
    );
  }, [api, slug, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(incident: Incident, estado: "resuelta" | "abierta") {
    setBusyId(incident.id);
    setError(null);
    const result = await api.resolveIncident(slug, incident.id, estado, notes[incident.id]?.trim());
    setBusyId(null);
    if (!result.ok) return setError(incidentError(result.status));
    await load();
  }

  const list = state.kind === "ready" ? state.list : null;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.por_pagina)) : 1;

  return (
    <div className="k-page k-incidents">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">{access.restaurante.nombre}</p>
          <h1 className="k-heading">Incidencias</h1>
        </div>
      </header>
      <p className="k-muted k-small">
        Problemas que tus clientes cuentan desde el seguimiento de su pedido. Resuélvelas cuando las
        hayas atendido.
      </p>

      <fieldset className="k-inc-filters">
        <legend className="k-sr-only">Filtrar incidencias</legend>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`k-btn k-btn-sm${filter === item.value ? " k-btn-primary" : ""}`}
            aria-pressed={filter === item.value}
            onClick={() => {
              setFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}
            {item.value === "abierta" && list ? ` (${list.abiertas})` : ""}
          </button>
        ))}
      </fieldset>

      {error ? <p className="k-alert">{error}</p> : null}
      {state.kind === "loading" ? <p className="k-muted">Cargando…</p> : null}
      {state.kind === "error" ? <p className="k-alert">{state.message}</p> : null}
      {list && list.incidencias.length === 0 ? (
        <p className="k-muted">No hay incidencias {filter === "abierta" ? "abiertas" : ""}.</p>
      ) : null}

      {list ? (
        <ul className="k-inc-list">
          {list.incidencias.map((incident) => {
            const handler = incidentHandler(incident);
            return (
              <li key={incident.id} className="k-card k-inc-item">
                <div className="k-inc-head">
                  <strong>
                    {incident.pedido_codigo
                      ? `#${incident.pedido_codigo}`
                      : `Pedido ${incident.pedido_id}`}
                  </strong>
                  <span className="k-chip">{incidentLabel(incident.tipo)}</span>
                  <span className={`k-chip ${incident.estado === "abierta" ? "k-chip-alert" : ""}`}>
                    {incident.estado === "abierta" ? "Abierta" : "Resuelta"}
                  </span>
                  <span className="k-muted k-small">{formatMoment(incident.created_at, tz)}</span>
                </div>
                <p className="k-inc-text">{incident.descripcion || "(texto borrado)"}</p>
                <p className="k-muted k-small">
                  {incident.nombre_pedido ?? "Cliente"} · {formatPhone(incident.telefono)} · Pedido{" "}
                  {(
                    ORDER_STATUS_LABEL[incident.pedido_estado] ?? incident.pedido_estado
                  ).toLowerCase()}
                  {incident.local_nombre ? ` · ${incident.local_nombre}` : ""}
                  {handler ? ` · ${handler}` : ""}
                </p>
                {incident.estado === "resuelta" ? (
                  <p className="k-muted k-small">
                    Resuelta {formatMoment(incident.resuelta_at, tz)}
                    {incident.resuelta_por ? ` por ${incident.resuelta_por}` : ""}
                    {incident.nota_resolucion ? `: ${incident.nota_resolucion}` : ""}
                  </p>
                ) : null}
                {canResolve ? (
                  <div className="k-inc-actions">
                    {incident.estado === "abierta" ? (
                      <>
                        <input
                          className="k-input"
                          placeholder="Nota (opcional)"
                          maxLength={500}
                          aria-label="Nota de resolución"
                          value={notes[incident.id] ?? ""}
                          onChange={(event) =>
                            setNotes({ ...notes, [incident.id]: event.target.value })
                          }
                        />
                        <button
                          type="button"
                          className="k-btn k-btn-primary k-btn-sm"
                          disabled={busyId === incident.id}
                          onClick={() => void change(incident, "resuelta")}
                        >
                          Marcar resuelta
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="k-btn k-btn-sm"
                        disabled={busyId === incident.id}
                        onClick={() => void change(incident, "abierta")}
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {pages > 1 ? (
        <div className="k-inc-pages">
          <button
            type="button"
            className="k-btn k-btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span className="k-muted k-small">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            className="k-btn k-btn-sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
