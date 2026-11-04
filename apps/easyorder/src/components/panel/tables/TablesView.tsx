"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import {
  orderLines,
  paymentLabel,
  primaryAction,
  STATUS_LABEL,
  summarizeLines,
} from "@/lib/panel/orders";
import {
  type DiningTable,
  groupByZone,
  matchesFilter,
  nextTableNumber,
  occupiedFor,
  shortDuration,
  TABLE_FILTER,
  type TableAlertsConfig,
  type TableFilter,
  type TableOrder,
  type TablePlan,
  type TableZone,
  tableTimes,
} from "@/lib/panel/tables";
import { Toggle } from "../menu/Editors";
import { Modal } from "../menu/Modal";
import { ManualOrder } from "../orders/ManualOrder";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly plan: TablePlan }
  | { readonly kind: "error"; readonly message: string };

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

const REFRESH_MS = 15_000;

const CONFLICT: Readonly<Record<string, string>> = {
  duplicate_number: "Ya hay una mesa con ese número.",
  duplicate_name: "Ya hay una zona con ese nombre.",
  zone_other_branch: "Esa zona es de otro local.",
};

export function TablesView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [branchId, setBranchId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingAlerts, setEditingAlerts] = useState(false);
  const [filter, setFilter] = useState<TableFilter>("todas");
  const [ordering, setOrdering] = useState<DiningTable | null>(null);
  const [editingTable, setEditingTable] = useState<DiningTable | "new" | null>(null);
  const [editingZone, setEditingZone] = useState<TableZone | "new" | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(() => new Date());
  const allowed = can(PERMISSION.TablesView);
  const canManage = can(PERMISSION.TablesManage);
  const canOrder = can(PERMISSION.OrdersCreate);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const result = await api.tables(slug);
    if (result.ok) {
      setState({ kind: "ready", plan: result.data });
      setBranchId((current) => current ?? result.data.locales[0]?.id ?? null);
      setNow(new Date());
    } else {
      setState({ kind: "error", message: describePanelError(result.status, result.body) });
    }
  }, [api, slug]);

  useEffect(() => {
    if (!allowed) return;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [allowed, load]);

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Mesas</h1>
      </div>
      {canManage && state.kind === "ready" && state.plan.locales.length > 0 ? (
        <div className="k-head-tools">
          <Toggle checked={editMode} onChange={setEditMode} label="Editar mesas" />
        </div>
      ) : null}
    </header>
  );

  if (!allowed) {
    return (
      <div className="k-page">
        {header}
        <div className="k-card k-upsell">
          <span className="k-soon">Premium</span>
          <h2 className="k-title">Mesas y comanda están en el plan Premium</h2>
          <p className="k-muted">
            Plano de mesas por zona, pedidos en mesa desde el panel y estado de cada mesa.
            Escríbenos a <a href="mailto:hola@konnecttia.com">hola@konnecttia.com</a> para
            activarlo.
          </p>
        </div>
      </div>
    );
  }
  if (state.kind !== "ready") {
    return (
      <div className="k-page">
        {header}
        {state.kind === "loading" ? (
          <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
        ) : (
          <p className="k-card k-alert">{state.message}</p>
        )}
      </div>
    );
  }

  const plan = state.plan;
  const branch = branchId ?? plan.locales[0]?.id ?? null;
  const groups = branch === null ? [] : groupByZone(plan, branch);
  const tablesHere = plan.mesas.filter((table) => table.sucursal_id === branch);
  const busy = tablesHere.filter((table) => table.ocupada).length;

  const selected = plan.mesas.find((table) => table.id === selectedId) ?? null;

  return (
    <div className="k-page">
      {header}
      {plan.locales.length > 1 ? (
        <fieldset className="k-segment">
          <legend className="k-sr-only">Local</legend>
          {plan.locales.map((local) => (
            <button
              key={local.id}
              type="button"
              className={branch === local.id ? "is-on" : ""}
              aria-pressed={branch === local.id}
              onClick={() => setBranchId(local.id)}
            >
              {local.nombre}
            </button>
          ))}
        </fieldset>
      ) : null}

      {tablesHere.length > 0 && !editMode ? (
        <div className="k-carta-bar">
          <fieldset className="k-segment k-segment-sm">
            <legend className="k-sr-only">Mostrar</legend>
            {TABLE_FILTER.map((option) => (
              <button
                key={option.id}
                type="button"
                className={filter === option.id ? "is-on" : ""}
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
                {option.id === "libres" ? ` · ${tablesHere.length - busy}` : ""}
                {option.id === "ocupadas" ? ` · ${busy}` : ""}
              </button>
            ))}
          </fieldset>
        </div>
      ) : null}

      {tablesHere.length === 0 && !editMode ? (
        <div className="k-card k-empty-state">
          <h2 className="k-title">Aún no hay mesas</h2>
          <p className="k-muted">
            Crea las zonas (sala, terraza…) y las mesas de este local para tomar pedidos en mesa.
          </p>
          {canManage ? (
            <button type="button" className="k-btn k-btn-primary" onClick={() => setEditMode(true)}>
              Configurar mesas
            </button>
          ) : null}
        </div>
      ) : null}

      {editMode ? (
        <div className="k-head-tools">
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() => setEditingZone("new")}
          >
            Nueva zona
          </button>
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() => setEditingAlerts(true)}
          >
            Avisos de tiempo
          </button>
          <button
            type="button"
            className="k-btn k-btn-primary k-btn-sm"
            onClick={() => setEditingTable("new")}
          >
            Nueva mesa
          </button>
        </div>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.zone?.id ?? "sin-zona"}
          className="k-card k-settings"
          aria-label={group.zone?.nombre ?? "Sin zona"}
        >
          <header className="k-settings-head k-settings-head-row">
            <h2 className="k-title">
              {group.zone?.nombre ?? (groups.length > 1 ? "Sin zona" : "Mesas")}
            </h2>
            {editMode && group.zone ? (
              <button
                type="button"
                className="k-btn k-btn-secondary k-btn-sm"
                onClick={() => setEditingZone(group.zone)}
              >
                Editar zona
              </button>
            ) : null}
          </header>
          {group.tables.length === 0 ? (
            <p className="k-muted k-small">Sin mesas en esta zona.</p>
          ) : (
            <ul className="k-tables">
              {group.tables
                .filter((table) => editMode || matchesFilter(table, filter))
                .map((table) => (
                  <li key={table.id}>
                    <TableTile
                      table={table}
                      alerts={plan.avisos}
                      now={now}
                      editMode={editMode}
                      onClick={() => (editMode ? setEditingTable(table) : setSelectedId(table.id))}
                    />
                  </li>
                ))}
            </ul>
          )}
        </section>
      ))}

      {selected ? (
        <TableDetail
          table={selected}
          now={now}
          canManage={canManage}
          canOrder={canOrder}
          onClose={() => setSelectedId(null)}
          onOrder={() => {
            setOrdering(selected);
            setSelectedId(null);
          }}
          onChanged={(message, tone) => {
            if (message) toast(message, tone);
            void load();
          }}
        />
      ) : null}

      {ordering ? (
        <ManualOrder
          defaultBranchId={ordering.sucursal_id}
          table={{ id: ordering.id, nombre: ordering.nombre, sucursal_id: ordering.sucursal_id }}
          onClose={() => setOrdering(null)}
          onCreated={(message) => {
            setOrdering(null);
            toast(message);
            void load();
          }}
        />
      ) : null}

      {editingAlerts ? (
        <AlertsDialog
          alerts={plan.avisos}
          onClose={() => setEditingAlerts(false)}
          onSaved={() => {
            setEditingAlerts(false);
            toast("Avisos guardados");
            void load();
          }}
        />
      ) : null}
      {editingZone && branch !== null ? (
        <ZoneDialog
          zone={editingZone === "new" ? null : editingZone}
          branchId={branch}
          onClose={() => setEditingZone(null)}
          onSaved={(message) => {
            setEditingZone(null);
            toast(message);
            void load();
          }}
        />
      ) : null}
      {editingTable && branch !== null ? (
        <TableDialog
          table={editingTable === "new" ? null : editingTable}
          plan={plan}
          branchId={branch}
          onClose={() => setEditingTable(null)}
          onSaved={(message) => {
            setEditingTable(null);
            toast(message);
            void load();
          }}
        />
      ) : null}

      <div className="k-toasts" aria-live="polite">
        {toasts.map((item) => (
          <p key={item.id} className={`k-toast is-${item.tone}`}>
            {item.text}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Mesa en el plano: estado, tiempos y aviso si se pasa de los minutos configurados. */
function TableTile({
  table,
  alerts,
  now,
  editMode,
  onClick,
}: {
  readonly table: DiningTable;
  readonly alerts: TableAlertsConfig;
  readonly now: Date;
  readonly editMode: boolean;
  readonly onClick: () => void;
}) {
  const times = tableTimes(table, alerts, now);
  const alert = !editMode && (times.waitAlert || times.stayAlert);
  return (
    <button
      type="button"
      className={`k-table-tile${table.ocupada ? " is-busy" : ""}${table.activa ? "" : " is-off"}${alert ? " is-alert" : ""}`}
      onClick={onClick}
      aria-label={`${table.nombre}, ${table.ocupada ? "ocupada" : "libre"}${alert ? ", con aviso" : ""}`}
    >
      <span className="k-table-tile-head">
        <strong>{table.nombre}</strong>
        {times.waitAlert ? <span className="k-chip k-chip-alert">Espera larga</span> : null}
        {!times.waitAlert && times.stayAlert ? (
          <span className="k-chip k-chip-alert">Mucho rato</span>
        ) : null}
      </span>
      <span className="k-small">
        {table.capacidad ? `${table.capacidad} pers.` : ""}
        {!table.activa ? " · desactivada" : ""}
      </span>
      {times.oldest ? (
        <span className="k-table-status">
          {STATUS_LABEL[times.oldest.estado] ?? times.oldest.estado}
          {times.inState !== null ? ` · ${shortDuration(times.inState)}` : ""}
          {table.en_marcha > 1 ? ` · ${table.en_marcha} pedidos` : ""}
        </span>
      ) : null}
      {table.ocupada ? (
        <span className="k-table-order">
          {times.stay !== null ? `Sentados ${shortDuration(times.stay)}` : "Ocupada"}
          {table.cuenta > 0 ? ` · ${euros(table.cuenta)}` : ""}
        </span>
      ) : (
        <span className="k-table-order">Libre</span>
      )}
    </button>
  );
}

/** Horas de cada cambio de estado del pedido: «Nuevo 20:01 · Aceptado 20:03 · Preparando 20:05». */
function OrderTimeline({ order }: { readonly order: TableOrder }) {
  const { access } = useAccess();
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: access.restaurante.zona_horaria,
  });
  const steps = [
    { estado: "recibido", at: order.desde },
    ...order.historial.filter((step) => step.estado !== "recibido"),
  ];
  return (
    <span className="k-timeline k-small k-muted">
      {steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: el historial no cambia de orden.
        <span key={index}>
          {STATUS_LABEL[step.estado] ?? step.estado} {time.format(new Date(step.at))}
        </span>
      ))}
    </span>
  );
}

