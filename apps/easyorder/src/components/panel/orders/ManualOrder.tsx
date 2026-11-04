"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ItemSheet } from "@/components/ItemSheet";
import {
  addLine,
  buildLine,
  type CartLine,
  lineCents,
  setQuantity,
  subtotalCents,
  toOrderItems,
} from "@/lib/cart";
import { describeApiError, normalizePhone, paymentLabel } from "@/lib/checkout";
import { euros, eurosFromCents } from "@/lib/format";
import type { Branch, DeliveryZone, Menu, MenuItem } from "@/lib/types";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

const CHANNEL = { Phone: "telefono", Counter: "mostrador" } as const;
type Channel = (typeof CHANNEL)[keyof typeof CHANNEL];

/**
 * Pedido manual (teléfono o mostrador). El total que vale es el del servidor: aquí solo se
 * muestra una estimación con los precios de la carta.
 */
export function ManualOrder({
  defaultBranchId,
  table = null,
  onClose,
  onCreated,
}: {
  readonly defaultBranchId: number | null;
  /** Pedido en una mesa: local fijo, sin despacho y con nombre y teléfono opcionales. */
  readonly table?: {
    readonly id: number;
    readonly nombre: string;
    readonly sucursal_id: number;
  } | null;
  readonly onClose: () => void;
  readonly onCreated: (message: string) => void;
}) {
  const { api, publicApi } = usePanel();
  const { slug, access } = useAccess();
  const scope = access.locales;
  const limited = scope !== "todos";
  const [branches, setBranches] = useState<Branch[]>([]);
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [branchId, setBranchId] = useState<number | null>(table?.sucursal_id ?? defaultBranchId);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<Channel>(table ? CHANNEL.Counter : CHANNEL.Phone);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fulfillment, setFulfillment] = useState<"retiro" | "delivery">("retiro");
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [direccion, setDireccion] = useState("");
  const [payment, setPayment] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idempotency = useRef(crypto.randomUUID());

  useEffect(() => {
    void publicApi.branches(slug).then((result) => {
      if (!result.ok) return;
      const own = result.data.locales.filter(
        (branch) => scope === "todos" || scope.includes(branch.id),
      );
      setBranches(own);
      setBranchId((current) => current ?? own[0]?.id ?? null);
    });
    void publicApi.zones(slug).then((result) => {
      if (result.ok) setZones(result.data.zonas);
    });
  }, [publicApi, slug, scope]);

  useEffect(() => {
    if (branchId === null && limited) return;
    setMenu(null);
    void publicApi.menu(slug, branchId).then((result) => {
      if (result.ok) {
        setMenu(result.data);
        setMenuError(null);
      } else {
        setMenuError("No pudimos cargar la carta.");
      }
    });
  }, [publicApi, slug, branchId, limited]);

  const filtered = useMemo(() => {
    if (!menu) return [];
    const text = query.trim().toLocaleLowerCase("es");
    return menu.categories
      .map((category) => ({
        ...category,
        items: category.items.filter(
          (item) => !text || item.name.toLocaleLowerCase("es").includes(text),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, query]);

  const branch = branches.find((candidate) => candidate.id === branchId) ?? null;
  const zone = zones.find((candidate) => candidate.id === zoneId) ?? null;
  const subtotal = subtotalCents(lines);
  const deliveryZones = zones.filter(
    (candidate) => !limited || branches.some((own) => own.nombre === candidate.local),
  );

  function quickAdd(item: MenuItem) {
    // Una sola variante y sin extras: se añade directamente; si no, se abre la ficha.
    const only = item.variants.length === 1 ? item.variants[0] : undefined;
    if (only && item.extras.length === 0) {
      setLines((current) => addLine(current, buildLine(item, only.id, [], 1, "")));
      return;
    }
    setPicking(item);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lines.length === 0) return setError("Añade al menos un producto.");
    if (!table && !nombre.trim()) return setError("Indica el nombre del cliente.");
    const phone = telefono.trim() ? normalizePhone(telefono) : null;
    if ((!table || telefono.trim()) && !phone) {
      return setError("Teléfono no válido. Ejemplo: 612 345 678.");
    }
    if (!payment) return setError("Elige el método de pago.");
    if (fulfillment === "delivery" && (!zoneId || !direccion.trim())) {
      return setError("Para reparto, elige la zona y escribe la dirección.");
    }
    setBusy(true);
    setError(null);
    const result = await api.manualOrder(
      slug,
      table
        ? {
            canal: CHANNEL.Counter,
            tipo_despacho: "mesa",
            mesa_id: table.id,
            ...(nombre.trim() ? { nombre: nombre.trim() } : {}),
            ...(phone ? { telefono: phone } : {}),
            metodo_pago: payment,
            ...(notas.trim() ? { notas: notas.trim() } : {}),
            items: toOrderItems(lines),
          }
        : {
            canal: channel,
            nombre: nombre.trim(),
            // El tablero muestra nombre_pedido: sin él, el pedido saldría como «Cliente».
            nombre_pedido: nombre.trim(),
            telefono: phone,
            tipo_despacho: fulfillment,
            metodo_pago: payment,
            ...(fulfillment === "retiro" && branchId ? { sucursal_id: branchId } : {}),
            ...(fulfillment === "delivery" ? { zona_id: zoneId, direccion: direccion.trim() } : {}),
            ...(notas.trim() ? { notas: notas.trim() } : {}),
            items: toOrderItems(lines),
          },
      idempotency.current,
    );
    setBusy(false);
    if (!result.ok) {
      const body = result.body as { reason?: string } | null;
      return setError(
        body?.reason === "branch_out_of_scope"
          ? "El pedido saldría de un local que no gestionas. Elige otro local o zona."
          : describeApiError(result.status, result.body),
      );
    }
    const code = result.data.pedido_codigo ?? `#${result.data.id}`;
    onCreated(`Pedido ${code} creado · ${euros(result.data.total)}`);
  }

  return (
    <Modal title={table ? `Pedido · ${table.nombre}` : "Nuevo pedido"} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="k-manual">
        <div className="k-manual-grid">
          <section className="k-manual-menu" aria-label="Carta">
            <div className="k-manual-tools">
              <label className="k-search">
                <span className="k-sr-only">Buscar producto</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar producto"
                />
              </label>
              {!table && branches.length > 1 && fulfillment === "retiro" ? (
                <label className="k-select">
                  <span className="k-sr-only">Local</span>
                  <select
                    value={branchId ?? ""}
                    onChange={(event) => {
                      setBranchId(Number(event.target.value));
                      setLines([]);
                    }}
                  >
                    {branches.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.nombre}
                        {option.abierto ? "" : " (cerrado)"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {menu && !menu.abierto ? (
              <p className="k-small k-warn">
                El local está cerrado ahora: el pedido no se podrá crear (Ajustes → Apertura).
              </p>
            ) : null}
            {menuError ? <p className="k-alert">{menuError}</p> : null}
            {!menu && !menuError ? <div className="k-skeleton" aria-busy="true" /> : null}
            <div className="k-manual-list">
              {filtered.map((category) => (
                <div key={category.id}>
                  <h3 className="k-subtitle">{category.name}</h3>
                  <ul>
                    {category.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="k-manual-item"
                          onClick={() => quickAdd(item)}
                        >
                          <span>{item.name}</span>
                          <span className="k-muted k-small">
                            {item.variants.length > 1 ? "desde " : ""}
                            {euros(Math.min(...item.variants.map((v) => v.price)))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="k-manual-order" aria-label="Pedido">
            <h3 className="k-subtitle">Pedido</h3>
            {lines.length === 0 ? (
              <p className="k-muted k-small">Toca un producto para añadirlo.</p>
            ) : (
              <ul className="k-manual-lines">
                {lines.map((line) => (
                  <li key={line.key}>
                    <span className="k-manual-line-name">
                      <strong>{line.name}</strong>
                      <span className="k-small k-muted">
                        {[line.variantName, ...line.extras.map((extra) => `+ ${extra.name}`)]
                          .filter(Boolean)
                          .join(" · ")}
                        {line.note ? ` · «${line.note}»` : ""}
                      </span>
                    </span>
                    <span className="k-qty-stepper">
                      <button
                        type="button"
                        className="k-icon-btn k-icon-btn-sm"
                        aria-label={`Quitar uno de ${line.name}`}
                        onClick={() =>
                          setLines((current) =>
                            line.quantity === 1
                              ? current.filter((other) => other.key !== line.key)
                              : setQuantity(current, line.key, line.quantity - 1),
                          )
                        }
                      >
                        −
                      </button>
                      <output>{line.quantity}</output>
                      <button
                        type="button"
                        className="k-icon-btn k-icon-btn-sm"
                        aria-label={`Añadir uno de ${line.name}`}
                        onClick={() =>
                          setLines((current) => setQuantity(current, line.key, line.quantity + 1))
                        }
                      >
                        +
                      </button>
                    </span>
                    <span className="k-amount">{eurosFromCents(lineCents(line))}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="k-manual-total">
              <span>Subtotal</span>
              <strong>{eurosFromCents(subtotal)}</strong>
            </p>
            {zone && fulfillment === "delivery" ? (
              <p className="k-small k-muted">
                Envío y mínimo de «{zone.nombre}»: {euros(zone.envio)}
                {zone.tipo_tarifa === "por_km" ? " + km" : ""}, mínimo {euros(zone.minimo)}. El
                total final lo calcula el servidor.
              </p>
            ) : null}

            {table ? null : (
              <div className="k-segment k-segment-sm">
                {[
                  { id: CHANNEL.Phone, label: "Por teléfono" },
                  { id: CHANNEL.Counter, label: "En mostrador" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={channel === option.id ? "is-on" : ""}
                    aria-pressed={channel === option.id}
                    onClick={() => setChannel(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <div className="k-form-grid">
              <label className="k-field">
                <span>
                  Nombre{table ? <span className="k-muted k-optional"> (opcional)</span> : null}
                </span>
                <input
                  value={nombre}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <label className="k-field">
                <span>
                  Teléfono{table ? <span className="k-muted k-optional"> (opcional)</span> : null}
                </span>
                <input
                  value={telefono}
                  inputMode="tel"
                  autoComplete="off"
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="612 345 678"
                />
              </label>
            </div>
            {!table && menu?.restaurante.reparto ? (
              <div className="k-segment k-segment-sm">
                <button
                  type="button"
                  className={fulfillment === "retiro" ? "is-on" : ""}
                  aria-pressed={fulfillment === "retiro"}
                  disabled={!menu.restaurante.recogida}
                  onClick={() => setFulfillment("retiro")}
                >
                  Recoge en el local
                </button>
                <button
                  type="button"
                  className={fulfillment === "delivery" ? "is-on" : ""}
                  aria-pressed={fulfillment === "delivery"}
                  onClick={() => setFulfillment("delivery")}
                >
                  Reparto
                </button>
              </div>
            ) : null}
            {!table && fulfillment === "retiro" && branch ? (
              <p className="k-small k-muted">Recoge en {branch.nombre}.</p>
            ) : null}
            {!table && fulfillment === "delivery" ? (
              <div className="k-form-grid">
                <label className="k-field">
                  <span>Zona</span>
                  <select
                    className="k-input"
                    value={zoneId ?? ""}
                    onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Elige la zona</option>
                    {deliveryZones.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.nombre}
                        {option.local && branches.length > 1 ? ` · ${option.local}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="k-field">
                  <span>Dirección</span>
                  <input
                    value={direccion}
                    maxLength={300}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {menu ? (
              <fieldset className="k-fieldset k-fieldset-flat">
                <legend className="k-field-label">Pago</legend>
                <div className="k-segment k-segment-sm">
                  {menu.restaurante.metodos_pago.map((method) => (
                    <button
                      key={method}
                      type="button"
                      className={payment === method ? "is-on" : ""}
                      aria-pressed={payment === method}
                      onClick={() => setPayment(method)}
                    >
                      {paymentLabel(method)}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <label className="k-field">
              <span>
                Notas <span className="k-muted k-optional">(opcional)</span>
              </span>
              <input value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
            </label>
            {error ? (
              <p className="k-alert" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="k-btn k-btn-primary k-btn-block" disabled={busy}>
              {busy ? "Creando…" : `Crear pedido · ${eurosFromCents(subtotal)}`}
            </button>
          </section>
        </div>
      </form>
      {picking ? (
        <ItemSheet
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            setLines((current) => addLine(current, line));
            setPicking(null);
          }}
        />
      ) : null}
    </Modal>
  );
}
