"use client";

import "./stats-team.css";
import { useEffect, useState } from "react";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import { paymentLabel } from "@/lib/panel/orders";
import {
  change,
  compactEuros,
  formatChange,
  formatLongDate,
  formatMinutes,
  formatShortDate,
  peakHour,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/panel/stats";
import { personLabel } from "@/lib/panel/team";
import type { PanelBranch, SalesOverview } from "@/lib/panel/types";
import { BarList, ColumnChart, SegmentedBar } from "./charts";
import { usePanel } from "./PanelProvider";
import { PERMISSION, useAccess } from "./PanelShell";

type Range = { readonly desde: string; readonly hasta: string };

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: SalesOverview }
  | { readonly kind: "error"; readonly message: string };

export function StatsView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [preset, setPreset] = useState<RangePreset | "custom">("7d");
  const [range, setRange] = useState<Range>(() => presetRange("7d", tz));
  const [branches, setBranches] = useState<PanelBranch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [state, setState] = useState<Load>({ kind: "loading" });
  const allowed = can(PERMISSION.AnalyticsView);

  useEffect(() => {
    api.branches(slug).then((result) => {
      if (result.ok) setBranches(result.data.locales);
    });
  }, [api, slug]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setState({ kind: "loading" });
    api.overview(slug, range.desde, range.hasta, branchId).then((result) => {
      if (!active) return;
      setState(
        result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", message: describePanelError(result.status, result.body) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, slug, range, branchId, allowed]);

  if (!allowed) {
    return (
      <div className="k-page">
        <header className="k-page-head">
          <div>
            <p className="k-eyebrow">{access.restaurante.nombre}</p>
            <h1 className="k-heading">Estadísticas</h1>
          </div>
        </header>
        <div className="k-card k-upsell">
          <span className="k-soon">Premium</span>
          <h2 className="k-title">Las estadísticas están en el plan Premium</h2>
          <p className="k-muted">
            Ventas por día y por hora, productos más pedidos y comparación entre locales. Escríbenos
            a <a href="mailto:hola@konnecttia.com">hola@konnecttia.com</a> para activarlo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="k-page">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">{access.restaurante.nombre}</p>
          <h1 className="k-heading">Estadísticas</h1>
        </div>
      </header>

      <div className="k-filters">
        <fieldset className="k-segment">
          <legend className="k-sr-only">Periodo</legend>
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
      </div>

      {state.kind === "error" ? (
        <p className="k-alert" role="alert">
          {state.message}
        </p>
      ) : state.kind === "loading" ? (
        <div className="k-stats" aria-busy="true">
          <div className="k-skeleton k-skeleton-tall" />
          <div className="k-skeleton k-skeleton-tall" />
        </div>
      ) : (
        <StatsBody data={state.data} showBranches={branches.length > 1 && branchId === null} />
      )}
    </div>
  );
}

function Delta({
  current,
  previous,
  goodWhenUp = true,
}: {
  readonly current: number;
  readonly previous: number;
  readonly goodWhenUp?: boolean;
}) {
  const value = change(current, previous);
  const tone = value === null || value === 0 ? "flat" : value > 0 === goodWhenUp ? "good" : "bad";
  return (
    <span className={`k-delta is-${tone}`}>
      {value !== null && value !== 0 ? (
        <span aria-hidden="true">{value > 0 ? "▲" : "▼"}</span>
      ) : null}
      {formatChange(value)}
    </span>
  );
}

function StatsBody({
  data,
  showBranches,
}: {
  readonly data: SalesOverview;
  readonly showBranches: boolean;
}) {
  const now = data.resumen;
  const before = data.resumen_anterior;
  const singleDay = data.desde === data.hasta;
  const peak = peakHour(data.por_hora);
  const previousLabel = `${formatShortDate(data.anterior.desde)}${
    data.anterior.desde === data.anterior.hasta ? "" : ` – ${formatShortDate(data.anterior.hasta)}`
  }`;
  const branchTotal = data.locales.reduce((sum, row) => sum + row.ventas, 0);

  if (now.pedidos === 0 && before.pedidos === 0) {
    return (
      <div className="k-card k-empty-state">
        <h2 className="k-title">Todavía no hay ventas en este periodo</h2>
        <p className="k-muted">
          Cuando entren pedidos de la web o de WhatsApp, aquí verás las ventas, las horas punta y
          los productos que más se piden.
        </p>
      </div>
    );
  }

  return (
    <div className="k-stats">
      <section className="k-kpis" aria-label="Resumen">
        <article className="k-card k-kpi k-kpi-hero">
          <h2 className="k-kpi-label">Ventas</h2>
          <p className="k-hero-number">{euros(now.ventas)}</p>
          <Delta current={now.ventas} previous={before.ventas} />
          <p className="k-small k-muted">frente a {previousLabel}</p>
        </article>
        <article className="k-card k-kpi">
          <h2 className="k-kpi-label">Pedidos</h2>
          <p className="k-kpi-value">{now.pedidos.toLocaleString("es-ES")}</p>
          <Delta current={now.pedidos} previous={before.pedidos} />
          {now.pendientes_pago > 0 ? (
            <p className="k-small k-warn">{now.pendientes_pago} con cobro pendiente</p>
          ) : null}
        </article>
        <article className="k-card k-kpi">
          <h2 className="k-kpi-label">Ticket medio</h2>
          <p className="k-kpi-value">{euros(now.ticket_medio)}</p>
          <Delta current={now.ticket_medio} previous={before.ticket_medio} />
        </article>
        <article className="k-card k-kpi">
          <h2 className="k-kpi-label">Clientes distintos</h2>
          <p className="k-kpi-value">{now.clientes.toLocaleString("es-ES")}</p>
          <Delta current={now.clientes} previous={before.clientes} />
        </article>
        <article className="k-card k-kpi">
          <h2 className="k-kpi-label">Cancelados</h2>
          <p className="k-kpi-value">{now.cancelados.toLocaleString("es-ES")}</p>
          <Delta current={now.cancelados} previous={before.cancelados} goodWhenUp={false} />
        </article>
      </section>

      {singleDay ? null : (
        <section className="k-card k-chart-card">
          <header className="k-chart-head">
            <h2 className="k-title">Ventas por día</h2>
            <p className="k-small k-muted">Toca una barra para ver el detalle.</p>
          </header>
          <ColumnChart
            label={`Ventas por día del ${formatShortDate(data.desde)} al ${formatShortDate(data.hasta)}`}
            data={data.por_dia.map((row) => ({
              key: row.fecha,
              label: formatShortDate(row.fecha),
              value: row.ventas,
              tooltip: (
                <>
                  <strong className="k-capitalize">{formatLongDate(row.fecha)}</strong>
                  <span>{euros(row.ventas)}</span>
                  <span className="k-muted">
                    {row.pedidos} {row.pedidos === 1 ? "pedido" : "pedidos"}
                  </span>
                </>
              ),
            }))}
            formatTick={compactEuros}
          />
          <details className="k-table-toggle">
            <summary>Ver los datos en tabla</summary>
            <table className="k-table">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col">Pedidos</th>
                  <th scope="col">Ventas</th>
                </tr>
              </thead>
              <tbody>
                {data.por_dia.map((row) => (
                  <tr key={row.fecha}>
                    <td className="k-capitalize">{formatLongDate(row.fecha)}</td>
                    <td>{row.pedidos}</td>
                    <td>{euros(row.ventas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      <section className="k-card k-chart-card">
        <header className="k-chart-head">
          <h2 className="k-title">Pedidos por hora</h2>
          <p className="k-small k-muted">
            {peak === null
              ? "Sin pedidos en el periodo."
              : `Hora punta: de ${String(peak).padStart(2, "0")}:00 a ${String((peak + 1) % 24).padStart(2, "0")}:00. Úsala para planificar el personal y el modo ocupado.`}
          </p>
        </header>
        <ColumnChart
          label="Pedidos por hora del día"
          highlightKey={peak === null ? null : String(peak)}
          formatHighlight={(value) => `${value}`}
          data={trimHours(data.por_hora).map((row) => ({
            key: String(row.hora),
            label: `${row.hora}h`,
            value: row.pedidos,
            tooltip: (
              <>
                <strong>
                  {String(row.hora).padStart(2, "0")}:00 –{" "}
                  {String((row.hora + 1) % 24).padStart(2, "0")}:00
                </strong>
                <span>
                  {row.pedidos} {row.pedidos === 1 ? "pedido" : "pedidos"}
                </span>
                <span className="k-muted">{euros(row.ventas)}</span>
              </>
            ),
          }))}
          formatTick={(value) => (Number.isInteger(value) ? String(value) : "")}
        />
      </section>

      <div className="k-stats-grid">
        <section className="k-card">
          <h2 className="k-title">Lo más pedido</h2>
          {data.productos.length === 0 ? (
            <p className="k-muted">Sin productos en el periodo.</p>
          ) : (
            <BarList
              rows={data.productos.map((row) => ({
                label: row.nombre,
                value: row.cantidad,
                detail: euros(row.ventas),
              }))}
              formatValue={(value) => `${value} uds`}
            />
          )}
        </section>

        <section className="k-card k-mix">
          <h2 className="k-title">Cómo piden tus clientes</h2>
          <SegmentedBar
            label="Recogida o reparto"
            parts={[
              { name: "Recogida", value: data.despacho.recogida, slot: 1 },
              { name: "Reparto", value: data.despacho.reparto, slot: 2 },
            ]}
          />
          <SegmentedBar
            label="Canal"
            parts={[
              { name: "Web", value: data.canal.web, slot: 1 },
              { name: "WhatsApp", value: data.canal.whatsapp, slot: 2 },
              ...(data.canal.otros > 0
                ? [{ name: "Otros", value: data.canal.otros, slot: 3 as const }]
                : []),
            ]}
          />
          <h3 className="k-subtitle">Métodos de pago</h3>
          <table className="k-table">
            <tbody>
              {data.metodos_pago.map((row) => (
                <tr key={row.metodo}>
                  <th scope="row">{paymentLabel(row.metodo)}</th>
                  <td>
                    {row.pedidos} {row.pedidos === 1 ? "pedido" : "pedidos"}
                  </td>
                  <td>{euros(row.ventas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {data.meseros.length > 0 ? (
        <section className="k-card k-team-stats">
          <h2 className="k-title">Por mesero</h2>
          <table className="k-table">
            <thead>
              <tr>
                <th scope="col">Mesero</th>
                <th scope="col" className="k-num">
                  Pedidos
                </th>
                <th scope="col" className="k-num">
                  Importe
                </th>
                <th scope="col" className="k-num">
                  Ticket medio
                </th>
              </tr>
            </thead>
            <tbody>
              {data.meseros.map((row) => (
                <tr key={row.mesero_id}>
                  <th scope="row">{row.mesero}</th>
                  <td className="k-num">{row.pedidos}</td>
                  <td className="k-num">{euros(row.ventas)}</td>
                  <td className="k-num">{euros(row.ticket_medio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="k-small k-muted">Solo pedidos con mesero asignado.</p>
        </section>
      ) : null}

      {data.repartidores.length > 0 ? (
        <section className="k-card k-team-stats">
          <h2 className="k-title">Por repartidor</h2>
          <table className="k-table">
            <thead>
              <tr>
                <th scope="col">Repartidor</th>
                <th scope="col" className="k-num">
                  Repartos entregados
                </th>
                <th scope="col" className="k-num">
                  Importe
                </th>
                <th scope="col" className="k-num">
                  Tiempo medio
                </th>
              </tr>
            </thead>
            <tbody>
              {data.repartidores.map((row) => (
                <tr key={row.membership_id ?? `sin-${row.email ?? row.nombre ?? "repartidor"}`}>
                  <th scope="row">
                    {personLabel({ name: row.nombre, email: row.email }, "Repartidor")}
                  </th>
                  <td className="k-num">{row.repartos}</td>
                  <td className="k-num">{euros(row.ventas)}</td>
                  <td className="k-num">{formatMinutes(row.minutos_medios)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="k-small k-muted">
            El tiempo medio va desde que sale el repartidor hasta que entrega el pedido.
          </p>
        </section>
      ) : null}

      {showBranches ? (
        <section className="k-card">
          <h2 className="k-title">Por local</h2>
          <table className="k-table k-table-branches">
            <thead>
              <tr>
                <th scope="col">Local</th>
                <th scope="col">Pedidos</th>
                <th scope="col">Ventas</th>
                <th scope="col">Peso</th>
              </tr>
            </thead>
            <tbody>
              {data.locales.map((row) => {
                const share = branchTotal > 0 ? Math.round((row.ventas / branchTotal) * 100) : 0;
                return (
                  <tr key={row.sucursal_id}>
                    <th scope="row">{row.local}</th>
                    <td>{row.pedidos}</td>
                    <td>{euros(row.ventas)}</td>
                    <td>
                      <span className="k-share">
                        <span className="k-share-track" aria-hidden="true">
                          <span className="k-share-fill" style={{ width: `${share}%` }} />
                        </span>
                        {share} %
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

/** Quita las horas vacías del principio y del final (el local no abre de madrugada). */
function trimHours(rows: SalesOverview["por_hora"]) {
  const first = rows.findIndex((row) => row.pedidos > 0);
  if (first === -1) return rows.filter((row) => row.hora >= 8);
  let last = rows.length - 1;
  while (last > first && (rows[last]?.pedidos ?? 0) === 0) last--;
  return rows.slice(Math.max(0, first - 1), Math.min(rows.length, last + 2));
}
