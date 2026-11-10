"use client";

import { type BoardSounds, DEFAULT_BOARD_SOUNDS } from "@konnecttia/domain";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describePanelError } from "@/lib/panel/api";
import {
  comandaHtml,
  type PrintSettings,
  printHtml,
  readPrintSettings,
  savePrintSettings,
} from "@/lib/panel/comanda";
import type { Driver } from "@/lib/panel/drivers";
import {
  BOARD_SORT,
  type BoardSort,
  isBoardSort,
  LANES,
  type LaneId,
  laneOf,
  newArrivals,
  type OrderAction,
  STATUS_LABEL,
  sortLaneOrders,
} from "@/lib/panel/orders";
import { soundToPlay, statusChanges } from "@/lib/panel/sounds";
import { type StreamState, subscribeBoard } from "@/lib/panel/stream";
import type { PanelBranch, PanelOrder } from "@/lib/panel/types";
import { BusyModeControl, BusyModeHelp } from "./BusyModeControl";
import { Icon } from "./Icon";
import { FirstSteps } from "./orders/FirstSteps";
import { ManualOrder } from "./orders/ManualOrder";
import { OrderCard } from "./orders/OrderCard";
import { OrdersTable } from "./orders/OrdersTable";
import { PrintSettingsDialog } from "./orders/PrintSettingsDialog";
import { usePanel } from "./PanelProvider";
import { PERMISSION, useAccess } from "./PanelShell";
import { PushToggle } from "./PushToggle";
import { useChime } from "./useChime";

