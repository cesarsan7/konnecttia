"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoment } from "@/lib/panel/activity";
import { describePanelError } from "@/lib/panel/api";
import { formatPhone } from "@/lib/panel/customers";
import { type Handoff, type HandoffList, handoffError, handoffLabel } from "@/lib/panel/incidents";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly list: HandoffList }
  | { readonly kind: "error"; readonly message: string };

const FILTERS = [
  { value: "pendiente", label: "Pendientes" },
  { value: "resuelta", label: "Atendidas" },
  { value: "todas", label: "Todas" },
] as const;

/** Casos que el agente de WhatsApp pasó a una persona del restaurante. */
export function HandoffsPanel() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [filter, setFilter] = useState<string>("pendiente");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = can(PERMISSION.AgentHandoffsManage);

  const load = useCallback(async () => {
    const result = await api.handoffs(slug, filter, page);
    setState(
      result.ok
        ? { kind: "ready", list: result.data }
        : { kind: "error", message: describePanelError(result.status, result.body) },
    );
  }, [api, slug, filter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function change(handoff: Handoff, estado: "resuelta" | "pendiente") {
    setBusyId(handoff.id);
    setError(null);
    const result = await api.updateHandoff(slug, handoff.id, estado);
    setBusyId(null);
    if (!result.ok) return setError(handoffError(result.status));
    await load();
  }

  const list = state.kind === "ready" ? state.list : null;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.por_pagina)) : 1;

  return (
    <section aria-label="Derivaciones del agente">
      <p className="k-muted k-small">
        Conversaciones que el agente de WhatsApp pasó a una persona. Mientras estén pendientes, el
        agente no responde a ese cliente; al marcarlas atendidas, vuelve a hacerlo.
      </p>

      <fieldset className="k-inc-filters">
        <legend className="k-sr-only">Filtrar derivaciones</legend>
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
            {item.value === "pendiente" && list ? ` (${list.abiertas})` : ""}
          </button>
        ))}
      </fieldset>

      {error ? <p className="k-alert">{error}</p> : null}
      {state.kind === "loading" ? <p className="k-muted">Cargando…</p> : null}
      {state.kind === "error" ? <p className="k-alert">{state.message}</p> : null}
      {list && list.derivaciones.length === 0 ? (
        <p className="k-muted">No hay derivaciones {filter === "pendiente" ? "pendientes" : ""}.</p>
      ) : null}

      {list ? (
        <ul className="k-inc-list">
          {list.derivaciones.map((handoff) => (
            <li key={handoff.id} className="k-card k-inc-item">
              <div className="k-inc-head">
                <strong>{formatPhone(handoff.telefono)}</strong>
                <span className="k-chip">{handoffLabel(handoff.motivo)}</span>
                <span className={`k-chip ${handoff.estado === "pendiente" ? "k-chip-alert" : ""}`}>
                  {handoff.estado === "pendiente" ? "Pendiente" : "Atendida"}
                </span>
                <span className="k-muted k-small">{formatMoment(handoff.created_at, tz)}</span>
              </div>
              <p className="k-inc-text">{handoff.resumen || "(sin resumen)"}</p>
              {handoff.estado === "resuelta" ? (
                <p className="k-muted k-small">
                  Atendida {formatMoment(handoff.resolved_at, tz)}
                  {handoff.resolved_by ? ` por ${handoff.resolved_by}` : ""}
                </p>
              ) : null}
              {canManage ? (
                <div className="k-inc-actions">
                  {handoff.estado === "pendiente" ? (
                    <button
                      type="button"
                      className="k-btn k-btn-primary k-btn-sm"
                      disabled={busyId === handoff.id}
                      onClick={() => void change(handoff, "resuelta")}
                    >
                      Marcar atendida
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="k-btn k-btn-sm"
                      disabled={busyId === handoff.id}
                      onClick={() => void change(handoff, "pendiente")}
                    >
                      Reabrir
                    </button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
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
    </section>
  );
}
