"use client";

import "./activity.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { euros } from "@/lib/format";
import {
  type ActivityPeople,
  activityErrorMessage,
  actorLabel,
  type DriverActivity,
  formatMoment,
  type OrderTrace,
  type WaiterActivity,
} from "@/lib/panel/activity";
import { paymentLabel, STATUS_LABEL } from "@/lib/panel/orders";
import { formatMinutes, presetRange, RANGE_PRESETS, type RangePreset } from "@/lib/panel/stats";
import type { PanelBranch } from "@/lib/panel/types";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Person = { readonly kind: "driver" | "waiter"; readonly id: number; readonly label: string };
type Load<T> =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: T }
  | { readonly kind: "error"; readonly message: string };

const statusOf = (estado: string) => STATUS_LABEL[estado] ?? estado;

/**
 * Actividad de repartidores y meseros (solo lectura). Quien gestiona el equipo o el local ve a
 * todos (dentro de sus locales); cada repartidor o mesero ve solo lo suyo. El servidor decide.
 */
export function ActivityView() {
  const { api } = usePanel();
  const { slug, access } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [people, setPeople] = useState<Load<ActivityPeople>>({ kind: "loading" });
  const [selected, setSelected] = useState<Person | null>(null);
  const [preset, setPreset] = useState<RangePreset | "custom">("7d");
  const [range, setRange] = useState(() => presetRange("7d", tz));
  const [branches, setBranches] = useState<PanelBranch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [driver, setDriver] = useState<Load<DriverActivity>>({ kind: "idle" });
  const [waiter, setWaiter] = useState<Load<WaiterActivity>>({ kind: "idle" });
  const [trace, setTrace] = useState<Load<OrderTrace>>({ kind: "idle" });

  useEffect(() => {
    api.branches(slug).then((result) => {
      if (result.ok) setBranches(result.data.locales);
    });
    api.activityPeople(slug).then((result) => {
      setPeople(
        result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", message: activityErrorMessage(result.status) },
      );
    });
  }, [api, slug]);

  const options = useMemo<Person[]>(() => {
    if (people.kind !== "ready") return [];
    return [
      ...people.data.repartidores.map((d) => ({
        kind: "driver" as const,
        id: d.membership_id,
        label: `Repartidor · ${d.nombre ?? d.email ?? `#${d.membership_id}`}`,
      })),
      ...people.data.meseros.map((w) => ({
        kind: "waiter" as const,
        id: w.id,
        label: `Mesero · ${w.nombre}${w.activo ? "" : " (baja)"}`,
      })),
    ];
  }, [people]);

  // Quien solo ve a una persona (su propia ficha) la tiene ya seleccionada.
  useEffect(() => {
    if (!selected && options.length === 1) setSelected(options[0] ?? null);
  }, [options, selected]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ desde: range.desde, hasta: range.hasta });
    if (branchId) params.set("sucursal_id", String(branchId));
    return params.toString();
  }, [range, branchId]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const done = <T,>(
      set: (state: Load<T>) => void,
      result: { ok: true; data: T } | { ok: false; status: number },
    ) => {
      if (!active) return;
      set(
        result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", message: activityErrorMessage(result.status) },
      );
    };
    if (selected.kind === "driver") {
      setDriver({ kind: "loading" });
      api.driverActivity(slug, selected.id, query).then((r) => done(setDriver, r));
    } else {
      setWaiter({ kind: "loading" });
      api.waiterActivity(slug, selected.id, query).then((r) => done(setWaiter, r));
    }
    return () => {
      active = false;
    };
  }, [api, slug, selected, query]);

  const openTrace = useCallback(
    async (orderId: number) => {
      setTrace({ kind: "loading" });
      const result = await api.orderTrace(slug, orderId);
      setTrace(
        result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", message: activityErrorMessage(result.status) },
      );
    },
    [api, slug],
  );

  return (
    <div className="k-page k-activity">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">{access.restaurante.nombre}</p>
          <h1 className="k-heading">Actividad del equipo</h1>
        </div>
      </header>

      {people.kind === "loading" ? <div className="k-skeleton" aria-busy="true" /> : null}
      {people.kind === "error" ? <p className="k-alert">{people.message}</p> : null}
      {people.kind === "ready" && options.length === 0 ? (
        <p className="k-card">
          No hay repartidores ni meseros que puedas consultar. Se ven en esta pantalla las personas
          con el rol Repartidor o Mesero.
        </p>
      ) : null}

      {options.length > 0 ? (
        <section className="k-card k-activity-filters" aria-label="Filtros">
          <label className="k-select">
            <span className="k-small k-muted">Persona</span>
            <select
              value={selected ? `${selected.kind}:${selected.id}` : ""}
              onChange={(event) => {
                setSelected(
                  options.find((o) => `${o.kind}:${o.id}` === event.target.value) ?? null,
                );
              }}
            >
              <option value="">Elige a alguien…</option>
              {options.map((option) => (
                <option key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="k-range" aria-label="Periodo">
            {RANGE_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={preset === item.id ? "is-on" : ""}
                aria-pressed={preset === item.id}
                onClick={() => {
                  setPreset(item.id);
                  setRange(presetRange(item.id, tz));
                }}
              >
                {item.label}
              </button>
            ))}
          </fieldset>
          <div className="k-dates">
            <label>
              <span className="k-small k-muted">Desde</span>
              <input
                type="date"
                value={range.desde}
                max={range.hasta}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setPreset("custom");
                  setRange((current) => ({ ...current, desde: event.target.value }));
                }}
              />
            </label>
            <label>
              <span className="k-small k-muted">Hasta</span>
              <input
                type="date"
                value={range.hasta}
                min={range.desde}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setPreset("custom");
                  setRange((current) => ({ ...current, hasta: event.target.value }));
                }}
              />
            </label>
          </div>
          {branches.length > 1 ? (
            <label className="k-select">
              <span className="k-small k-muted">Local</span>
              <select
                value={branchId ?? ""}
                onChange={(event) =>
                  setBranchId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Todos los locales</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>
      ) : null}

      {selected?.kind === "driver" ? (
        <DriverCard state={driver} tz={tz} onOpen={openTrace} />
      ) : null}
      {selected?.kind === "waiter" ? (
        <WaiterCard state={waiter} tz={tz} onOpen={openTrace} />
      ) : null}

      {trace.kind !== "idle" ? (
        <Modal title="Quién y cuándo" onClose={() => setTrace({ kind: "idle" })} wide>
          <TraceBody state={trace} tz={tz} />
        </Modal>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="k-stat">
      <span className="k-small k-muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Pending({ state }: { readonly state: Load<unknown> }) {
  if (state.kind === "loading") return <div className="k-skeleton" aria-busy="true" />;
  if (state.kind === "error") return <p className="k-alert">{state.message}</p>;
  return null;
}

function DriverCard(props: {
  readonly state: Load<DriverActivity>;
  readonly tz: string;
  readonly onOpen: (orderId: number) => void;
}) {
  const { state, tz } = props;
  if (state.kind !== "ready") return <Pending state={state} />;
  const { resumen, repartos, persona } = state.data;
  return (
    <section className="k-card" aria-labelledby="act-driver">
      <h2 id="act-driver" className="k-title">
        {persona.nombre ?? persona.email ?? "Repartidor"}
      </h2>
      <div className="k-stats">
        <Stat label="Repartos" value={String(resumen.repartos)} />
        <Stat label="Entregados" value={String(resumen.entregados)} />
        <Stat label="En curso" value={String(resumen.en_curso)} />
        <Stat label="Cancelados" value={String(resumen.cancelados)} />
        <Stat label="Importe entregado" value={euros(resumen.importe_entregado)} />
        <Stat label="Por cobrar" value={euros(resumen.por_cobrar)} />
        <Stat label="Asignación → salida" value={formatMinutes(resumen.min_hasta_salida)} />
        <Stat label="En ruta" value={formatMinutes(resumen.min_en_ruta)} />
      </div>
      {repartos.length === 0 ? (
        <p className="k-muted">Sin repartos en este periodo.</p>
      ) : (
        <div className="k-activity-table">
          <table className="k-table">
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Estado</th>
                <th scope="col">Asignado</th>
                <th scope="col">Salida</th>
                <th scope="col">Entrega</th>
                <th scope="col" className="k-num">
                  Total
                </th>
                <th scope="col">Cobro</th>
                <th scope="col">Fotos</th>
              </tr>
            </thead>
            <tbody>
              {repartos.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <button type="button" className="k-link" onClick={() => props.onOpen(row.id)}>
                      {row.pedido_codigo ?? `#${row.id}`}
                    </button>
                    <span className="k-small k-muted">
                      {row.local_nombre ? ` · ${row.local_nombre}` : ""}
                    </span>
                  </th>
                  <td>{statusOf(row.estado)}</td>
                  <td>{formatMoment(row.asignado_at, tz)}</td>
                  <td>{formatMoment(row.salida_at, tz)}</td>
                  <td>{formatMoment(row.entregado_at, tz)}</td>
                  <td className="k-num">{euros(row.total)}</td>
                  <td>
                    {paymentLabel(row.metodo_pago)}
                    {row.estado_pago === "pendiente" ? " · pendiente" : ""}
                  </td>
                  <td>{row.fotos_entrega}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.data.truncado ? (
        <p className="k-small k-muted">Se muestran los 200 más recientes: acota las fechas.</p>
      ) : null}
    </section>
  );
}

function WaiterCard(props: {
  readonly state: Load<WaiterActivity>;
  readonly tz: string;
  readonly onOpen: (orderId: number) => void;
}) {
  const { state, tz } = props;
  if (state.kind !== "ready") return <Pending state={state} />;
  const { resumen, pedidos, persona } = state.data;
  return (
    <section className="k-card" aria-labelledby="act-waiter">
      <h2 id="act-waiter" className="k-title">
        {persona.nombre}
        {persona.activo ? "" : " (baja)"}
      </h2>
      <div className="k-stats">
        <Stat label="Pedidos atendidos" value={String(resumen.pedidos)} />
        <Stat label="Mesas" value={String(resumen.mesas)} />
        <Stat label="Importe" value={euros(resumen.importe)} />
        <Stat label="Cancelados" value={String(resumen.cancelados)} />
      </div>
      {pedidos.length === 0 ? (
        <p className="k-muted">Sin pedidos en este periodo.</p>
      ) : (
        <div className="k-activity-table">
          <table className="k-table">
            <thead>
              <tr>
                <th scope="col">Pedido</th>
                <th scope="col">Mesa</th>
                <th scope="col">Estado</th>
                <th scope="col">Hora</th>
                <th scope="col" className="k-num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <button type="button" className="k-link" onClick={() => props.onOpen(row.id)}>
                      {row.pedido_codigo ?? `#${row.id}`}
                    </button>
                    <span className="k-small k-muted">
                      {row.local_nombre ? ` · ${row.local_nombre}` : ""}
                    </span>
                  </th>
                  <td>{row.mesa_numero ?? "—"}</td>
                  <td>{statusOf(row.estado)}</td>
                  <td>{formatMoment(row.created_at, tz)}</td>
                  <td className="k-num">{euros(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.data.truncado ? (
        <p className="k-small k-muted">Se muestran los 200 más recientes: acota las fechas.</p>
      ) : null}
    </section>
  );
}

function TraceBody({ state, tz }: { readonly state: Load<OrderTrace>; readonly tz: string }) {
  if (state.kind !== "ready") return <Pending state={state} />;
  const { pedido, repartidor, mesero, historial } = state.data;
  return (
    <div className="k-trace">
      <p>
        <strong>{pedido.codigo ?? `#${pedido.id}`}</strong> · {statusOf(pedido.estado)}
      </p>
      {repartidor ? (
        <p className="k-small">
          Lo llevó <strong>{repartidor.nombre ?? "un repartidor"}</strong>. Asignado por{" "}
          {repartidor.asignado_por} ({formatMoment(repartidor.asignado_at, tz)}); salió{" "}
          {formatMoment(repartidor.salida_at, tz)}; entregado{" "}
          {formatMoment(repartidor.entregado_at, tz)}. Fotos de entrega: {repartidor.fotos_entrega}.
        </p>
      ) : null}
      {mesero ? (
        <p className="k-small">
          Lo atendió <strong>{mesero.nombre ?? "un mesero"}</strong>
          {mesero.mesa ? ` en la mesa ${mesero.mesa}` : ""}.
        </p>
      ) : null}
      {!repartidor && !mesero ? (
        <p className="k-muted k-small">Este pedido no tiene repartidor ni mesero asignado.</p>
      ) : null}
      <h3 className="k-subtitle">Historial de estados</h3>
      {historial.length === 0 ? (
        <p className="k-muted k-small">Sin cambios registrados.</p>
      ) : (
        <ol className="k-trace-log">
          {historial.map((entry) => (
            <li key={`${entry.created_at}-${entry.estado_nuevo}`}>
              <span className="k-small k-muted">{formatMoment(entry.created_at, tz)}</span>{" "}
              {entry.estado_anterior ? `${statusOf(entry.estado_anterior)} → ` : ""}
              <strong>{statusOf(entry.estado_nuevo)}</strong>
              <span className="k-small k-muted"> · {actorLabel(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
