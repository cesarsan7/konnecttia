"use client";

import { type FormEvent, useId, useState } from "react";
import {
  type AgentParam,
  draftChanges,
  isLongText,
  optionLabel,
  type ParamDraft,
  toDraft,
} from "@/lib/agent-params";
import "./agent-params.css";

type Props = {
  readonly params: readonly AgentParam[];
  readonly editable: boolean;
  /** Ajustes del restaurante: se ve qué hereda del estándar y se puede restablecer. */
  readonly showOrigin: boolean;
  /** Guarda los cambios (clave → valor, `null` restablece). Devuelve el error o null. */
  readonly onSave: (changes: Record<string, unknown>) => Promise<string | null>;
  /** Texto del bloqueo de lo premium. */
  readonly lockedText?: string;
};

const ORIGIN_LABEL = {
  propio: "Personalizado",
  plantilla: "Estándar",
  sin_valor: "Sin valor",
} as const;

/**
 * Formulario de los parámetros del agente, generado desde el catálogo: tipo → control. Se usa en
 * Ajustes (restaurante), en la plantilla interna y en la ficha interna de cada restaurante.
 */
export function AgentParamsEditor({ params, editable, showOrigin, onSave, lockedText }: Props) {
  const uid = useId();
  const [drafts, setDrafts] = useState<Record<string, ParamDraft>>(() =>
    Object.fromEntries(params.map((param) => [param.clave, toDraft(param)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (clave: string, value: ParamDraft) =>
    setDrafts((current) => ({ ...current, [clave]: value }));
  const result = draftChanges(params, drafts);
  const dirty = result.ok ? Object.keys(result.changes).length > 0 : true;

  async function run(changes: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const failure = await onSave(changes);
    setBusy(false);
    if (failure) setError(failure);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!result.ok) {
      const label = params.find((p) => p.clave === result.clave)?.etiqueta ?? result.clave;
      setError(`${label}: ${result.message}`);
      return;
    }
    if (Object.keys(result.changes).length > 0) void run(result.changes);
  }

  function control(param: AgentParam, disabled: boolean) {
    const id = `${uid}-${param.clave}`;
    const draft = drafts[param.clave] ?? toDraft(param);
    if (param.tipo === "booleano") {
      return (
        <label className="k-agent-options" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={draft === true}
            disabled={disabled}
            onChange={(event) => set(param.clave, event.target.checked)}
          />
          Activado
        </label>
      );
    }
    if (param.tipo === "json") {
      const chosen = Array.isArray(draft) ? draft : [];
      return (
        <fieldset className="k-agent-options" disabled={disabled} aria-label={param.etiqueta}>
          {(param.opciones ?? []).map((option) => (
            <label key={option}>
              <input
                type="checkbox"
                checked={chosen.includes(option)}
                onChange={(event) =>
                  set(
                    param.clave,
                    event.target.checked
                      ? [...chosen, option]
                      : chosen.filter((item) => item !== option),
                  )
                }
              />
              {optionLabel(option)}
            </label>
          ))}
        </fieldset>
      );
    }
    if (param.tipo === "entero") {
      return (
        <span className="k-agent-unit">
          <input
            id={id}
            className="k-input"
            type="number"
            inputMode="numeric"
            min={param.minimo ?? undefined}
            max={param.maximo ?? undefined}
            value={String(draft)}
            disabled={disabled}
            onChange={(event) => set(param.clave, event.target.value)}
          />
          {param.unidad ? <span className="k-muted k-small">{param.unidad}</span> : null}
        </span>
      );
    }
    if (param.opciones) {
      return (
        <select
          id={id}
          className="k-input"
          value={String(draft)}
          disabled={disabled}
          onChange={(event) => set(param.clave, event.target.value)}
        >
          {param.opciones.map((option) => (
            <option key={option} value={option}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      );
    }
    if (isLongText(param)) {
      return (
        <textarea
          id={id}
          className="k-input k-agent-textarea"
          value={String(draft)}
          disabled={disabled}
          maxLength={param.maximo ?? 500}
          onChange={(event) => set(param.clave, event.target.value)}
        />
      );
    }
    return (
      <input
        id={id}
        className="k-input"
        type={param.clave.endsWith("email") ? "email" : "text"}
        value={String(draft)}
        disabled={disabled}
        maxLength={param.maximo ?? 500}
        onChange={(event) => set(param.clave, event.target.value)}
      />
    );
  }

  return (
    <form className="k-agent-group" onSubmit={submit} noValidate>
      {params.map((param) => {
        const locked = param.bloqueado === true;
        const disabled = !editable || locked || busy;
        const own = param.origen === "propio";
        return (
          <div className="k-agent-param" key={param.clave}>
            <div className="k-agent-param-head">
              <label className="k-field-label" htmlFor={`${uid}-${param.clave}`}>
                {param.etiqueta}
              </label>
              {param.nivel === "premium" ? <span className="k-agent-lock">Premium</span> : null}
              {showOrigin && param.origen && !locked ? (
                <span className={`k-agent-origin${own ? " is-own" : ""}`}>
                  {ORIGIN_LABEL[param.origen]}
                </span>
              ) : null}
              {typeof param.personalizan === "number" ? (
                <span className="k-agent-origin">
                  {param.personalizan === 0
                    ? "Nadie lo personaliza"
                    : `${param.personalizan} restaurante${param.personalizan === 1 ? "" : "s"} lo personalizan`}
                </span>
              ) : null}
            </div>
            {param.descripcion ? <p className="k-muted k-small">{param.descripcion}</p> : null}
            {control(param, disabled)}
            {locked ? (
              <p className="k-small k-agent-lock">
                {lockedText ?? "Disponible con el módulo Agente Pro."}
              </p>
            ) : null}
            {showOrigin && own && editable && !locked ? (
              <button
                type="button"
                className="k-btn k-btn-secondary k-btn-sm"
                disabled={busy}
                onClick={() => void run({ [param.clave]: null })}
              >
                Volver al estándar
              </button>
            ) : null}
          </div>
        );
      })}
      {editable ? (
        <div className="k-save-bar">
          {error ? (
            <p className="k-alert" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="k-btn k-btn-go" disabled={busy || !dirty}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
