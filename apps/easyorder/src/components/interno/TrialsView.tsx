"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { platformErrorMessage } from "@/lib/interno/logic";
import {
  filterCounts,
  filterTrials,
  isExpired,
  parseExtension,
  TRIAL_FILTER,
  TRIAL_FILTER_LABEL,
  type TrialFilter,
  trialLabel,
  trialReasonMessage,
  usageText,
} from "@/lib/interno/trials";
import type { TrialAction, TrialList, TrialRow } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./trials.css";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: TrialList }
  | { readonly kind: "error"; readonly message: string };

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });

const FILTERS = Object.values(TRIAL_FILTER);

/** Pruebas gratuitas del alta autoservicio: ver, aprobar o rechazar, ampliar y convertir. */
export function TrialsView() {
  const { api } = usePlatform();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [filter, setFilter] = useState<TrialFilter>(TRIAL_FILTER.All);

  const load = useCallback(async () => {
    const result = await api.trials();
    setState(
      result.ok
        ? { kind: "ready", data: result.data }
        : { kind: "error", message: platformErrorMessage(result.status, result.body) },
    );
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.kind === "ready" ? state.data.pruebas : [];
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const shown = useMemo(() => filterTrials(rows, filter), [rows, filter]);

  return (
    <div className="k-page">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">Konnecttia</p>
          <h1 className="k-heading">Pruebas</h1>
        </div>
        <div className="k-head-tools">
          <Link href="/interno/alta" className="k-btn k-btn-secondary k-tr-link">
            Configuración del alta
          </Link>
        </div>
      </header>

      {state.kind === "loading" ? (
        <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
      ) : state.kind === "error" ? (
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
          <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <fieldset className="k-segment k-tr-filters">
            <legend className="k-sr-only">Filtrar pruebas</legend>
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                className={filter === option ? "is-on" : ""}
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
              >
                {TRIAL_FILTER_LABEL[option]} ({counts[option]})
              </button>
            ))}
          </fieldset>
          {shown.length === 0 ? (
            <p className="k-card k-muted">
              {rows.length === 0
                ? "Aún no hay pruebas. Aparecerán aquí cuando alguien se dé de alta desde /alta."
                : "Ninguna prueba en este filtro."}
            </p>
          ) : (
            <ul className="k-tr-list">
              {shown.map((row) => (
                <li key={row.restaurante_id}>
                  <TrialCard row={row} plans={state.data.planes} onChanged={load} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

type Panel = "ampliar" | "convertir" | null;

function TrialCard({
  row,
  plans,
  onChanged,
}: {
  readonly row: TrialRow;
  readonly plans: TrialList["planes"];
  readonly onChanged: () => Promise<void>;
}) {
  const { api, canWrite, toast } = usePlatform();
  const [panel, setPanel] = useState<Panel>(null);
  const [days, setDays] = useState("");
  const [orders, setOrders] = useState("");
  const [plan, setPlan] = useState(plans[0]?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = trialLabel(row);

  async function run(action: TrialAction, done: string) {
    setBusy(true);
    setError(null);
    const result = await api.trialAction(row.restaurante_id, action);
    setBusy(false);
    if (!result.ok) {
      setError(
        trialReasonMessage((result.body as { reason?: string } | null)?.reason) ??
          platformErrorMessage(result.status, result.body),
      );
      return;
    }
    toast(done);
    setPanel(null);
    setDays("");
    setOrders("");
    await onChanged();
  }

  async function extend(event: FormEvent) {
    event.preventDefault();
    const parsed = parseExtension(days, orders, row);
    if (!parsed.ok) return setError(parsed.error);
    await run(parsed.body, "Prueba ampliada.");
  }

  async function convert(event: FormEvent) {
    event.preventDefault();
    if (!plan) return setError("Elige el plan al que pasa.");
    setBusy(true);
    setError(null);
    const result = await api.convertTrial(row.restaurante_id, plan);
    setBusy(false);
    if (!result.ok) {
      setError(
        trialReasonMessage((result.body as { reason?: string } | null)?.reason) ??
          platformErrorMessage(result.status, result.body),
      );
      return;
    }
    toast(`Convertida al plan ${plans.find((p) => p.code === plan)?.nombre ?? plan}.`);
    setPanel(null);
    await onChanged();
  }

  const canApprove = row.estado === "pendiente" || row.estado === "rechazada";
  const canReject = row.estado === "pendiente" || row.estado === "activa";
  const canExtend = row.estado === "activa" && (row.fin !== null || row.max_pedidos !== null);
  const canConvert = row.estado !== "convertida";

  return (
    <article className="k-card k-tr-card">
      <div className="k-tr-main">
        <div className="k-tr-who">
          <Link href={`/interno/${row.restaurante_id}`} className="k-tr-name">
            {row.nombre}
          </Link>
          <span className="k-muted k-small k-ellipsis">
            /{row.slug ?? "sin enlace"} · {row.email ?? "sin email"}
          </span>
        </div>
        <span className={`k-tr-state is-${label.tone}`}>{label.text}</span>
      </div>
      <dl className="k-tr-facts">
        <div>
          <dt>Consumo</dt>
          <dd>{usageText(row)}</dd>
        </div>
        <div>
          <dt>Inicio</dt>
          <dd>{day.format(new Date(row.inicio))}</dd>
        </div>
        <div>
          <dt>Fin</dt>
          <dd>{row.fin ? day.format(new Date(row.fin)) : "Sin límite de días"}</dd>
        </div>
        <div>
          <dt>Pedidos online</dt>
          <dd>{row.acepta_pedidos ? "Los acepta" : "No los acepta"}</dd>
        </div>
      </dl>

      {canWrite ? (
        <div className="k-tr-actions">
          {canApprove ? (
            <button
              type="button"
              className="k-btn k-btn-primary k-btn-sm"
              disabled={busy}
              onClick={() => run({ accion: "aprobar" }, "Prueba aprobada.")}
            >
              {row.estado === "rechazada" ? "Aprobar de todos modos" : "Aprobar"}
            </button>
          ) : null}
          {canReject ? (
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              disabled={busy}
              onClick={() => run({ accion: "rechazar" }, "Prueba rechazada.")}
            >
              {row.estado === "activa" ? "Suspender" : "Rechazar"}
            </button>
          ) : null}
          {canExtend ? (
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              aria-expanded={panel === "ampliar"}
              disabled={busy}
              onClick={() => {
                setError(null);
                setPanel(panel === "ampliar" ? null : "ampliar");
              }}
            >
              Ampliar
            </button>
          ) : null}
          {canConvert ? (
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              aria-expanded={panel === "convertir"}
              disabled={busy}
              onClick={() => {
                setError(null);
                setPanel(panel === "convertir" ? null : "convertir");
              }}
            >
              Convertir a plan de pago
            </button>
          ) : null}
        </div>
      ) : (
        <p className="k-muted k-small">Tu rol es de consulta: no puedes cambiar las pruebas.</p>
      )}

      {panel === "ampliar" ? (
        <form className="k-tr-form" onSubmit={extend} noValidate>
          <p className="k-muted k-small">
            {isExpired(row)
              ? "Los días nuevos se suman a partir de hoy, no del fin anterior."
              : "Los días se suman al fin actual; los pedidos, al máximo."}
          </p>
          <div className="k-tr-fields">
            {row.fin !== null ? (
              <label className="k-field">
                <span>Días a añadir</span>
                <input
                  inputMode="numeric"
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </label>
            ) : null}
            {row.max_pedidos !== null ? (
              <label className="k-field">
                <span>Pedidos a añadir</span>
                <input
                  inputMode="numeric"
                  value={orders}
                  onChange={(event) => setOrders(event.target.value)}
                />
              </label>
            ) : null}
          </div>
          <button type="submit" className="k-btn k-btn-primary k-btn-sm" disabled={busy}>
            {busy ? "Guardando…" : "Ampliar prueba"}
          </button>
        </form>
      ) : null}

      {panel === "convertir" ? (
        <form className="k-tr-form" onSubmit={convert} noValidate>
          <p className="k-muted k-small">
            Se cambia el plan y se sincronizan los módulos de origen «plan» (los complementos y
            cortesías se respetan). La prueba deja de tener límites.
          </p>
          <label className="k-field">
            <span>Plan</span>
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              {plans.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="k-btn k-btn-primary k-btn-sm" disabled={busy || !plan}>
            {busy ? "Convirtiendo…" : "Sí, convertir"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="k-alert" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}
