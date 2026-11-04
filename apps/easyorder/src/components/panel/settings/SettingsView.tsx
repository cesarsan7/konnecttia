"use client";

import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from "react";
import type { ApiResult } from "@/lib/api";
import { paymentLabel } from "@/lib/checkout";
import { describePanelError } from "@/lib/panel/api";
import { parsePrice, priceInput } from "@/lib/panel/menu";
import {
  type BankDetails,
  type BranchSettings,
  copyDayToAll,
  type Day,
  dayLabel,
  type Holiday,
  holidayDate,
  type OpenMode,
  PAYMENT_HINT,
  parseMinuteList,
  parseMinutes,
  type RestaurantSettings,
  type Settings,
  settingsErrorMessage,
} from "@/lib/panel/settings";
import { BusyModeHelp } from "../BusyModeControl";
import { Toggle } from "../menu/Editors";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";
import { DeliverySection } from "./DeliverySection";
import { PeakTimes } from "./PeakTimes";

const TAB = {
  General: "general",
  Orders: "pedidos",
  Schedule: "horario",
  Delivery: "reparto",
  Branches: "locales",
} as const;
type Tab = (typeof TAB)[keyof typeof TAB];

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: Settings }
  | { readonly kind: "error"; readonly message: string };

type Toast = { readonly id: number; readonly text: string; readonly tone: "ok" | "error" };

type Saver = (run: () => Promise<ApiResult<unknown>>, done: string) => Promise<string | null>;

function failureText(result: ApiResult<unknown>): string {
  if (result.ok) return "";
  const body = result.body as { reason?: string; field?: string } | null;
  if (result.status === 400 || result.status === 409 || body?.reason) {
    return settingsErrorMessage(body?.reason, body?.field);
  }
  return describePanelError(result.status, result.body);
}

