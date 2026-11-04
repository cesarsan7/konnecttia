"use client";

import { useEffect, useMemo, useState } from "react";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import {
  activeFilterCount,
  CHANNEL_OPTIONS,
  DAY_PRESETS,
  DEFAULT_FILTERS,
  type HistoryFilters,
  type HistorySort,
  historyQuery,
  type OrderHistory,
  PAYMENT_STATUS_OPTIONS,
  toggleSort,
} from "@/lib/panel/history";
import {
  formatElapsed,
  laneOf,
  minutesSince,
  type OrderAction,
  PAYMENT_METHOD_LABEL,
  paymentLabel,
  primaryAction,
  STATUS_LABEL,
} from "@/lib/panel/orders";
import { todayIn } from "@/lib/panel/stats";
import type { PanelBranch, PanelOrder } from "@/lib/panel/types";
import { Icon } from "../Icon";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import { OrderCard } from "./OrderCard";

type Permissions = {
  readonly changeStatus: boolean;
  readonly confirmPayment: boolean;
};

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: OrderHistory }
  | { readonly kind: "error"; readonly message: string };

const TYPE_LABEL: Readonly<Record<string, string>> = {
  retiro: "Recogida",
  delivery: "Reparto",
  mesa: "Mesa",
};

const MOBILE_SORT = [
  { value: "fecha:desc", label: "Más recientes primero" },
  { value: "fecha:asc", label: "Más antiguos primero" },
  { value: "total:desc", label: "Mayor importe" },
  { value: "total:asc", label: "Menor importe" },
  { value: "cliente:asc", label: "Cliente (A-Z)" },
  { value: "estado:asc", label: "Estado" },
  { value: "tipo:asc", label: "Tipo" },
] as const;

const CHANNEL_LABEL: Readonly<Record<string, string>> = Object.fromEntries(
  CHANNEL_OPTIONS.map((option) => [option.id, option.label]),
);

/**
 * Vista «Tabla» de Pedidos: historial con filtros, orden por columnas y páginas (en el servidor).
 * Las acciones (avanzar, cobrar, cancelar) son las mismas que en el tablero.
 */
