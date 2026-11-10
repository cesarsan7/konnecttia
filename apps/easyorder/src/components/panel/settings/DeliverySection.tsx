"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { parsePrice, priceInput } from "@/lib/panel/menu";
import {
  coverageLabel,
  type DeliveryZone,
  feeLabel,
  parseMinutes,
  type ZoneBranch,
  zoneErrorMessage,
} from "@/lib/panel/settings";
import { SETTINGS_HELP } from "@/lib/settings-help";
import { HelpNote } from "../../HelpNote";
import { Toggle } from "../menu/Editors";
import { Modal } from "../menu/Modal";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Notify = (text: string, tone?: "ok" | "error") => void;

/** Zonas de reparto por local: dónde se reparte, cuánto cuesta, mínimo y tiempo. */
export function DeliverySection({
  editable,
  notify,
}: {
  readonly editable: boolean;
  readonly notify: Notify;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [zones, setZones] = useState<DeliveryZone[] | null>(null);
  const [branches, setBranches] = useState<ZoneBranch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ zone: DeliveryZone | null; branchId: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    const result = await api.deliveryZones(slug);
    if (result.ok) {
      setZones(result.data.zonas);
      setBranches(result.data.locales);
      setError(null);
    } else {
      setError("No pudimos cargar las zonas de reparto.");
    }
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <p className="k-card k-alert" role="alert">
        {error}
      </p>
    );
  }
  if (!zones) return <div className="k-skeleton" aria-busy="true" />;

  return (
    <div className="k-settings-stack">
      {branches.map((branch) => {
        const own = zones.filter((zone) => zone.sucursal_id === branch.id);
        return (
          <section
            key={branch.id}
            className="k-card k-settings"
            aria-label={`Reparto de ${branch.nombre}`}
          >
            <header className="k-settings-head k-settings-head-row">
              <div>
                <h2 className="k-title">
                  {branches.length > 1 ? `Reparto desde ${branch.nombre}` : "Zonas de reparto"}
                </h2>
                <p className="k-muted k-small">
                  Si una dirección entra en varias zonas, se usa la más concreta; «toda la ciudad»
                  va la última.
                </p>
                <HelpNote items={SETTINGS_HELP.zonas} />
              </div>
              {editable ? (
                <button
                  type="button"
                  className="k-btn k-btn-secondary k-btn-sm"
                  onClick={() => setEditing({ zone: null, branchId: branch.id })}
                >
                  Nueva zona
                </button>
              ) : null}
            </header>
            {!branch.reparto ? (
              <p className="k-small k-warn">
                Este local tiene el reparto desactivado (Ajustes → Locales).
              </p>
            ) : null}
            {own.length === 0 ? (
              <p className="k-muted k-small">
                Sin zonas: este local no reparte a ninguna dirección.
              </p>
            ) : (
              <ul className="k-items k-zones">
                {own.map((zone) => (
                  <li key={zone.id} className={`k-item${zone.activa ? "" : " is-hidden"}`}>
                    <span className="k-item-main">
                      <span className="k-item-name">
                        {editable ? (
                          <button
                            type="button"
                            className="k-item-link"
                            onClick={() => setEditing({ zone, branchId: branch.id })}
                          >
                            {zone.nombre}
                          </button>
                        ) : (
                          <strong>{zone.nombre}</strong>
                        )}
                        {!zone.activa ? (
                          <span className="k-chip k-chip-off">Desactivada</span>
                        ) : null}
                      </span>
                      <span className="k-item-meta k-small">
                        <span>{feeLabel(zone.tarifa, zone.envio_gratis_desde_centimos)}</span>
                        <span className="k-muted">{coverageLabel(zone.cobertura)}</span>
                      </span>
                      <span className="k-small k-muted">
                        {zone.pedido_minimo_centimos > 0
                          ? `Pedido mínimo ${priceInput(zone.pedido_minimo_centimos)} €`
                          : "Sin pedido mínimo"}
                        {zone.minutos_min || zone.minutos_max
                          ? ` · ${[zone.minutos_min, zone.minutos_max].filter(Boolean).join("–")} min`
                          : " · Tiempo del restaurante"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {editing ? (
        <ZoneEditor
          zone={editing.zone}
          branch={branches.find((branch) => branch.id === editing.branchId) ?? null}
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            notify(message);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

const COVERAGE_OPTIONS = [
  { id: "radio", label: "Radio desde el local" },
  { id: "codigo_postal", label: "Código postal" },
  { id: "toda_la_ciudad", label: "Toda la ciudad" },
] as const;

function ZoneEditor(props: {
  readonly zone: DeliveryZone | null;
  readonly branch: ZoneBranch | null;
  readonly branches: readonly ZoneBranch[];
  readonly onClose: () => void;
  readonly onSaved: (message: string) => void;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const zone = props.zone;
  const cov = zone?.cobertura;
  const fee = zone?.tarifa;
  const [nombre, setNombre] = useState(zone?.nombre ?? "");
  const [branchId, setBranchId] = useState(zone?.sucursal_id ?? props.branch?.id ?? 0);
  const [activa, setActiva] = useState(zone?.activa ?? true);
  const [coverage, setCoverage] = useState<(typeof COVERAGE_OPTIONS)[number]["id"]>(
    cov?.tipo ?? (props.branch?.lat !== null ? "radio" : "codigo_postal"),
  );
  const branchOf = (id: number) => props.branches.find((branch) => branch.id === id);
  const [lat, setLat] = useState(
    cov?.tipo === "radio" ? String(cov.lat) : (props.branch?.lat?.toString() ?? ""),
  );
  const [lng, setLng] = useState(
    cov?.tipo === "radio" ? String(cov.lng) : (props.branch?.lng?.toString() ?? ""),
  );
  const [radio, setRadio] = useState(cov?.tipo === "radio" ? String(cov.radio_km) : "3");
  const [postal, setPostal] = useState(cov?.tipo === "codigo_postal" ? cov.codigo_postal : "");
  const [feeKind, setFeeKind] = useState<"fija" | "por_km">(fee?.tipo ?? "fija");
  const [base, setBase] = useState(fee ? priceInput(fee.base_centimos) : "");
  const [perKm, setPerKm] = useState(fee?.tipo === "por_km" ? priceInput(fee.por_km_centimos) : "");
  const [max, setMax] = useState(
    fee?.tipo === "por_km" && fee.maxima_centimos !== null ? priceInput(fee.maxima_centimos) : "",
  );
  const [minimo, setMinimo] = useState(zone ? priceInput(zone.pedido_minimo_centimos) : "0");
  const [gratis, setGratis] = useState(
    zone?.envio_gratis_desde_centimos ? priceInput(zone.envio_gratis_desde_centimos) : "",
  );
  const [minMin, setMinMin] = useState(zone?.minutos_min?.toString() ?? "");
  const [minMax, setMinMax] = useState(zone?.minutos_max?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function body(): { ok: true; value: unknown } | { ok: false; message: string } {
    if (!nombre.trim()) return { ok: false, message: "Ponle nombre a la zona." };
    let cobertura: unknown;
    if (coverage === "radio") {
      const latValue = Number(lat.replace(",", "."));
      const lngValue = Number(lng.replace(",", "."));
      const radius = Number(radio.replace(",", "."));
      if (!lat.trim() || !lng.trim() || Number.isNaN(latValue) || Number.isNaN(lngValue)) {
        return {
          ok: false,
          message: "Indica el centro (latitud y longitud) o usa la ubicación del local.",
        };
      }
      if (!(radius > 0 && radius <= 100))
        return { ok: false, message: "El radio va de 0,1 a 100 km." };
      cobertura = { tipo: "radio", lat: latValue, lng: lngValue, radio_km: radius };
    } else if (coverage === "codigo_postal") {
      if (!/^[0-9A-Za-z -]{3,10}$/.test(postal.trim()))
        return { ok: false, message: "Código postal no válido." };
      cobertura = { tipo: "codigo_postal", codigo_postal: postal.trim() };
    } else {
      cobertura = { tipo: "toda_la_ciudad" };
    }
    const baseCents = parsePrice(base || "0");
    if (baseCents === null) return { ok: false, message: "Tarifa no válida. Ejemplo: 2,50" };
    let tarifa: unknown = { tipo: "fija", base_centimos: baseCents };
    if (feeKind === "por_km") {
      const km = parsePrice(perKm);
      const cap = max.trim() ? parsePrice(max) : null;
      if (km === null || (max.trim() && cap === null))
        return { ok: false, message: "Revisa el precio por km y el tope." };
      tarifa = {
        tipo: "por_km",
        base_centimos: baseCents,
        por_km_centimos: km,
        maxima_centimos: cap,
      };
    }
    const minimum = parsePrice(minimo || "0");
    const free = gratis.trim() ? parsePrice(gratis) : null;
    if (minimum === null || (gratis.trim() && (free === null || free === 0))) {
      return { ok: false, message: "Revisa el pedido mínimo y el envío gratis." };
    }
    const tMin = parseMinutes(minMin);
    const tMax = parseMinutes(minMax);
    if (tMin === undefined || tMax === undefined)
      return { ok: false, message: "Los tiempos van en minutos." };
    return {
      ok: true,
      value: {
        nombre: nombre.trim(),
        sucursal_id: branchId,
        activa,
        cobertura,
        tarifa,
        pedido_minimo_centimos: minimum,
        envio_gratis_desde_centimos: free,
        minutos_min: tMin,
        minutos_max: tMax,
      },
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const built = body();
    if (!built.ok) return setError(built.message);
    setBusy(true);
    const result = zone
      ? await api.zoneChange(slug, "PUT", `/${zone.id}`, built.value)
      : await api.zoneChange(slug, "POST", "", built.value);
    setBusy(false);
    if (!result.ok) {
      return setError(zoneErrorMessage((result.body as { reason?: string } | null)?.reason));
    }
    props.onSaved(zone ? "Zona guardada" : "Zona creada");
  }

  async function remove() {
    if (!zone) return;
    setBusy(true);
    const result = await api.zoneChange(slug, "DELETE", `/${zone.id}`);
    setBusy(false);
    if (!result.ok) return setError("No se pudo borrar la zona.");
    props.onSaved("Zona borrada");
  }

  const branch = branchOf(branchId);

  return (
    <Modal title={zone ? "Editar zona" : "Nueva zona de reparto"} onClose={props.onClose} wide>
      <form onSubmit={save} noValidate className="k-editor">
        {error ? (
          <p className="k-alert" role="alert">
            {error}
          </p>
        ) : null}
        <div className="k-form-grid">
          <label className="k-field">
            <span>Nombre</span>
            <input
              value={nombre}
              maxLength={100}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej.: Arrecife centro"
            />
          </label>
          {props.branches.length > 1 ? (
            <label className="k-field">
              <span>Reparte desde</span>
              <select
                className="k-input"
                value={branchId}
                onChange={(e) => setBranchId(Number(e.target.value))}
              >
                {props.branches.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <Toggle checked={activa} onChange={setActiva} label="Zona activa" />

        <fieldset className="k-fieldset">
          <legend className="k-field-label">Dónde</legend>
          <div className="k-segment k-segment-sm">
            {COVERAGE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={coverage === option.id ? "is-on" : ""}
                aria-pressed={coverage === option.id}
                onClick={() => setCoverage(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {coverage === "radio" ? (
            <>
              <div className="k-form-grid k-form-grid-3">
                <label className="k-field">
                  <span>Radio (km)</span>
                  <input
                    value={radio}
                    inputMode="decimal"
                    onChange={(e) => setRadio(e.target.value)}
                  />
                </label>
                <label className="k-field">
                  <span>Latitud del centro</span>
                  <input value={lat} inputMode="decimal" onChange={(e) => setLat(e.target.value)} />
                </label>
                <label className="k-field">
                  <span>Longitud del centro</span>
                  <input value={lng} inputMode="decimal" onChange={(e) => setLng(e.target.value)} />
                </label>
              </div>
              {branch?.lat !== null && branch?.lat !== undefined ? (
                <button
                  type="button"
                  className="k-link k-small k-link-inline"
                  onClick={() => {
                    setLat(String(branch.lat));
                    setLng(String(branch.lng));
                  }}
                >
                  Usar la ubicación de {branch.nombre}
                </button>
              ) : (
                <p className="k-small k-muted">
                  Este local no tiene coordenadas: añádelas en Ajustes → Locales o escribe el
                  centro.
                </p>
              )}
            </>
          ) : null}
          {coverage === "codigo_postal" ? (
            <label className="k-field k-field-narrow">
              <span>Código postal</span>
              <input
                value={postal}
                maxLength={10}
                onChange={(e) => setPostal(e.target.value)}
                placeholder="35500"
              />
            </label>
          ) : null}
          {coverage === "toda_la_ciudad" ? (
            <p className="k-small k-muted">Cubre cualquier dirección. Útil como tarifa única.</p>
          ) : null}
        </fieldset>

        <fieldset className="k-fieldset">
          <legend className="k-field-label">Cuánto cuesta</legend>
          <div className="k-segment k-segment-sm">
            <button
              type="button"
              className={feeKind === "fija" ? "is-on" : ""}
              aria-pressed={feeKind === "fija"}
              onClick={() => setFeeKind("fija")}
            >
              Tarifa fija
            </button>
            <button
              type="button"
              className={feeKind === "por_km" ? "is-on" : ""}
              aria-pressed={feeKind === "por_km"}
              onClick={() => setFeeKind("por_km")}
            >
              Por distancia
            </button>
          </div>
          <div className="k-form-grid k-form-grid-3">
            <label className="k-field k-price-input">
              <span>{feeKind === "fija" ? "Envío" : "Base"}</span>
              <input
                value={base}
                inputMode="decimal"
                placeholder="0,00"
                onChange={(e) => setBase(e.target.value)}
              />
              <span aria-hidden="true">€</span>
            </label>
            {feeKind === "por_km" ? (
              <>
                <label className="k-field k-price-input">
                  <span>Por km</span>
                  <input
                    value={perKm}
                    inputMode="decimal"
                    placeholder="0,50"
                    onChange={(e) => setPerKm(e.target.value)}
                  />
                  <span aria-hidden="true">€</span>
                </label>
                <label className="k-field k-price-input">
                  <span>
                    Tope <span className="k-muted k-optional">(opcional)</span>
                  </span>
                  <input
                    value={max}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) => setMax(e.target.value)}
                  />
                  <span aria-hidden="true">€</span>
                </label>
              </>
            ) : null}
          </div>
          {feeKind === "por_km" ? (
            <p className="k-small k-muted">
              Distancia en línea recta desde el local hasta la dirección del cliente.
            </p>
          ) : null}
          <div className="k-form-grid">
            <label className="k-field k-price-input">
              <span>Pedido mínimo</span>
              <input
                value={minimo}
                inputMode="decimal"
                onChange={(e) => setMinimo(e.target.value)}
              />
              <span aria-hidden="true">€</span>
            </label>
            <label className="k-field k-price-input">
              <span>
                Envío gratis desde <span className="k-muted k-optional">(opcional)</span>
              </span>
              <input
                value={gratis}
                inputMode="decimal"
                placeholder="—"
                onChange={(e) => setGratis(e.target.value)}
              />
              <span aria-hidden="true">€</span>
            </label>
          </div>
        </fieldset>

        <fieldset className="k-fieldset">
          <legend className="k-field-label">Tiempo de entrega</legend>
          <div className="k-form-grid">
            <label className="k-field">
              <span>Mínimo (min)</span>
              <input
                value={minMin}
                inputMode="numeric"
                placeholder="30"
                onChange={(e) => setMinMin(e.target.value)}
              />
            </label>
            <label className="k-field">
              <span>Máximo (min)</span>
              <input
                value={minMax}
                inputMode="numeric"
                placeholder="45"
                onChange={(e) => setMinMax(e.target.value)}
              />
            </label>
          </div>
          <p className="k-small k-muted">Vacío: se usa el tiempo de reparto del restaurante.</p>
        </fieldset>

        <div className="k-dialog-actions k-dialog-actions-split">
          {zone ? (
            confirmDelete ? (
              <span className="k-confirm">
                <span className="k-small">¿Borrar la zona?</span>
                <button
                  type="button"
                  className="k-btn k-btn-sm k-btn-danger"
                  disabled={busy}
                  onClick={remove}
                >
                  Sí, borrar
                </button>
                <button
                  type="button"
                  className="k-btn k-btn-sm k-btn-secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="k-link k-link-danger"
                onClick={() => setConfirmDelete(true)}
              >
                Borrar zona
              </button>
            )
          ) : (
            <span />
          )}
          <span className="k-dialog-actions">
            <button type="button" className="k-btn k-btn-secondary" onClick={props.onClose}>
              Cancelar
            </button>
            <button type="submit" className="k-btn k-btn-go" disabled={busy}>
              Guardar
            </button>
          </span>
        </div>
      </form>
    </Modal>
  );
}
