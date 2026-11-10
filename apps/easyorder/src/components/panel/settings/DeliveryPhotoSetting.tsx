"use client";

import "./delivery-photo-setting.css";
import { type FormEvent, useState } from "react";
import { DELIVERY_PHOTO_OPTIONS, type DeliveryPhotoMode } from "@/lib/panel/delivery-photo";
import { SETTINGS_HELP } from "@/lib/settings-help";
import { HelpNote } from "../../HelpNote";

type Props = {
  readonly value: DeliveryPhotoMode;
  readonly editable: boolean;
  /** Guarda el modo; devuelve el mensaje de error o null si salió bien. */
  readonly onSave: (mode: DeliveryPhotoMode) => Promise<string | null>;
};

/** Ajustes → Reparto: si el repartidor sube foto al entregar (no, opcional u obligatoria). */
export function DeliveryPhotoSetting({ value, editable, onSave }: Props) {
  const [mode, setMode] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = DELIVERY_PHOTO_OPTIONS.find((option) => option.id === mode);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(await onSave(mode));
    setBusy(false);
  }

  return (
    <form className="k-card k-settings" onSubmit={submit} noValidate>
      <header className="k-settings-head">
        <h2 className="k-title">Prueba de entrega</h2>
        <p className="k-muted k-small">
          Foto que hace el repartidor con el móvil al entregar el pedido. La ve el local en el
          pedido; no se envía al cliente.
        </p>
        <HelpNote items={SETTINGS_HELP.fotoEntrega} />
      </header>
      <fieldset className="k-fieldset k-fieldset-flat">
        <legend className="k-field-label">Foto de entrega</legend>
        <div className="k-segment k-segment-sm">
          {DELIVERY_PHOTO_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={!editable}
              className={mode === option.id ? "is-on" : ""}
              aria-pressed={mode === option.id}
              onClick={() => setMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {current ? <p className="k-small k-muted">{current.hint}</p> : null}
      </fieldset>
      {editable ? (
        <div className="k-save-bar">
          {error ? (
            <p className="k-alert" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="k-btn k-btn-go" disabled={busy || mode === value}>
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