export function OrdersTable({
  branches,
  version,
  busyIds,
  permissions,
  onAction,
  onCancel,
  onPrint,
}: {
  readonly branches: readonly PanelBranch[];
  /** Cambia cuando el tablero detecta cambios (tiempo real): la tabla se recarga. */
  readonly version: number;
  readonly busyIds: ReadonlySet<number>;
  readonly permissions: Permissions;
  readonly onAction: (order: PanelOrder, action: OrderAction) => void;
  readonly onCancel: (order: PanelOrder) => void;
  readonly onPrint?: (order: PanelOrder) => void;
}) {
  const { api } = usePanel();
  const { slug, access } = useAccess();
  const tz = access.restaurante.zona_horaria;
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [openId, setOpenId] = useState<number | null>(null);
  // En el móvil los filtros se pliegan para que la lista quede a la vista.
  const [showFilters, setShowFilters] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const showBranch = branches.length > 1;

  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilters((current) =>
          current.q === search ? current : { ...current, q: search, pagina: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => historyQuery(filters, todayIn(tz)).toString(), [filters, tz]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: «version» fuerza la recarga en tiempo real.
  useEffect(() => {
    let active = true;
    void api.history(slug, query).then((result) => {
      if (!active) return;
      setNow(new Date());
      setState(
        result.ok
          ? { kind: "ready", data: result.data }
          : { kind: "error", message: describePanelError(result.status, result.body) },
      );
    });
    return () => {
      active = false;
    };
  }, [api, slug, query, version]);

  const set = (patch: Partial<HistoryFilters>) =>
    setFilters((current) => ({ ...current, ...patch, pagina: patch.pagina ?? 1 }));

  const data = state.kind === "ready" ? state.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.por_pagina)) : 1;
  const open = data?.pedidos.find((order) => order.id === openId) ?? null;
  const today = todayIn(tz, now);
  const dateFormat = new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  const timeFormat = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  const filtersOn = activeFilterCount(filters);

  const header = (column: HistorySort, label: string, className = "") => {
    const current = filters.orden === column;
    return (
      <th
        scope="col"
        className={className}
        aria-sort={current ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className="k-th-sort"
          onClick={() => setFilters(toggleSort(filters, column))}
        >
          {label}
          <span aria-hidden="true" className={current ? "is-on" : ""}>
            {current ? (filters.dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <section className="k-history" aria-label="Pedidos en tabla">
      <div className="k-history-filters">
        <fieldset className="k-segment k-segment-sm">
          <legend className="k-sr-only">Fechas</legend>
          {DAY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={filters.dias === preset.id ? "is-on" : ""}
              aria-pressed={filters.dias === preset.id}
              onClick={() =>
                set({
                  dias: preset.id,
                  ...(preset.id === "rango" && !filters.desde
                    ? { desde: today, hasta: today }
                    : {}),
                })
              }
            >
              {preset.label}
            </button>
          ))}
        </fieldset>
        {filters.dias === "rango" ? (
          <span className="k-history-range">
            <label className="k-field k-field-inline">
              <span className="k-sr-only">Desde</span>
              <input
                type="date"
                value={filters.desde}
                max={today}
                onChange={(e) => set({ desde: e.target.value })}
              />
            </label>
            <span className="k-muted">a</span>
            <label className="k-field k-field-inline">
              <span className="k-sr-only">Hasta</span>
              <input
                type="date"
                value={filters.hasta}
                max={today}
                onChange={(e) => set({ hasta: e.target.value })}
              />
            </label>
          </span>
        ) : null}
      </div>

      <div className={`k-history-filters${showFilters ? " is-open" : ""}`}>
        <label className="k-search">
          <span className="k-sr-only">Buscar pedido</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Código, nombre o teléfono"
          />
        </label>
        <button
          type="button"
          className="k-btn k-btn-secondary k-btn-sm k-mobile-only"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((open) => !open)}
        >
          Filtros{filtersOn > 0 ? ` (${filtersOn})` : ""}
        </button>
        <FilterSelect label="Estado" value={filters.estado} onChange={(estado) => set({ estado })}>
          <option value="">Todos los estados</option>
          <option value="activos">En marcha</option>
          {Object.entries(STATUS_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Tipo" value={filters.tipo} onChange={(tipo) => set({ tipo })}>
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Canal" value={filters.canal} onChange={(canal) => set({ canal })}>
          <option value="">Todos los canales</option>
          {CHANNEL_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Cobro" value={filters.pago} onChange={(pago) => set({ pago })}>
          <option value="">Cualquier cobro</option>
          {PAYMENT_STATUS_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Método de pago"
          value={filters.metodo}
          onChange={(metodo) => set({ metodo })}
        >
          <option value="">Cualquier método</option>
          {Object.entries(PAYMENT_METHOD_LABEL)
            .filter(([id]) => id !== "sin_indicar")
            .map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
        </FilterSelect>
        {showBranch ? (
          <FilterSelect
            label="Local"
            value={filters.local === null ? "" : String(filters.local)}
            onChange={(value) => set({ local: value ? Number(value) : null })}
          >
            <option value="">Todos los locales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre}
              </option>
            ))}
          </FilterSelect>
        ) : null}
        {filtersOn > 0 ? (
          <button
            type="button"
            className="k-link k-small"
            onClick={() => {
              setSearch("");
              setFilters({
                ...DEFAULT_FILTERS,
                dias: filters.dias,
                desde: filters.desde,
                hasta: filters.hasta,
              });
            }}
          >
            Quitar filtros ({filtersOn})
          </button>
        ) : null}
      </div>

      {data ? (
        <p className="k-small k-muted" role="status">
          <strong>{data.total}</strong> {data.total === 1 ? "pedido" : "pedidos"} ·{" "}
          {euros(data.importe)} en ventas (sin cancelados)
        </p>
      ) : null}

      {state.kind === "loading" ? (
        <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
      ) : null}
      {state.kind === "error" ? (
        <p className="k-card k-alert" role="alert">
          {state.message}
        </p>
      ) : null}

      {data && data.pedidos.length === 0 ? (
        <div className="k-card k-empty-state">
          <h2 className="k-title">Ningún pedido con estos filtros</h2>
          <p className="k-muted">Prueba con otras fechas o quita algún filtro.</p>
        </div>
      ) : null}

      {data && data.pedidos.length > 0 ? (
        <label className="k-select k-select-sm k-mobile-only">
          <span className="k-sr-only">Ordenar por</span>
          <select
            value={`${filters.orden}:${filters.dir}`}
            onChange={(event) => {
              const [orden, dir] = event.target.value.split(":") as [HistorySort, "asc" | "desc"];
              set({ orden, dir });
            }}
          >
            {MOBILE_SORT.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {data && data.pedidos.length > 0 ? (
        <div className="k-table-wrap">
          <table className="k-otable">
            <thead>
              <tr>
                {header("codigo", "Pedido")}
                {header("fecha", "Hora")}
                {header("cliente", "Cliente")}
                {header("tipo", "Tipo")}
                {showBranch ? (
                  <th scope="col" className="k-col-opt">
                    Local
                  </th>
                ) : null}
                <th scope="col" className="k-col-opt">
                  Canal
                </th>
                {header("estado", "Estado")}
                <th scope="col" className="k-col-opt">
                  Cobro
                </th>
                {header("total", "Total", "k-num")}
                <th scope="col">
                  <span className="k-sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.pedidos.map((order) => {
                const created = new Date(order.created_at);
                const day = todayIn(tz, created);
                const running = laneOf(order) !== "cerrados";
                const action = running ? primaryAction(order, permissions) : null;
                const pending = order.estado_pago === "pendiente";
                return (
                  <tr key={order.id} className={running ? "" : "is-closed"}>
                    <td className="k-c-code">
                      <button
                        type="button"
                        className="k-item-link k-order-code"
                        onClick={() => setOpenId(order.id)}
                      >
                        {order.pedido_codigo ?? `#${order.id}`}
                      </button>
                    </td>
                    <td className="k-c-time">
                      <span className="k-nowrap">
                        {day === today ? "" : `${dateFormat.format(created)} · `}
                        {timeFormat.format(created)}
                      </span>
                      {running ? (
                        <span className="k-small k-muted k-block">
                          {formatElapsed(minutesSince(order.created_at, now))}
                        </span>
                      ) : null}
                    </td>
                    <td className="k-c-who">
                      <span className="k-block">{order.nombre_pedido ?? "Cliente"}</span>
                      {order.telefono ? (
                        <span className="k-small k-muted k-nowrap">{order.telefono}</span>
                      ) : null}
                    </td>
                    <td className="k-c-type">
                      <span className="k-nowrap">
                        <Icon
                          name={
                            order.tipo_despacho === "delivery"
                              ? "bike"
                              : order.tipo_despacho === "mesa"
                                ? "table"
                                : "bag"
                          }
                          size={16}
                        />{" "}
                        {order.tipo_despacho === "mesa"
                          ? (order.mesa_nombre ?? "Mesa")
                          : (TYPE_LABEL[order.tipo_despacho ?? "retiro"] ?? order.tipo_despacho)}
                      </span>
                    </td>
                    {showBranch ? <td className="k-col-opt">{order.local_nombre ?? "—"}</td> : null}
                    <td className="k-col-opt">{CHANNEL_LABEL[order.canal] ?? order.canal}</td>
                    <td className="k-c-state">
                      <span className={`k-chip k-chip-${order.estado}`}>
                        {STATUS_LABEL[order.estado] ?? order.estado}
                      </span>
                    </td>
                    <td className="k-col-opt">
                      <span className={`k-pay${pending ? " is-pending" : ""}`}>
                        {paymentLabel(order.metodo_pago)}
                        {pending ? " · pendiente" : ""}
                      </span>
                    </td>
                    <td className="k-num k-c-total">
                      <strong>{euros(Number(order.total))}</strong>
                    </td>
                    <td className="k-c-act">
                      {action ? (
                        <button
                          type="button"
                          className="k-btn k-btn-secondary k-btn-sm k-nowrap"
                          disabled={busyIds.has(order.id)}
                          onClick={() => onAction(order, action)}
                        >
                          {busyIds.has(order.id) ? "…" : action.label}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && pages > 1 ? (
        <nav className="k-pager" aria-label="Páginas">
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={filters.pagina <= 1}
            onClick={() => set({ pagina: filters.pagina - 1 })}
          >
            Anterior
          </button>
          <span className="k-small k-muted">
            Página {filters.pagina} de {pages}
          </span>
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={filters.pagina >= pages}
            onClick={() => set({ pagina: filters.pagina + 1 })}
          >
            Siguiente
          </button>
        </nav>
      ) : null}

      {open ? (
        <Modal
          title={`Pedido ${open.pedido_codigo ?? `#${open.id}`}`}
          onClose={() => setOpenId(null)}
        >
          <OrderCard
            order={open}
            now={now}
            fresh={false}
            busy={busyIds.has(open.id)}
            showBranch={showBranch}
            timeZone={tz}
            permissions={permissions}
            onAction={(action) => onAction(open, action)}
            onCancel={() => onCancel(open)}
            onPrint={onPrint ? () => onPrint(open) : undefined}
            expanded
            onToggle={() => undefined}
          />
        </Modal>
      ) : null}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: React.ReactNode;
}) {
  return (
    <label className={`k-select k-select-sm${value ? " is-on" : ""}`}>
      <span className="k-sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}