function AlertsDialog(props: {
  readonly alerts: TableAlertsConfig;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [wait, setWait] = useState(props.alerts.espera_minutos?.toString() ?? "");
  const [stay, setStay] = useState(props.alerts.estancia_minutos?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const parse = (value: string) => (value.trim() ? Number(value) : null);
    const body = { espera_minutos: parse(wait), estancia_minutos: parse(stay) };
    const valid = (value: number | null, max: number) =>
      value === null || (Number.isInteger(value) && value >= 1 && value <= max);
    if (!valid(body.espera_minutos, 600) || !valid(body.estancia_minutos, 1440)) {
      return setError("Escribe minutos enteros (o deja vacío para no avisar).");
    }
    const result = await api.tableChange(slug, "PUT", "/avisos", body);
    if (!result.ok) return setError("No se pudo guardar.");
    props.onSaved();
  }

  return (
    <Modal title="Avisos de tiempo" onClose={props.onClose}>
      <form onSubmit={save} noValidate className="k-editor">
        <p className="k-muted k-small">
          La mesa se marca en el plano cuando se pasa de estos minutos. Vacío: sin aviso.
        </p>
        {error ? <p className="k-alert">{error}</p> : null}
        <div className="k-form-grid">
          <label className="k-field">
            <span>Espera sin servir (min)</span>
            <input
              value={wait}
              inputMode="numeric"
              onChange={(e) => setWait(e.target.value)}
              placeholder="20"
            />
          </label>
          <label className="k-field">
            <span>Estancia en la mesa (min)</span>
            <input
              value={stay}
              inputMode="numeric"
              onChange={(e) => setStay(e.target.value)}
              placeholder="90"
            />
          </label>
        </div>
        <div className="k-dialog-actions">
          <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
            Cancelar
          </button>
          <button type="submit" className="k-btn k-btn-go">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Ventana de una mesa: estado, pedidos con su siguiente paso, cuenta, ocupar y liberar. */
function TableDetail(props: {
  readonly table: DiningTable;
  readonly now: Date;
  readonly canManage: boolean;
  readonly canOrder: boolean;
  readonly onClose: () => void;
  readonly onOrder: () => void;
  readonly onChanged: (message: string | null, tone?: Toast["tone"]) => void;
}) {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const { table } = props;
  const [busyId, setBusyId] = useState<number | "mesa" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const permissions = {
    changeStatus: can(PERMISSION.OrdersChangeStatus),
    confirmPayment: can(PERMISSION.OrdersUpdate),
  };

  async function setOccupied(ocupada: boolean) {
    setBusyId("mesa");
    setError(null);
    const result = await api.tableChange(slug, "PATCH", `/${table.id}/estado`, { ocupada });
    setBusyId(null);
    if (result.ok) {
      props.onChanged(ocupada ? `${table.nombre} ocupada` : `${table.nombre} libre`);
      if (!ocupada) props.onClose();
      return;
    }
    const body = result.body as { reason?: string; pedidos?: string[] } | null;
    setError(
      body?.reason === "orders_in_progress"
        ? `Quedan pedidos en marcha (${(body.pedidos ?? []).join(", ")}). Entrégalos o cancélalos antes de liberar la mesa.`
        : describePanelError(result.status, result.body),
    );
  }

  async function advance(order: TableOrder) {
    const action = primaryAction(order, permissions);
    if (!action) return;
    setBusyId(order.id);
    setError(null);
    const result =
      action.kind === "payment"
        ? await api.confirmPayment(slug, order.id)
        : await api.changeStatus(slug, order.id, action.to);
    setBusyId(null);
    if (!result.ok) {
      setError(describePanelError(result.status, result.body));
      props.onChanged(null);
      return;
    }
    const code = order.codigo ?? `#${order.id}`;
    props.onChanged(
      action.kind === "payment"
        ? `${code}: cobro confirmado`
        : `${code}: ${(STATUS_LABEL[action.to] ?? action.to).toLocaleLowerCase("es")}`,
    );
  }

  const status = table.ocupada
    ? `Ocupada${table.ocupada_desde ? ` · ${occupiedFor(table.ocupada_desde, props.now)}` : ""}`
    : "Libre";

  return (
    <Modal title={table.nombre} onClose={props.onClose} wide>
      <div className="k-editor">
        <p className="k-table-head">
          <span className={`k-chip ${table.ocupada ? "is-busy" : "is-free"}`}>{status}</span>
          {table.capacidad ? (
            <span className="k-muted k-small">{table.capacidad} personas</span>
          ) : null}
        </p>
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}

        {table.pedidos.length === 0 ? (
          <p className="k-muted">
            {table.ocupada ? "Mesa ocupada, aún sin pedidos." : "Mesa libre, sin pedidos."}
          </p>
        ) : (
          <section aria-label="Pedidos de la mesa">
            <h3 className="k-subtitle">Pedidos</h3>
            <ul className="k-table-orders">
              {table.pedidos.map((order) => {
                const action = primaryAction(order, permissions);
                const closed = order.estado === "cancelado" || order.estado === "caducado";
                return (
                  <li key={order.id} className={closed ? "is-closed" : ""}>
                    <span className="k-table-order-main">
                      <strong>{order.codigo ?? `#${order.id}`}</strong>
                      <span className="k-chip">{STATUS_LABEL[order.estado] ?? order.estado}</span>
                      <span className="k-small k-muted">
                        {closed || order.estado === "entregado"
                          ? occupiedFor(order.desde, props.now)
                          : `${STATUS_LABEL[order.estado] ?? order.estado} hace ${shortDuration(
                              Math.max(
                                0,
                                Math.floor(
                                  (props.now.getTime() - Date.parse(order.estado_desde)) / 60_000,
                                ),
                              ),
                            )}`}{" "}
                        · {paymentLabel(order.metodo_pago)}
                        {order.estado_pago === "pendiente" ? " · cobro pendiente" : ""}
                      </span>
                      <span className="k-small">{summarizeLines(orderLines(order.items))}</span>
                      <OrderTimeline order={order} />
                    </span>
                    <span className="k-table-order-side">
                      <strong className="k-amount">{euros(order.total)}</strong>
                      {action ? (
                        <button
                          type="button"
                          className="k-btn k-btn-secondary k-btn-sm"
                          disabled={busyId !== null}
                          onClick={() => void advance(order)}
                        >
                          {busyId === order.id ? "…" : action.label}
                        </button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="k-manual-total">
              <span>Cuenta de la mesa</span>
              <strong>{euros(table.cuenta)}</strong>
            </p>
            {table.por_cobrar > 0 ? (
              <p className="k-small k-warn">Pendiente de cobro: {euros(table.por_cobrar)}</p>
            ) : null}
          </section>
        )}

        <div className="k-dialog-actions k-dialog-actions-split">
          <span className="k-dialog-actions">
            {props.canManage && table.ocupada ? (
              <button
                type="button"
                className="k-btn k-btn-secondary"
                disabled={busyId !== null}
                title={
                  table.en_marcha > 0
                    ? "Entrega o cancela los pedidos en marcha antes de liberar la mesa"
                    : undefined
                }
                onClick={() => void setOccupied(false)}
              >
                Liberar mesa
              </button>
            ) : null}
            {props.canManage && !table.ocupada ? (
              <button
                type="button"
                className="k-btn k-btn-secondary"
                disabled={busyId !== null}
                onClick={() => void setOccupied(true)}
              >
                Ocupar mesa
              </button>
            ) : null}
          </span>
          {props.canOrder && table.activa ? (
            <button type="button" className="k-btn k-btn-primary" onClick={props.onOrder}>
              {table.pedidos.length > 0 ? "Añadir pedido" : "Tomar pedido"}
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function errorText(result: { ok: false; status: number; body: unknown }): string {
  const reason = (result.body as { reason?: string } | null)?.reason;
  return (reason && CONFLICT[reason]) || "No se pudo guardar. Revisa los datos.";
}

function ZoneDialog(props: {
  readonly zone: TableZone | null;
  readonly branchId: number;
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [nombre, setNombre] = useState(props.zone?.nombre ?? "");
  const [activa, setActiva] = useState(props.zone?.activa ?? true);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!nombre.trim()) return setError("Ponle nombre a la zona.");
    const body = {
      nombre: nombre.trim(),
      activa,
      sucursal_id: props.zone?.sucursal_id ?? props.branchId,
    };
    const result = props.zone
      ? await api.tableChange(slug, "PUT", `/zonas/${props.zone.id}`, body)
      : await api.tableChange(slug, "POST", "/zonas", body);
    if (!result.ok) return setError(errorText(result));
    props.onSaved(props.zone ? "Zona guardada" : "Zona creada");
  }

  async function remove() {
    if (!props.zone) return;
    const result = await api.tableChange(slug, "DELETE", `/zonas/${props.zone.id}`);
    if (!result.ok) return setError("No se pudo borrar la zona.");
    props.onSaved("Zona borrada (sus mesas quedan sin zona)");
  }

  return (
    <Modal title={props.zone ? "Editar zona" : "Nueva zona"} onClose={props.onClose}>
      <form onSubmit={save} noValidate>
        {error ? <p className="k-alert">{error}</p> : null}
        <label className="k-field">
          <span>Nombre</span>
          <input
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej.: Terraza"
          />
        </label>
        <Toggle checked={activa} onChange={setActiva} label="Zona activa" />
        <div className="k-dialog-actions k-dialog-actions-split">
          {props.zone ? (
            <button type="button" className="k-link k-link-danger" onClick={remove}>
              Borrar zona
            </button>
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go">
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

function TableDialog(props: {
  readonly table: DiningTable | null;
  readonly plan: TablePlan;
  readonly branchId: number;
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const table = props.table;
  const branchId = table?.sucursal_id ?? props.branchId;
  const zones = props.plan.zonas.filter((zone) => zone.sucursal_id === branchId);
  const [numero, setNumero] = useState(String(table?.numero ?? nextTableNumber(props.plan)));
  const [nombre, setNombre] = useState(
    table && table.nombre !== `Mesa ${table.numero}` ? table.nombre : "",
  );
  const [capacidad, setCapacidad] = useState(table?.capacidad?.toString() ?? "");
  const [zonaId, setZonaId] = useState<number | null>(table?.zona_id ?? zones[0]?.id ?? null);
  const [activa, setActiva] = useState(table?.activa ?? true);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const number = Number(numero);
    const seats = capacidad.trim() ? Number(capacidad) : null;
    if (!Number.isInteger(number) || number < 1)
      return setError("El número de mesa va de 1 en adelante.");
    if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > 99)) {
      return setError("Capacidad: de 1 a 99 personas.");
    }
    const body = {
      numero: number,
      nombre: nombre.trim(),
      capacidad: seats,
      zona_id: zonaId,
      sucursal_id: branchId,
      activa,
    };
    const result = table
      ? await api.tableChange(slug, "PUT", `/${table.id}`, body)
      : await api.tableChange(slug, "POST", "", body);
    if (!result.ok) return setError(errorText(result));
    props.onSaved(table ? "Mesa guardada" : "Mesa creada");
  }

  async function remove() {
    if (!table) return;
    const result = await api.tableChange(slug, "DELETE", `/${table.id}`);
    if (!result.ok) return setError("No se pudo borrar la mesa.");
    props.onSaved("Mesa borrada");
  }

  return (
    <Modal title={table ? `Editar ${table.nombre}` : "Nueva mesa"} onClose={props.onClose}>
      <form onSubmit={save} noValidate>
        {error ? <p className="k-alert">{error}</p> : null}
        <div className="k-form-grid">
          <label className="k-field">
            <span>Número</span>
            <input value={numero} inputMode="numeric" onChange={(e) => setNumero(e.target.value)} />
          </label>
          <label className="k-field">
            <span>
              Personas <span className="k-muted k-optional">(opcional)</span>
            </span>
            <input
              value={capacidad}
              inputMode="numeric"
              onChange={(e) => setCapacidad(e.target.value)}
            />
          </label>
        </div>
        <label className="k-field">
          <span>
            Nombre <span className="k-muted k-optional">(opcional)</span>
          </span>
          <input
            value={nombre}
            maxLength={80}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={`Mesa ${numero}`}
          />
        </label>
        {zones.length > 0 ? (
          <label className="k-field">
            <span>Zona</span>
            <select
              className="k-input"
              value={zonaId ?? ""}
              onChange={(e) => setZonaId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin zona</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Toggle checked={activa} onChange={setActiva} label="Mesa activa" />
        <div className="k-dialog-actions k-dialog-actions-split">
          {table ? (
            <button type="button" className="k-link k-link-danger" onClick={remove}>
              Borrar mesa
            </button>
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go">
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}
