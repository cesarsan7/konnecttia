"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ORDER_STATUS_LABEL } from "@/lib/checkout";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import {
  type DiningTable,
  groupByZone,
  nextTableNumber,
  occupiedFor,
  type TablePlan,
  type TableZone,
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

const REFRESH_MS = 20_000;

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
  const [selected, setSelected] = useState<DiningTable | null>(null);
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

  async function setOccupied(table: DiningTable, ocupada: boolean) {
    const result = await api.tableChange(slug, "PATCH", `/${table.id}/estado`, { ocupada });
    if (result.ok) toast(ocupada ? `${table.nombre} ocupada` : `${table.nombre} libre`);
    else toast("No se pudo cambiar la mesa.", "error");
    setSelected(null);
    void load();
  }

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

      {tablesHere.length > 0 ? (
        <p className="k-muted k-small k-tables-summary">
          <strong>{tablesHere.length - busy}</strong> libres · <strong>{busy}</strong> ocupadas
        </p>
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
              {group.tables.map((table) => (
                <li key={table.id}>
                  <button
                    type="button"
                    className={`k-table-tile${table.ocupada ? " is-busy" : ""}${table.activa ? "" : " is-off"}`}
                    onClick={() => (editMode ? setEditingTable(table) : setSelected(table))}
                    aria-label={`${table.nombre}, ${table.ocupada ? "ocupada" : "libre"}`}
                  >
                    <strong>{table.nombre}</strong>
                    <span className="k-small">
                      {table.capacidad ? `${table.capacidad} pers.` : ""}
                      {!table.activa ? " · desactivada" : ""}
                    </span>
                    {table.pedido ? (
                      <span className="k-table-order">
                        {euros(table.pedido.total)} · {occupiedFor(table.pedido.desde, now)}
                      </span>
                    ) : (
                      <span className="k-table-order">{table.ocupada ? "Ocupada" : "Libre"}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {selected ? (
        <Modal title={selected.nombre} onClose={() => setSelected(null)}>
          {selected.pedido ? (
            <p>
              Pedido <strong>{selected.pedido.codigo ?? `#${selected.pedido.id}`}</strong> ·{" "}
              {ORDER_STATUS_LABEL[selected.pedido.estado] ?? selected.pedido.estado} ·{" "}
              {euros(selected.pedido.total)}. Sigue su estado en el tablero de pedidos.
            </p>
          ) : (
            <p className="k-muted">
              {selected.ocupada ? "Marcada como ocupada, sin pedido." : "Mesa libre."}
            </p>
          )}
          <div className="k-dialog-actions">
            {/* Con un pedido en marcha, la mesa se libera al entregarlo o cancelarlo en el tablero. */}
            {canManage && !selected.pedido ? (
              <button
                type="button"
                className="k-btn k-btn-secondary"
                onClick={() => void setOccupied(selected, !selected.ocupada_manual)}
              >
                {selected.ocupada_manual ? "Marcar libre" : "Marcar ocupada"}
              </button>
            ) : null}
            {canOrder && selected.activa ? (
              <button
                type="button"
                className="k-btn k-btn-primary"
                onClick={() => {
                  setOrdering(selected);
                  setSelected(null);
                }}
              >
                {selected.pedido ? "Otro pedido en la mesa" : "Tomar pedido"}
              </button>
            ) : null}
          </div>
        </Modal>
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
