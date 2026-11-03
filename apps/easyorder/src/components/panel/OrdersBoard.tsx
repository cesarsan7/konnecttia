"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { euros } from "@/lib/format";
import { describePanelError } from "@/lib/panel/api";
import {
  canCancel,
  formatElapsed,
  LANES,
  type LaneId,
  laneOf,
  minutesSince,
  newArrivals,
  type OrderAction,
  orderLines,
  orderNotes,
  paymentLabel,
  primaryAction,
  STATUS_LABEL,
  summarizeLines,
  WAITING_TOO_LONG_MINUTES,
} from "@/lib/panel/orders";
import type { PanelBranch, PanelOrder } from "@/lib/panel/types";
import { BusyModeControl } from "./BusyModeControl";
import { Icon } from "./Icon";
import { usePanel } from "./PanelProvider";
import { PERMISSION, useAccess } from "./PanelShell";
import { useChime } from "./useChime";

/** Cada cuánto se consulta el tablero. */
const REFRESH_MS = 10_000;

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

export function OrdersBoard() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const router = useRouter();
  const chime = useChime();
  const playChime = chime.play;
  const [orders, setOrders] = useState<PanelOrder[] | null>(null);
  const [branches, setBranches] = useState<PanelBranch[]>([]);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [lane, setLane] = useState<LaneId>("nuevos");
  const [now, setNow] = useState(() => new Date());
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cancelling, setCancelling] = useState<PanelOrder | null>(null);
  const [detail, setDetail] = useState<DetailMode>("auto");
  const [overrides, setOverrides] = useState<Readonly<Record<number, boolean>>>({});
  const seen = useRef<Set<number> | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const permissions = {
    changeStatus: can(PERMISSION.OrdersChangeStatus),
    confirmPayment: can(PERMISSION.OrdersUpdate),
  };

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4500);
  }, []);

  const loadBranches = useCallback(async () => {
    const result = await api.branches(slug);
    if (result.ok) setBranches(result.data.locales);
  }, [api, slug]);

  const load = useCallback(async () => {
    const result = await api.board(slug, branchId);
    if (!result.ok) {
      if (result.status === 401) router.replace("/panel");
      setOffline(true);
      return;
    }
    setOffline(false);
    const list = result.data.pedidos;
    const arrivals = newArrivals(seen.current, list);
    if (arrivals.length > 0) {
      playChime();
      setFresh((current) => new Set([...current, ...arrivals.map((order) => order.id)]));
      setTimeout(
        () =>
          setFresh((current) => {
            const next = new Set(current);
            for (const order of arrivals) next.delete(order.id);
            return next;
          }),
        20_000,
      );
    }
    seen.current = new Set(list.map((order) => order.id));
    setOrders(list);
    setLastSync(new Date());
  }, [api, slug, branchId, router, playChime]);

  // Al cambiar de local se vuelve a empezar: los pedidos ya visibles no suenan otra vez.
  useEffect(() => {
    seen.current = null;
    setOrders(null);
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    void loadBranches();
    const timer = setInterval(() => void loadBranches(), 60_000);
    return () => clearInterval(timer);
  }, [loadBranches]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const byLane = useMemo(() => {
    const groups: Record<LaneId, PanelOrder[]> = {
      nuevos: [],
      cocina: [],
      listos: [],
      cerrados: [],
    };
    for (const order of orders ?? []) groups[laneOf(order)].push(order);
    // Lo más antiguo primero en las columnas activas: es lo que más espera.
    for (const id of ["nuevos", "cocina", "listos"] as const) groups[id].reverse();
    return groups;
  }, [orders]);

  const newCount = byLane.nuevos.length;
  useEffect(() => {
    const name = access.restaurante.nombre;
    document.title = newCount > 0 ? `(${newCount}) Nuevos · ${name}` : `Pedidos · ${name}`;
  }, [newCount, access.restaurante.nombre]);

  async function run(order: PanelOrder, action: OrderAction | { kind: "cancel" }) {
    setPending((current) => new Set(current).add(order.id));
    const result =
      action.kind === "payment"
        ? await api.confirmPayment(slug, order.id)
        : await api.changeStatus(
            slug,
            order.id,
            action.kind === "cancel" ? "cancelado" : action.to,
          );
    setPending((current) => {
      const next = new Set(current);
      next.delete(order.id);
      return next;
    });
    if (result.ok) {
      const code = order.pedido_codigo ?? `#${order.id}`;
      toast(
        action.kind === "payment"
          ? `Cobro confirmado · ${code}`
          : action.kind === "cancel"
            ? `Pedido cancelado · ${code}`
            : `${code} → ${STATUS_LABEL[action.to] ?? action.to}`,
      );
    } else {
      toast(describePanelError(result.status, result.body), "error");
    }
    await load();
  }

  function askCancel(order: PanelOrder) {
    setCancelling(order);
    dialog.current?.showModal();
  }

  useEffect(() => {
    setDetail(storedDetailMode());
  }, []);

  function setAllDetail(mode: DetailMode) {
    setDetail(mode);
    setOverrides({});
    try {
      localStorage.setItem(DETAIL_KEY, mode);
    } catch {
      // Sin almacenamiento: solo dura esta visita.
    }
  }

  const isExpanded = (order: PanelOrder) =>
    overrides[order.id] ??
    (detail === "todo" ? true : detail === "nada" ? false : laneOf(order) === "nuevos");

  const showBranches = branches.length > 1;
  const visibleBranches = branchId ? branches.filter((branch) => branch.id === branchId) : branches;
  const busySettings = access.ajustes.modo_ocupado;
  const activeBusy = visibleBranches.filter((branch) => branch.modo_ocupado).length;

  return (
    <div className="k-page">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">{access.restaurante.nombre}</p>
          <h1 className="k-heading">Pedidos</h1>
        </div>
        <div className="k-head-tools">
          <span className={`k-live${offline ? " is-off" : ""}`} role="status">
            <span className="k-live-dot" aria-hidden="true" />
            {offline
              ? "Sin conexión, reintentando…"
              : lastSync
                ? `En directo · ${lastSync.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: access.restaurante.zona_horaria })}`
                : "Conectando…"}
          </span>
          <button
            type="button"
            className={`k-btn k-btn-secondary k-btn-sm${chime.enabled ? "" : " is-attention"}`}
            onClick={chime.toggle}
            aria-pressed={chime.enabled}
          >
            <Icon name={chime.enabled ? "bell" : "bellOff"} size={18} />
            {chime.enabled ? "Sonido activado" : "Activar sonido"}
          </button>
        </div>
      </header>

      {showBranches ? (
        <fieldset className="k-segment">
          <legend className="k-sr-only">Local</legend>
          <button
            type="button"
            className={branchId === null ? "is-on" : ""}
            aria-pressed={branchId === null}
            onClick={() => setBranchId(null)}
          >
            Todos los locales
          </button>
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={branchId === branch.id ? "is-on" : ""}
              aria-pressed={branchId === branch.id}
              onClick={() => setBranchId(branch.id)}
            >
              {branch.nombre}
            </button>
          ))}
        </fieldset>
      ) : null}

      {permissions.changeStatus && busySettings && visibleBranches.length > 0 ? (
        <details className="k-busy-panel" open={activeBusy > 0 || visibleBranches.length === 1}>
          <summary>
            <Icon name="flame" size={18} />
            Modo ocupado
            <span className={`k-chip${activeBusy > 0 ? " k-chip-recibido" : ""}`}>
              {activeBusy > 0
                ? `${activeBusy} ${activeBusy === 1 ? "local" : "locales"} con más espera`
                : "tiempos normales"}
            </span>
          </summary>
          <div className="k-busy-row">
            {visibleBranches.map((branch) => (
              <BusyModeControl
                key={branch.id}
                branch={branch}
                showName={showBranches}
                timeZone={access.restaurante.zona_horaria}
                options={busySettings.opciones}
                onChange={async (minutes) => {
                  const result =
                    minutes === null
                      ? await api.stopBusy(slug, branch.id)
                      : await api.startBusy(slug, branch.id, minutes);
                  if (!result.ok) toast(describePanelError(result.status, result.body), "error");
                  else
                    toast(
                      minutes === null
                        ? `${branch.nombre}: tiempos normales`
                        : `${branch.nombre}: +${minutes} min durante ${busySettings.duracion_minutos} min`,
                    );
                  await loadBranches();
                }}
              />
            ))}
          </div>
        </details>
      ) : null}

      <div className="k-lane-tabs" role="tablist" aria-label="Estado de los pedidos">
        {LANES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={lane === item.id}
            className={lane === item.id ? "is-on" : ""}
            onClick={() => setLane(item.id)}
          >
            {item.title}
            <span className="k-count">{byLane[item.id].length}</span>
          </button>
        ))}
      </div>

      <div className="k-board-tools">
        <span className="k-small k-muted">Detalle de los pedidos:</span>
        <fieldset className="k-segment k-segment-sm">
          <legend className="k-sr-only">Detalle de los pedidos</legend>
          {DETAIL_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={detail === option.id ? "is-on" : ""}
              aria-pressed={detail === option.id}
              onClick={() => setAllDetail(option.id)}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      {orders === null ? (
        <div className="k-board" aria-busy="true">
          {LANES.map((item) => (
            <section key={item.id} className="k-lane">
              <div className="k-skeleton" />
              <div className="k-skeleton" />
            </section>
          ))}
        </div>
      ) : (
        <div className="k-board" data-lane={lane}>
          {LANES.map((item) => (
            <section
              key={item.id}
              className={`k-lane k-lane-${item.id}${lane === item.id ? " is-current" : ""}`}
              aria-labelledby={`lane-${item.id}`}
            >
              <h2 id={`lane-${item.id}`} className="k-lane-title">
                {item.title}
                <span className="k-count">{byLane[item.id].length}</span>
              </h2>
              {byLane[item.id].length === 0 ? (
                <p className="k-empty">
                  {item.id === "nuevos"
                    ? "Sin pedidos nuevos. Te avisaremos con un sonido."
                    : item.id === "cerrados"
                      ? "Aquí verás los pedidos de las últimas 12 horas."
                      : "Nada por aquí."}
                </p>
              ) : (
                <ol className="k-cards">
                  {byLane[item.id].map((order) => (
                    <li key={order.id}>
                      <OrderCard
                        order={order}
                        now={now}
                        fresh={fresh.has(order.id)}
                        busy={pending.has(order.id)}
                        showBranch={showBranches && branchId === null}
                        timeZone={access.restaurante.zona_horaria}
                        permissions={permissions}
                        onAction={(action) => run(order, action)}
                        onCancel={() => askCancel(order)}
                        expanded={isExpanded(order)}
                        onToggle={() =>
                          setOverrides((current) => ({
                            ...current,
                            [order.id]: !isExpanded(order),
                          }))
                        }
                      />
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}

      <dialog
        ref={dialog}
        className="k-dialog"
        aria-labelledby="cancel-title"
        onClose={() => setCancelling(null)}
      >
        <form method="dialog">
          <h2 id="cancel-title" className="k-title">
            ¿Cancelar el pedido {cancelling?.pedido_codigo ?? ""}?
          </h2>
          <p className="k-muted">
            El cliente verá el pedido como cancelado. Si ya pagó por transferencia, recuerda
            devolverle el importe.
          </p>
          <div className="k-dialog-actions">
            <button type="submit" className="k-btn k-btn-secondary">
              No, mantener
            </button>
            <button
              type="button"
              className="k-btn k-btn-danger"
              onClick={() => {
                const order = cancelling;
                dialog.current?.close();
                if (order) void run(order, { kind: "cancel" });
              }}
            >
              Sí, cancelar
            </button>
          </div>
        </form>
      </dialog>

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

type CardProps = {
  readonly order: PanelOrder;
  readonly now: Date;
  readonly fresh: boolean;
  readonly busy: boolean;
  readonly showBranch: boolean;
  readonly timeZone: string;
  readonly permissions: { readonly changeStatus: boolean; readonly confirmPayment: boolean };
  readonly onAction: (action: OrderAction) => void;
  readonly onCancel: () => void;
  readonly expanded: boolean;
  readonly onToggle: () => void;
};

type DetailMode = "auto" | "todo" | "nada";
const DETAIL_KEY = "easyorder.panel.detalle";
const DETAIL_OPTIONS: readonly { id: DetailMode; label: string }[] = [
  { id: "auto", label: "Solo nuevos" },
  { id: "todo", label: "Todos" },
  { id: "nada", label: "Ninguno" },
];

function storedDetailMode(): DetailMode {
  try {
    const value = localStorage.getItem(DETAIL_KEY);
    return value === "todo" || value === "nada" ? value : "auto";
  } catch {
    return "auto";
  }
}

function OrderCard({
  order,
  now,
  fresh,
  busy,
  showBranch,
  timeZone,
  permissions,
  onAction,
  onCancel,
  expanded,
  onToggle,
}: CardProps) {
  const lane = laneOf(order);
  const minutes = minutesSince(order.created_at, now);
  const late = lane === "nuevos" && minutes >= WAITING_TOO_LONG_MINUTES;
  const lines = orderLines(order.items);
  const notes = orderNotes(order.notas);
  const hasNotes = notes.length > 0 || lines.some((line) => line.note);
  const detailId = `pedido-${order.id}-detalle`;
  const action = primaryAction(order, permissions);
  const paymentPending = order.estado_pago === "pendiente";
  const delivery = order.tipo_despacho === "delivery";
  const closed = lane === "cerrados";
  const time = new Date(order.created_at).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <article
      className={`k-order${fresh ? " is-fresh" : ""}${late ? " is-late" : ""}${closed ? " is-closed" : ""}`}
      aria-label={`Pedido ${order.pedido_codigo ?? order.id}`}
    >
      <header className="k-order-head">
        <button
          type="button"
          className="k-order-toggle"
          aria-expanded={expanded}
          aria-controls={detailId}
          onClick={onToggle}
        >
          <span className="k-sr-only">{expanded ? "Ocultar detalle de " : "Ver detalle de "}</span>
          <span className="k-order-code">{order.pedido_codigo ?? `#${order.id}`}</span>
          <Icon name={expanded ? "chevronUp" : "chevronDown"} size={18} />
        </button>
        <div className="k-order-tags">
          <span className={`k-chip k-chip-${order.estado}`}>
            {STATUS_LABEL[order.estado] ?? order.estado}
          </span>
          {order.canal === "whatsapp" ? (
            <span className="k-chip k-chip-channel">WhatsApp</span>
          ) : null}
        </div>
        <span className={`k-elapsed${late ? " is-late" : ""}`} title={`Entró a las ${time}`}>
          <Icon name="clock" size={16} />
          {closed ? time : formatElapsed(minutes)}
        </span>
      </header>

      <div className="k-order-who">
        <strong>{order.nombre_pedido ?? "Cliente"}</strong>
        {expanded ? (
          <a className="k-small" href={`tel:${order.telefono}`}>
            <Icon name="phone" size={14} /> {order.telefono}
          </a>
        ) : null}
      </div>

      <p className="k-order-mode">
        <Icon name={delivery ? "bike" : "bag"} size={16} />
        <span>
          {delivery ? "Reparto" : "Recogida"}
          {showBranch && order.local_nombre ? ` · ${order.local_nombre}` : ""}
          {order.tiempo_estimado ? ` · ${order.tiempo_estimado}` : ""}
        </span>
      </p>
      {expanded ? (
        <div id={detailId} className="k-order-detail">
          {delivery && order.direccion ? (
            <a
              className="k-order-address k-small"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.direccion)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="pin" size={14} /> {order.direccion}
            </a>
          ) : null}

          <ul className="k-lines">
            {lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: las líneas de un pedido no cambian de orden.
              <li key={index}>
                <span className="k-qty">{line.quantity}×</span>
                <span>
                  {line.name}
                  {line.variant ? <span className="k-muted"> · {line.variant}</span> : null}
                  {line.extras.length > 0 ? (
                    <span className="k-line-extras">+ {line.extras.join(", ")}</span>
                  ) : null}
                  {line.note ? <span className="k-line-note">«{line.note}»</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {notes.length > 0 ? (
            <p className="k-order-note">
              <strong>Nota:</strong> {notes.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : (
        <button type="button" id={detailId} className="k-order-summary" onClick={onToggle}>
          <span className="k-summary-text">{summarizeLines(lines)}</span>
          {hasNotes ? <span className="k-chip k-chip-note">Con notas</span> : null}
        </button>
      )}

      <div className="k-order-total">
        <span className={`k-pay${paymentPending ? " is-pending" : ""}`}>
          {paymentLabel(order.metodo_pago)}
          {paymentPending
            ? " · pendiente de cobro"
            : order.estado_pago === "pagado"
              ? " · cobrado"
              : ""}
        </span>
        <strong className="k-amount">{euros(Number(order.total))}</strong>
      </div>

      {!closed && (action || permissions.changeStatus) ? (
        <footer className="k-order-actions">
          {action ? (
            <button
              type="button"
              className="k-btn k-btn-go"
              disabled={busy}
              onClick={() => onAction(action)}
            >
              {action.kind === "payment" ? <Icon name="check" size={18} /> : null}
              {busy ? "Guardando…" : action.label}
            </button>
          ) : null}
          {paymentPending && action?.kind !== "payment" && permissions.confirmPayment ? (
            <button
              type="button"
              className="k-btn k-btn-secondary"
              disabled={busy}
              onClick={() => onAction({ kind: "payment", label: "Confirmar cobro" })}
            >
              Confirmar cobro
            </button>
          ) : null}
          {permissions.changeStatus && canCancel(order) ? (
            <button
              type="button"
              className="k-link k-link-danger"
              disabled={busy}
              onClick={onCancel}
            >
              Cancelar
            </button>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
}