export function SettingsView() {
  const { api } = usePanel();
  const { slug, access, can } = useAccess();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>(TAB.General);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const allowed = can(PERMISSION.SettingsView);
  const canEdit = can(PERMISSION.SettingsUpdate);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    const result = await api.settings(slug);
    setState(
      result.ok
        ? { kind: "ready", data: result.data }
        : { kind: "error", message: describePanelError(result.status, result.body) },
    );
  }, [api, slug]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  /** Guarda, avisa y recarga. Devuelve el mensaje de error (para mostrarlo junto al formulario). */
  const save: Saver = async (run, done) => {
    const result = await run();
    if (!result.ok) {
      const message = failureText(result);
      toast(message, "error");
      return message;
    }
    toast(done);
    await load();
    return null;
  };

  const header = (
    <header className="k-page-head">
      <div>
        <p className="k-eyebrow">{access.restaurante.nombre}</p>
        <h1 className="k-heading">Ajustes</h1>
      </div>
    </header>
  );

  if (!allowed) {
    return (
      <div className="k-page">
        {header}
        <div className="k-card">
          <p>Tu usuario no tiene permiso para ver los ajustes.</p>
        </div>
      </div>
    );
  }
  if (state.kind === "loading") {
    return (
      <div className="k-page" aria-busy="true">
        {header}
        <div className="k-skeleton k-skeleton-tall" />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="k-page">
        {header}
        <div className="k-card">
          <p className="k-alert" role="alert">
            {state.message}
          </p>
          <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const data = state.data;
  const full = data.edicion_completa;
  const editRestaurant = canEdit && full;
  const canDelivery = can(PERMISSION.DeliveryView);
  const tabs: { id: Tab; label: string }[] = full
    ? [
        { id: TAB.General, label: "General" },
        { id: TAB.Orders, label: "Pedidos y pago" },
        { id: TAB.Schedule, label: "Horario" },
        ...(canDelivery ? [{ id: TAB.Delivery, label: "Reparto" }] : []),
        { id: TAB.Branches, label: data.locales.length > 1 ? "Locales" : "Local" },
      ]
    : [
        { id: TAB.Branches, label: "Mis locales" },
        ...(canDelivery ? [{ id: TAB.Delivery, label: "Reparto" }] : []),
      ];
  const current = tabs.some((item) => item.id === tab) ? tab : TAB.Branches;
  const patch = (body: Partial<Record<keyof RestaurantSettings, unknown>>) => () =>
    api.settingsChange(slug, "PATCH", "/restaurante", body);

  return (
    <div className="k-page">
      {header}
      {!full ? (
        <p className="k-card k-note">
          Tu usuario opera solo algunos locales: aquí ves y cambias sus datos, horario y festivos.
          Los ajustes generales del restaurante los cambia el propietario.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="k-card k-note">Puedes consultar los ajustes, pero no cambiarlos.</p>
      ) : null}

      {tabs.length > 1 ? (
        <fieldset className="k-segment" aria-label="Sección de ajustes">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={current === item.id ? "is-on" : ""}
              aria-pressed={current === item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </fieldset>
      ) : null}

      {current === TAB.General ? (
        <GeneralSection data={data} editable={editRestaurant} save={save} patch={patch} />
      ) : null}
      {current === TAB.Orders ? (
        <OrdersSection data={data} editable={editRestaurant} save={save} patch={patch} />
      ) : null}
      {current === TAB.Schedule ? (
        <>
          <WeekEditor
            title="Horario del restaurante"
            lead={`Hora de ${data.restaurante.zona_horaria ?? "tu zona"}. Si el cierre es antes que la apertura, el turno termina después de medianoche.`}
            week={data.horario}
            editable={editRestaurant}
            onSave={(dias) =>
              save(() => api.settingsChange(slug, "PUT", "/horario", { dias }), "Horario guardado")
            }
          />
          <HolidaysSection data={data} editable={canEdit} save={save} />
          <PeakTimes branches={data.locales} fullScope={full} editable={canEdit} notify={toast} />
        </>
      ) : null}
      {current === TAB.Delivery ? (
        <DeliverySection editable={can(PERMISSION.DeliveryManage)} notify={toast} />
      ) : null}
      {current === TAB.Branches ? (
        <>
          {data.locales.map((branch) => (
            <BranchSection
              key={branch.id}
              branch={branch}
              restaurantWeek={data.horario}
              editable={canEdit}
              save={save}
            />
          ))}
          {!full ? (
            <>
              <HolidaysSection data={data} editable={canEdit} save={save} />
              <PeakTimes
                branches={data.locales}
                fullScope={false}
                editable={canEdit}
                notify={toast}
              />
            </>
          ) : null}
        </>
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

// ------------------------------------------------------------------------------- piezas

function Section({
  title,
  lead,
  children,
}: {
  readonly title: string;
  readonly lead?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="k-card k-settings">
      <header className="k-settings-head">
        <h2 className="k-title">{title}</h2>
        {lead ? <p className="k-muted k-small">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

function SaveBar({
  busy,
  editable,
  error,
  label = "Guardar cambios",
}: {
  readonly busy: boolean;
  readonly editable: boolean;
  readonly error: string | null;
  readonly label?: string;
}) {
  if (!editable) return null;
  return (
    <div className="k-save-bar">
      {error ? (
        <p className="k-alert" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="k-btn k-btn-go" disabled={busy}>
        {busy ? "Guardando…" : label}
      </button>
    </div>
  );
}

function useSubmit(action: () => Promise<string | null>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(await action());
    setBusy(false);
  };
  return { busy, error, setError, submit };
}

function TextField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
  readonly max: number;
  readonly optional?: boolean;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly inputMode?: "tel" | "numeric" | "decimal" | "text";
  readonly hint?: string;
}) {
  const id = useId();
  return (
    <div className="k-field">
      <label htmlFor={id}>
        {props.label}
        {props.optional ? <span className="k-muted k-optional"> (opcional)</span> : null}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          className="k-input"
          rows={3}
          value={props.value}
          maxLength={props.max}
          disabled={props.disabled}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          value={props.value}
          maxLength={props.max}
          disabled={props.disabled}
          placeholder={props.placeholder}
          inputMode={props.inputMode}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.hint ? <span className="k-small k-muted k-hint-text">{props.hint}</span> : null}
    </div>
  );
}

const OPEN_MODES: { id: OpenMode; label: string }[] = [
  { id: "auto", label: "Según horario" },
  { id: "abierto", label: "Abierto ahora" },
  { id: "cerrado", label: "Cerrado ahora" },
];

function OpenModePicker(props: {
  readonly value: OpenMode;
  readonly onChange: (value: OpenMode) => void;
  readonly disabled: boolean;
  readonly label: string;
}) {
  return (
    <fieldset className="k-fieldset k-fieldset-flat">
      <legend className="k-field-label">{props.label}</legend>
      <div className="k-segment k-segment-sm">
        {OPEN_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            disabled={props.disabled}
            className={props.value === mode.id ? "is-on" : ""}
            aria-pressed={props.value === mode.id}
            onClick={() => props.onChange(mode.id)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const nullIfEmpty = (value: string) => (value.trim() ? value.trim() : null);

// -------------------------------------------------------------------------------- general

type SectionProps = {
  readonly data: Settings;
  readonly editable: boolean;
  readonly save: Saver;
  readonly patch: (
    body: Partial<Record<keyof RestaurantSettings, unknown>>,
  ) => () => Promise<ApiResult<unknown>>;
};

function GeneralSection({ data, editable, save, patch }: SectionProps) {
  const r = data.restaurante;
  const [nombre, setNombre] = useState(r.nombre);
  const [telefono, setTelefono] = useState(r.telefono ?? "");
  const [direccion, setDireccion] = useState(r.direccion ?? "");
  const [eslogan, setEslogan] = useState(r.eslogan ?? "");
  const [descripcion, setDescripcion] = useState(r.descripcion ?? "");
  const [apertura, setApertura] = useState<OpenMode>(r.apertura_manual);

  const form = useSubmit(async () => {
    if (!nombre.trim()) return "El restaurante necesita un nombre.";
    return save(
      patch({
        nombre: nombre.trim(),
        telefono: nullIfEmpty(telefono),
        direccion: nullIfEmpty(direccion),
        eslogan: nullIfEmpty(eslogan),
        descripcion: nullIfEmpty(descripcion),
        apertura_manual: apertura,
      }),
      "Datos guardados",
    );
  });

  return (
    <form onSubmit={form.submit} noValidate className="k-settings-stack">
      <Section
        title="Apertura"
        lead="Para abrir o cerrar al momento sin tocar el horario (un imprevisto, inventario…)."
      >
        <OpenModePicker
          label="Estado"
          value={apertura}
          onChange={setApertura}
          disabled={!editable}
        />
        {apertura !== "auto" ? (
          <p className="k-small k-warn">
            {apertura === "cerrado"
              ? "La web y el agente no aceptarán pedidos hasta que vuelvas a «Según horario»."
              : "Se aceptan pedidos aunque el horario diga cerrado. Recuerda volver a «Según horario»."}
          </p>
        ) : null}
      </Section>
      <Section title="Datos del restaurante" lead="Se muestran en la carta online.">
        <div className="k-form-grid">
          <TextField
            label="Nombre"
            value={nombre}
            onChange={setNombre}
            disabled={!editable}
            max={120}
          />
          <TextField
            label="Teléfono"
            value={telefono}
            onChange={setTelefono}
            disabled={!editable}
            max={30}
            optional
            inputMode="tel"
          />
          <TextField
            label="Dirección"
            value={direccion}
            onChange={setDireccion}
            disabled={!editable}
            max={200}
            optional
          />
          <TextField
            label="Eslogan"
            value={eslogan}
            onChange={setEslogan}
            disabled={!editable}
            max={120}
            optional
            placeholder="Ej.: Sabor colombiano en Arrecife"
          />
        </div>
        <TextField
          label="Descripción"
          value={descripcion}
          onChange={setDescripcion}
          disabled={!editable}
          max={500}
          optional
          multiline
        />
      </Section>
      <SaveBar busy={form.busy} editable={editable} error={form.error} />
    </form>
  );
}

// --------------------------------------------------------------------------- pedidos y pago

function OrdersSection({ data, editable, save, patch }: SectionProps) {
  const r = data.restaurante;
  const bank: BankDetails = r.datos_bancarios ?? {};
  const [recogida, setRecogida] = useState(r.recogida);
  const [reparto, setReparto] = useState(r.reparto);
  const [metodos, setMetodos] = useState<string[]>([...r.metodos_pago]);
  const [titular, setTitular] = useState(bank.titular ?? "");
  const [banco, setBanco] = useState(bank.banco ?? "");
  const [iban, setIban] = useState(bank.iban ?? "");
  const [concepto, setConcepto] = useState(bank.concepto ?? "");
  const [bizum, setBizum] = useState(bank.bizum ?? "");
  const [pickup, setPickup] = useState(r.recogida_minutos?.toString() ?? "");
  const [deliveryMin, setDeliveryMin] = useState(r.reparto_minutos_min?.toString() ?? "");
  const [deliveryMax, setDeliveryMax] = useState(r.reparto_minutos_max?.toString() ?? "");
  const [busyOptions, setBusyOptions] = useState(r.modo_ocupado_opciones.join(", "));
  const [busyDuration, setBusyDuration] = useState(
    r.modo_ocupado_duracion_minutos?.toString() ?? "",
  );
  const [surcharges, setSurcharges] = useState<SurchargeDraft[]>(
    r.suplementos.map((rule, index) => ({
      key: `s${index}`,
      concepto: rule.concepto,
      por_debajo: priceInput(rule.por_debajo_centimos),
      importe: priceInput(rule.importe_centimos),
      aplica_a: rule.aplica_a,
    })),
  );
  const needsBank = metodos.includes("transferencia");
  const needsBizum = metodos.includes("bizum");

  const form = useSubmit(async () => {
    if (!recogida && !reparto) return settingsErrorMessage("no_service");
    if (metodos.length === 0) return settingsErrorMessage("no_payment_method");
    const times = [pickup, deliveryMin, deliveryMax].map((value) => parseMinutes(value));
    if (times.some((value) => value === undefined)) return "Los tiempos van en minutos (1 a 600).";
    const options = parseMinuteList(busyOptions);
    if (options === undefined)
      return "Modo ocupado: hasta 6 valores en minutos, separados por comas.";
    const duration = parseMinutes(busyDuration, 720);
    if (duration === undefined || (options.length > 0 && (duration === null || duration < 5))) {
      return "Indica cuánto dura el modo ocupado (5 a 720 minutos).";
    }
    const suplementos = [];
    for (const draft of surcharges) {
      const below = parsePrice(draft.por_debajo);
      const amount = parsePrice(draft.importe);
      if (!draft.concepto.trim() || !below || !amount) {
        return "Cada suplemento necesita concepto, importe mínimo del pedido y suplemento (mayores que 0).";
      }
      suplementos.push({
        concepto: draft.concepto.trim(),
        por_debajo_centimos: below,
        importe_centimos: amount,
        aplica_a: draft.aplica_a,
      });
    }
    const details = {
      titular: nullIfEmpty(titular),
      banco: nullIfEmpty(banco),
      iban: nullIfEmpty(iban),
      concepto: nullIfEmpty(concepto),
      bizum: nullIfEmpty(bizum),
    };
    const hasDetails = Object.values(details).some(Boolean);
    return save(
      patch({
        recogida,
        reparto,
        metodos_pago: metodos,
        datos_bancarios: hasDetails ? details : null,
        recogida_minutos: times[0],
        reparto_minutos_min: times[1],
        reparto_minutos_max: times[2],
        modo_ocupado_opciones: options,
        modo_ocupado_duracion_minutos: options.length > 0 ? duration : null,
        suplementos,
      }),
      "Ajustes de pedidos guardados",
    );
  });

  return (
    <form onSubmit={form.submit} noValidate className="k-settings-stack">
      <Section title="Servicios" lead="Cómo pueden recibir el pedido tus clientes.">
        <div className="k-toggle-list">
          <Toggle
            checked={recogida}
            onChange={setRecogida}
            disabled={!editable}
            label="Recogida en el local"
          />
          <Toggle
            checked={reparto}
            onChange={setReparto}
            disabled={!editable}
            label="Reparto a domicilio"
          />
        </div>
        {reparto ? (
          <p className="k-small k-muted">
            Las zonas, tarifas y pedido mínimo están en la pestaña «Reparto».
          </p>
        ) : null}
      </Section>

      <Section title="Métodos de pago" lead="Lo que el cliente puede elegir al pedir.">
        <div className="k-chips-pick">
          {data.metodos_disponibles.map((method) => {
            const on = metodos.includes(method);
            return (
              <label key={method} className={`k-allergen k-pay-option${on ? " is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable}
                  onChange={(event) =>
                    setMetodos((list) =>
                      event.target.checked
                        ? data.metodos_disponibles.filter((m) => m === method || list.includes(m))
                        : list.filter((m) => m !== method),
                    )
                  }
                />
                <span>
                  {paymentLabel(method)}
                  <span className="k-small k-muted k-block">{PAYMENT_HINT[method]}</span>
                </span>
              </label>
            );
          })}
        </div>
        {needsBank || needsBizum ? (
          <div className="k-subsection">
            <h3 className="k-subtitle">Datos para el pago</h3>
            <p className="k-small k-muted">
              El cliente los ve en el seguimiento del pedido mientras el cobro está pendiente.
            </p>
            <div className="k-form-grid">
              {needsBank ? (
                <>
                  <TextField
                    label="Titular"
                    value={titular}
                    onChange={setTitular}
                    disabled={!editable}
                    max={120}
                  />
                  <TextField
                    label="IBAN"
                    value={iban}
                    onChange={setIban}
                    disabled={!editable}
                    max={42}
                    placeholder="ES00 0000 0000 0000 0000 0000"
                  />
                  <TextField
                    label="Banco"
                    value={banco}
                    onChange={setBanco}
                    disabled={!editable}
                    max={120}
                    optional
                  />
                  <TextField
                    label="Concepto"
                    value={concepto}
                    onChange={setConcepto}
                    disabled={!editable}
                    max={120}
                    optional
                    placeholder="Ej.: tu nombre y el código del pedido"
                  />
                </>
              ) : null}
              {needsBizum ? (
                <TextField
                  label="Teléfono de Bizum"
                  value={bizum}
                  onChange={setBizum}
                  disabled={!editable}
                  max={20}
                  inputMode="tel"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Section>

      <Section
        title="Tiempos de preparación"
        lead="Base que ve el cliente. Las zonas de reparto pueden tener el suyo; la hora punta y el modo ocupado lo amplían."
      >
        <div className="k-form-grid k-form-grid-3">
          <TextField
            label="Recogida (min)"
            value={pickup}
            onChange={setPickup}
            disabled={!editable}
            max={3}
            inputMode="numeric"
            optional
          />
          <TextField
            label="Reparto mínimo (min)"
            value={deliveryMin}
            onChange={setDeliveryMin}
            disabled={!editable}
            max={3}
            inputMode="numeric"
            optional
          />
          <TextField
            label="Reparto máximo (min)"
            value={deliveryMax}
            onChange={setDeliveryMax}
            disabled={!editable}
            max={3}
            inputMode="numeric"
            optional
          />
        </div>
        <p className="k-small k-muted">Sin tiempo, el cliente verá «a confirmar».</p>
      </Section>

      <Section
        title="Modo ocupado"
        lead="Botón del tablero de pedidos que suma minutos al tiempo estimado durante un rato."
      >
        <BusyModeHelp duration={Number(busyDuration) || null} />
        <div className="k-form-grid">
          <TextField
            label="Opciones (minutos)"
            value={busyOptions}
            onChange={setBusyOptions}
            disabled={!editable}
            max={40}
            placeholder="10, 20, 30"
            hint="Sepáralas con comas. Vacío: el tablero no muestra el botón."
          />
          <TextField
            label="Duración (min)"
            value={busyDuration}
            onChange={setBusyDuration}
            disabled={!editable}
            max={3}
            inputMode="numeric"
            placeholder="60"
          />
        </div>
      </Section>

      <Section
        title="Suplementos"
        lead="Cargo que se suma a los pedidos pequeños, por ejemplo envases: +1 € si el pedido no llega a 25 €."
      >
        {surcharges.length === 0 ? <p className="k-muted k-small">Sin suplementos.</p> : null}
        <ul className="k-variant-list">
          {surcharges.map((draft) => {
            const update = (change: Partial<SurchargeDraft>) =>
              setSurcharges((list) =>
                list.map((item) => (item.key === draft.key ? { ...item, ...change } : item)),
              );
            return (
              <li key={draft.key} className="k-surcharge">
                <label className="k-field">
                  <span className="k-small">Concepto</span>
                  <input
                    value={draft.concepto}
                    maxLength={40}
                    disabled={!editable}
                    placeholder="Envases"
                    onChange={(event) => update({ concepto: event.target.value })}
                  />
                </label>
                <label className="k-field k-price-input">
                  <span className="k-small">Si el pedido no llega a</span>
                  <input
                    value={draft.por_debajo}
                    inputMode="decimal"
                    disabled={!editable}
                    placeholder="25,00"
                    onChange={(event) => update({ por_debajo: event.target.value })}
                  />
                  <span aria-hidden="true">€</span>
                </label>
                <label className="k-field k-price-input">
                  <span className="k-small">Suplemento</span>
                  <input
                    value={draft.importe}
                    inputMode="decimal"
                    disabled={!editable}
                    placeholder="1,00"
                    onChange={(event) => update({ importe: event.target.value })}
                  />
                  <span aria-hidden="true">€</span>
                </label>
                <label className="k-field">
                  <span className="k-small">Se aplica a</span>
                  <select
                    className="k-input"
                    value={draft.aplica_a}
                    disabled={!editable}
                    onChange={(event) =>
                      update({ aplica_a: event.target.value as SurchargeDraft["aplica_a"] })
                    }
                  >
                    <option value="ambos">Recogida y reparto</option>
                    <option value="recogida">Solo recogida</option>
                    <option value="reparto">Solo reparto</option>
                  </select>
                </label>
                {editable ? (
                  <button
                    type="button"
                    className="k-link k-small k-link-danger"
                    onClick={() =>
                      setSurcharges((list) => list.filter((item) => item.key !== draft.key))
                    }
                  >
                    Quitar
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {editable && surcharges.length < 5 ? (
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            onClick={() =>
              setSurcharges((list) => [
                ...list,
                {
                  key: `n${Date.now()}`,
                  concepto: "",
                  por_debajo: "",
                  importe: "",
                  aplica_a: "ambos",
                },
              ])
            }
          >
            Añadir suplemento
          </button>
        ) : null}
      </Section>
      <SaveBar busy={form.busy} editable={editable} error={form.error} />
    </form>
  );
}

type SurchargeDraft = {
  readonly key: string;
  readonly concepto: string;
  readonly por_debajo: string;
  readonly importe: string;
  readonly aplica_a: "ambos" | "recogida" | "reparto";
};

// -------------------------------------------------------------------------------- horario

function WeekEditor(props: {
  readonly title: string;
  readonly lead?: string;
  readonly week: readonly Day[];
  readonly editable: boolean;
  readonly onSave: (dias: Day[]) => Promise<string | null>;
  readonly extra?: ReactNode;
}) {
  const [week, setWeek] = useState<Day[]>(props.week.map((day) => ({ ...day })));
  const form = useSubmit(() => props.onSave(week));
  const update = (dia: string, change: Partial<Day>) =>
    setWeek((list) => list.map((day) => (day.dia === dia ? { ...day, ...change } : day)));

  return (
    <form onSubmit={form.submit} noValidate>
      <Section title={props.title} lead={props.lead}>
        {props.extra}
        <ul className="k-week">
          {week.map((day) => {
            const second = day.apertura_2 !== null || day.cierre_2 !== null;
            return (
              <li key={day.dia} className={`k-weekday${day.disponible ? "" : " is-closed"}`}>
                <span className="k-weekday-name">
                  <Toggle
                    compact
                    checked={day.disponible}
                    disabled={!props.editable}
                    label={`${day.dia} abierto`}
                    onChange={(open) =>
                      update(
                        day.dia,
                        open && !day.apertura_1
                          ? { disponible: true, apertura_1: "12:00", cierre_1: "16:00" }
                          : { disponible: open },
                      )
                    }
                  />
                  <strong>{day.dia}</strong>
                </span>
                {day.disponible ? (
                  <span className="k-shifts">
                    <Shift
                      day={day.dia}
                      index={1}
                      open={day.apertura_1}
                      close={day.cierre_1}
                      disabled={!props.editable}
                      onChange={(open, close) =>
                        update(day.dia, { apertura_1: open, cierre_1: close })
                      }
                    />
                    {second ? (
                      <Shift
                        day={day.dia}
                        index={2}
                        open={day.apertura_2}
                        close={day.cierre_2}
                        disabled={!props.editable}
                        onChange={(open, close) =>
                          update(day.dia, { apertura_2: open, cierre_2: close })
                        }
                        onRemove={() => update(day.dia, { apertura_2: null, cierre_2: null })}
                      />
                    ) : props.editable ? (
                      <button
                        type="button"
                        className="k-link k-small"
                        onClick={() => update(day.dia, { apertura_2: "20:00", cierre_2: "23:30" })}
                      >
                        + Segundo turno
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <span className="k-muted">Cerrado</span>
                )}
                {props.editable && day.disponible ? (
                  <button
                    type="button"
                    className="k-link k-small k-copy-day"
                    onClick={() => setWeek((list) => copyDayToAll(list, day.dia))}
                  >
                    Copiar a todos
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
        <SaveBar
          busy={form.busy}
          editable={props.editable}
          error={form.error}
          label="Guardar horario"
        />
      </Section>
    </form>
  );
}

function Shift(props: {
  readonly day: string;
  readonly index: number;
  readonly open: string | null;
  readonly close: string | null;
  readonly disabled: boolean;
  readonly onChange: (open: string | null, close: string | null) => void;
  readonly onRemove?: () => void;
}) {
  return (
    <span className="k-shift">
      <input
        type="time"
        aria-label={`${props.day}, turno ${props.index}, apertura`}
        value={props.open ?? ""}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value || null, props.close)}
      />
      <span aria-hidden="true">–</span>
      <input
        type="time"
        aria-label={`${props.day}, turno ${props.index}, cierre`}
        value={props.close ?? ""}
        disabled={props.disabled}
        onChange={(event) => props.onChange(props.open, event.target.value || null)}
      />
      {props.onRemove && !props.disabled ? (
        <button
          type="button"
          className="k-icon-btn k-icon-btn-sm"
          aria-label={`Quitar el turno ${props.index} del ${props.day}`}
          onClick={props.onRemove}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

// ------------------------------------------------------------------------------- festivos

function HolidaysSection({
  data,
  editable,
  save,
}: {
  readonly data: Settings;
  readonly editable: boolean;
  readonly save: Saver;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [cerrado, setCerrado] = useState(false);
  const branchOptions = data.locales.length > 1 || !data.edicion_completa ? data.locales : [];
  const [local, setLocal] = useState<number | null>(
    data.edicion_completa ? null : (data.locales[0]?.id ?? null),
  );
  const names = new Map(data.locales.map((branch) => [branch.id, branch.nombre]));

  const form = useSubmit(async () => {
    if (!fecha) return "Elige la fecha del festivo.";
    const error = await save(
      () =>
        api.settingsChange(slug, "POST", "/festivos", {
          fecha,
          nombre: nullIfEmpty(nombre),
          cerrado,
          sucursal_id: local,
        }),
      "Festivo añadido",
    );
    if (!error) {
      setFecha("");
      setNombre("");
      setCerrado(false);
    }
    return error;
  });

  return (
    <Section
      title="Festivos"
      lead="Un festivo usa el horario del domingo, salvo que lo marques como cerrado todo el día."
    >
      {data.festivos.length === 0 ? (
        <p className="k-muted k-small">No hay festivos próximos.</p>
      ) : (
        <ul className="k-holidays">
          {data.festivos.map((holiday: Holiday) => (
            <li key={holiday.id}>
              <span>
                <strong className="k-capitalize">{holidayDate(holiday.fecha)}</strong>
                {holiday.nombre ? <span> · {holiday.nombre}</span> : null}
              </span>
              <span className="k-holiday-tags">
                <span className={`k-chip${holiday.cerrado ? " k-chip-soldout" : ""}`}>
                  {holiday.cerrado ? "Cerrado" : "Horario de domingo"}
                </span>
                {holiday.sucursal_id !== null ? (
                  <span className="k-chip">{names.get(holiday.sucursal_id) ?? "Local"}</span>
                ) : data.locales.length > 1 ? (
                  <span className="k-chip">Todos los locales</span>
                ) : null}
                {editable && (holiday.sucursal_id !== null || data.edicion_completa) ? (
                  <button
                    type="button"
                    className="k-link k-small k-link-danger"
                    onClick={() =>
                      void save(
                        () => api.settingsChange(slug, "DELETE", `/festivos/${holiday.id}`),
                        "Festivo quitado",
                      )
                    }
                  >
                    Quitar
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form className="k-holiday-form" onSubmit={form.submit} noValidate>
          <label className="k-field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(event) => setFecha(event.target.value)} />
          </label>
          <label className="k-field">
            <span>
              Nombre <span className="k-muted k-optional">(opcional)</span>
            </span>
            <input
              value={nombre}
              maxLength={120}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej.: Día de Canarias"
            />
          </label>
          {branchOptions.length > 0 ? (
            <label className="k-field">
              <span>Local</span>
              <select
                className="k-input"
                value={local ?? ""}
                onChange={(event) =>
                  setLocal(event.target.value ? Number(event.target.value) : null)
                }
              >
                {data.edicion_completa ? <option value="">Todos los locales</option> : null}
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="k-check">
            <input
              type="checkbox"
              checked={cerrado}
              onChange={(event) => setCerrado(event.target.checked)}
            />
            <span>Cerrado todo el día</span>
          </label>
          <button type="submit" className="k-btn k-btn-secondary" disabled={form.busy}>
            Añadir festivo
          </button>
          {form.error ? (
            <p className="k-alert k-full" role="alert">
              {form.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </Section>
  );
}

// -------------------------------------------------------------------------------- locales

function BranchSection({
  branch,
  restaurantWeek,
  editable,
  save,
}: {
  readonly branch: BranchSettings;
  readonly restaurantWeek: readonly Day[];
  readonly editable: boolean;
  readonly save: Saver;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [nombre, setNombre] = useState(branch.nombre);
  const [telefono, setTelefono] = useState(branch.telefono ?? "");
  const [direccion, setDireccion] = useState(branch.direccion ?? "");
  const [lat, setLat] = useState(branch.lat?.toString() ?? "");
  const [lng, setLng] = useState(branch.lng?.toString() ?? "");
  const [activo, setActivo] = useState(branch.activo);
  const [recogida, setRecogida] = useState(branch.recogida);
  const [reparto, setReparto] = useState(branch.reparto);
  const [apertura, setApertura] = useState<OpenMode>(branch.apertura_manual);
  const [ownSchedule, setOwnSchedule] = useState(branch.horario_propio !== null);

  const form = useSubmit(async () => {
    if (!nombre.trim()) return "El local necesita un nombre.";
    const latValue = lat.trim() ? Number(lat.replace(",", ".")) : null;
    const lngValue = lng.trim() ? Number(lng.replace(",", ".")) : null;
    if (
      (latValue === null) !== (lngValue === null) ||
      Number.isNaN(latValue) ||
      Number.isNaN(lngValue)
    ) {
      return settingsErrorMessage("lat_lng_together");
    }
    return save(
      () =>
        api.settingsChange(slug, "PATCH", `/locales/${branch.id}`, {
          nombre: nombre.trim(),
          telefono: nullIfEmpty(telefono),
          direccion: nullIfEmpty(direccion),
          lat: latValue,
          lng: lngValue,
          activo,
          recogida,
          reparto,
          apertura_manual: apertura,
        }),
      `${nombre.trim()} guardado`,
    );
  });

  return (
    <div className="k-settings-stack">
      <form onSubmit={form.submit} noValidate>
        <Section
          title={branch.nombre}
          lead={
            branch.principal
              ? "Local principal: recibe los pedidos que no indican local."
              : undefined
          }
        >
          <OpenModePicker
            label="Estado de este local"
            value={apertura}
            onChange={setApertura}
            disabled={!editable}
          />
          <div className="k-form-grid">
            <TextField
              label="Nombre"
              value={nombre}
              onChange={setNombre}
              disabled={!editable}
              max={120}
            />
            <TextField
              label="Teléfono"
              value={telefono}
              onChange={setTelefono}
              disabled={!editable}
              max={30}
              optional
              inputMode="tel"
            />
          </div>
          <TextField
            label="Dirección"
            value={direccion}
            onChange={setDireccion}
            disabled={!editable}
            max={200}
            optional
          />
          <div className="k-form-grid">
            <TextField
              label="Latitud"
              value={lat}
              onChange={setLat}
              disabled={!editable}
              max={14}
              optional
              inputMode="decimal"
              placeholder="28.9637"
            />
            <TextField
              label="Longitud"
              value={lng}
              onChange={setLng}
              disabled={!editable}
              max={15}
              optional
              inputMode="decimal"
              placeholder="-13.5477"
              hint="Sirven para asignar el local más cercano y calcular el reparto por km."
            />
          </div>
          <div className="k-toggle-list">
            <Toggle
              checked={activo}
              onChange={setActivo}
              disabled={!editable || branch.principal}
              label="Local activo"
            />
            <Toggle
              checked={recogida}
              onChange={setRecogida}
              disabled={!editable}
              label="Acepta recogida"
            />
            <Toggle
              checked={reparto}
              onChange={setReparto}
              disabled={!editable}
              label="Hace reparto"
            />
          </div>
          <SaveBar busy={form.busy} editable={editable} error={form.error} />
        </Section>
      </form>

      {ownSchedule ? (
        <WeekEditor
          key={branch.horario_propio ? "own" : "new"}
          title={`Horario de ${branch.nombre}`}
          week={branch.horario_propio ?? restaurantWeek}
          editable={editable}
          onSave={(dias) =>
            save(
              () => api.settingsChange(slug, "PUT", `/locales/${branch.id}/horario`, { dias }),
              "Horario del local guardado",
            )
          }
          extra={
            editable ? (
              <button
                type="button"
                className="k-link k-small k-link-inline"
                onClick={async () => {
                  if (branch.horario_propio === null) {
                    setOwnSchedule(false);
                    return;
                  }
                  const error = await save(
                    () =>
                      api.settingsChange(slug, "PUT", `/locales/${branch.id}/horario`, {
                        dias: null,
                      }),
                    "Este local vuelve al horario del restaurante",
                  );
                  if (!error) setOwnSchedule(false);
                }}
              >
                Usar el horario del restaurante
              </button>
            ) : null
          }
        />
      ) : (
        <Section title={`Horario de ${branch.nombre}`}>
          <p className="k-muted k-small">Usa el horario del restaurante:</p>
          <ul className="k-week-summary">
            {restaurantWeek.map((day) => (
              <li key={day.dia}>
                <span>{day.dia}</span>
                <span className={day.disponible ? "" : "k-muted"}>{dayLabel(day)}</span>
              </li>
            ))}
          </ul>
          {editable ? (
            <button
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              onClick={() => setOwnSchedule(true)}
            >
              Poner un horario propio
            </button>
          ) : null}
        </Section>
      )}
    </div>
  );
}