/** Cada cuánto se consulta el tablero. */
/** Con el tiempo real activo, recarga de seguridad (por si se pierde un aviso). */
const SAFETY_REFRESH_MS = 60_000;
/** Sin tiempo real (conexión SSE caída), se vuelve al sondeo de antes. */
const FALLBACK_REFRESH_MS = 10_000;

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
  const [stream, setStream] = useState<StreamState>("conectando");
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [fresh, setFresh] = useState<ReadonlySet<number>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cancelling, setCancelling] = useState<PanelOrder | null>(null);
  const [detail, setDetail] = useState<DetailMode>("auto");
  const [overrides, setOverrides] = useState<Readonly<Record<number, boolean>>>({});
  const [view, setView] = useState<BoardView>("tablero");
  const [sort, setSort] = useState<BoardSort>("antiguos");
  const seen = useRef<Set<number> | null>(null);
  const seenStatus = useRef<Map<number, string> | null>(null);
  /** Cambios de estado que hizo esta misma persona: no suenan. */
  const ownChanges = useRef(new Map<number, string>());
  const soundsRef = useRef<BoardSounds>(DEFAULT_BOARD_SOUNDS);
  const dialog = useRef<HTMLDialogElement>(null);

  const permissions = {
    changeStatus: can(PERMISSION.OrdersChangeStatus),
    confirmPayment: can(PERMISSION.OrdersUpdate),
    create: can(PERMISSION.OrdersCreate),
  };
  const [creating, setCreating] = useState(false);
  const [printSettings, setPrintSettings] = useState<PrintSettings>(readPrintSettings);
  const [printDialog, setPrintDialog] = useState(false);
  // El aviso de pedidos nuevos lee la preferencia actual sin recrear la carga del tablero.
  const printRef = useRef(printSettings);
  printRef.current = printSettings;

  const print = useCallback(
    (order: PanelOrder) =>
      printHtml(
        comandaHtml(order, {
          restaurante: access.restaurante.nombre,
          timeZone: access.restaurante.zona_horaria,
          paper: printRef.current.paper,
          copia: printRef.current.copia,
        }),
      ),
    [access.restaurante.nombre, access.restaurante.zona_horaria],
  );
  const [drivers, setDrivers] = useState<readonly Driver[] | null>(null);
  const canAssign = can(PERMISSION.DeliveryAssign);
  const driverOnly = !can(PERMISSION.OrdersView) && can(PERMISSION.OrdersDeliverAssigned);

  // Quien solo reparte va a «Mis repartos».
  useEffect(() => {
    if (driverOnly) router.replace(`/panel/${slug}/repartos`);
  }, [driverOnly, router, slug]);

  useEffect(() => {
    if (!canAssign) return;
    void api.drivers(slug).then((result) => {
      if (result.ok) setDrivers(result.data.repartidores);
    });
  }, [api, slug, canAssign]);

  async function assign(order: PanelOrder, membershipId: number | null) {
    setPending((current) => new Set(current).add(order.id));
    const result = await api.assignDriver(slug, order.id, membershipId);
    setPending((current) => {
      const next = new Set(current);
      next.delete(order.id);
      return next;
    });
    const code = order.pedido_codigo ?? `#${order.id}`;
    if (result.ok)
      toast(membershipId === null ? `${code}: sin repartidor` : `${code}: repartidor asignado`);
    else toast(describePanelError(result.status, result.body), "error");
    await load();
  }

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
    const changes = statusChanges(seenStatus.current, list, ownChanges.current);
    ownChanges.current.clear();
    const sound = soundToPlay(arrivals.length > 0, changes, soundsRef.current);
    if (sound) playChime(sound);
    if (arrivals.length > 0) {
      // Comanda automática de los pedidos nuevos (una por pedido, en orden de llegada).
      if (printRef.current.alLlegar) {
        for (const order of [...arrivals].reverse()) print(order);
      }
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
    seenStatus.current = new Map(list.map((order) => [order.id, order.estado]));
    setOrders(list);
    setLastSync(new Date());
  }, [api, slug, branchId, router, playChime, print]);

  // Al cambiar de local se vuelve a empezar: los pedidos ya visibles no suenan otra vez.
  useEffect(() => {
    seen.current = null;
    seenStatus.current = null;
    setOrders(null);
    void load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(
      () => void load(),
      stream === "en_directo" ? SAFETY_REFRESH_MS : FALLBACK_REFRESH_MS,
    );
    return () => clearInterval(timer);
  }, [load, stream]);

  // Tiempo real: el servidor avisa cuando cambia algún pedido (web, panel o WhatsApp).
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const stop = subscribeBoard({
      url: api.boardStreamUrl(slug),
      getToken: api.token,
      onState: setStream,
      onChange: () => {
        // Varios avisos seguidos se agrupan en una sola recarga.
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => void load(), 250);
      },
    });
    return () => {
      if (pending) clearTimeout(pending);
      stop();
    };
  }, [api, slug, load]);

  // Sonidos por estado del restaurante: se refrescan con el resto del tablero.
  useEffect(() => {
    let alive = true;
    const loadSounds = async () => {
      const result = await api.boardSounds(slug);
      if (alive && result.ok) soundsRef.current = result.data.sonidos;
    };
    void loadSounds();
    const timer = setInterval(() => void loadSounds(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api, slug]);

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
    for (const id of Object.keys(groups) as LaneId[]) {
      groups[id] = sortLaneOrders(groups[id], sort, id === "cerrados");
    }
    return groups;
  }, [orders, sort]);

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
      if (action.kind === "status") ownChanges.current.set(order.id, action.to);
      if (action.kind === "cancel") ownChanges.current.set(order.id, "cancelado");
      if (
        action.kind === "status" &&
        action.to === "confirmado" &&
        printRef.current.alAceptar &&
        !printRef.current.alLlegar
      ) {
        print(order);
      }
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
    const stored = readStored(VIEW_KEY);
    if (stored === "tabla") setView("tabla");
    const storedSort = readStored(SORT_KEY);
    if (isBoardSort(storedSort)) setSort(storedSort);
  }, []);

  function choose<T extends string>(key: string, value: T, apply: (value: T) => void) {
    apply(value);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Sin almacenamiento: solo dura esta visita.
    }
  }

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
          <span
            className={`k-live${offline ? " is-off" : ""}${stream === "en_directo" ? "" : " is-polling"}`}
            role="status"
            title={
              stream === "en_directo"
                ? "Los pedidos llegan al momento"
                : "Comprobando cada pocos segundos"
            }
          >
            <span className="k-live-dot" aria-hidden="true" />
            {offline
              ? "Sin conexión, reintentando…"
              : lastSync
                ? `${stream === "en_directo" ? "En directo" : "Actualizado"} · ${lastSync.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: access.restaurante.zona_horaria })}`
                : "Conectando…"}
          </span>
          <fieldset className="k-segment k-segment-sm" data-tour="pedidos-vista">
            <legend className="k-sr-only">Vista</legend>
            {VIEWS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={view === option.id ? "is-on" : ""}
                aria-pressed={view === option.id}
                onClick={() => choose(VIEW_KEY, option.id, setView)}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            data-tour="pedidos-comanda"
            onClick={() => setPrintDialog(true)}
          >
            <Icon name="print" size={18} />
            Comanda
          </button>
          <button
            type="button"
            className={`k-btn k-btn-secondary k-btn-sm${chime.enabled ? "" : " is-attention"}`}
            onClick={chime.toggle}
            aria-pressed={chime.enabled}
          >
            <Icon name={chime.enabled ? "bell" : "bellOff"} size={18} />
            {chime.enabled ? "Sonido activado" : "Activar sonido"}
          </button>
          <PushToggle />
          {permissions.create ? (
            <button
              type="button"
              className="k-btn k-btn-primary k-btn-sm"
              data-tour="pedidos-nuevo"
              onClick={() => setCreating(true)}
            >
              Nuevo pedido
            </button>
          ) : null}
        </div>
      </header>

      <FirstSteps />

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
        <details
          className="k-busy-panel"
          open={activeBusy > 0 || visibleBranches.length === 1}
          data-tour="pedidos-ocupado"
        >
          <summary>
            <Icon name="flame" size={18} />
            Modo ocupado
            <span className={`k-chip${activeBusy > 0 ? " k-chip-recibido" : ""}`}>
              {activeBusy > 0
                ? `${activeBusy} ${activeBusy === 1 ? "local" : "locales"} con más espera`
                : "tiempos normales"}
            </span>
          </summary>
          <BusyModeHelp duration={busySettings.duracion_minutos} />
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

      {view === "tabla" ? (
        <OrdersTable
          branches={branches}
          version={lastSync?.getTime() ?? 0}
          busyIds={pending}
          permissions={permissions}
          onAction={(order, action) => void run(order, action)}
          onCancel={askCancel}
          onPrint={print}
        />
      ) : null}

      {view === "tablero" ? (
        <>
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
            <label className="k-select k-select-sm">
              <span className="k-sr-only">Ordenar las tarjetas</span>
              <select
                value={sort}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isBoardSort(value)) choose(SORT_KEY, value, setSort);
                }}
              >
                {BOARD_SORT.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {orders === null ? (
            <div className="k-board" aria-busy="true" data-tour="pedidos-tablero">
              {LANES.map((item) => (
                <section key={item.id} className="k-lane">
                  <div className="k-skeleton" />
                  <div className="k-skeleton" />
                </section>
              ))}
            </div>
          ) : (
            <div className="k-board" data-lane={lane} data-tour="pedidos-tablero">
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
                            onPrint={() => print(order)}
                            drivers={drivers}
                            onAssign={(membershipId) => void assign(order, membershipId)}
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
        </>
      ) : null}

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

      {printDialog ? (
        <PrintSettingsDialog
          settings={printSettings}
          onChange={(next) => {
            setPrintSettings(next);
            savePrintSettings(next);
          }}
          onTest={() => {
            const sample = orders?.[0];
            if (sample) print(sample);
          }}
          canTest={(orders?.length ?? 0) > 0}
          onClose={() => setPrintDialog(false)}
        />
      ) : null}

      {creating ? (
        <ManualOrder
          defaultBranchId={branchId}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
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

type BoardView = "tablero" | "tabla";
const VIEW_KEY = "easyorder.panel.vista";
const SORT_KEY = "easyorder.panel.orden";
const VIEWS: readonly { id: BoardView; label: string }[] = [
  { id: "tablero", label: "Tablero" },
  { id: "tabla", label: "Tabla" },
];

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
