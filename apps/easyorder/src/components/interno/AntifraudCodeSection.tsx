"use client";

import { useState } from "react";
import {
  CODE_DEFAULT_CAP_EUR,
  CODE_DEFAULT_THRESHOLD_EUR,
  codeSettingsForm,
  platformErrorMessage,
  sameCodeSettings,
  toCodeSettingsBody,
  validateCodeSettings,
} from "@/lib/interno/logic";
import type { CodeSettingsInfo, RestaurantDetail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./antifraud-code.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

type Props = {
  readonly detail: RestaurantDetail;
  readonly onChanged: () => Promise<void>;
};

const euros = (value: number) =>
  value.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/**
 * Código de verificación del pedido web (antifraude capa 3, ADR 0011): canal, importe desde el que
 * se pide y tope de gasto mensual. Lo cambia el equipo de Konnecttia; el restaurante no lo ve.
 */
export function AntifraudCodeSection({ detail, onChanged }: Props) {
  const { api, canWrite, toast } = usePlatform();
  const info: CodeSettingsInfo = detail.antifraude_codigo;
  const saved = codeSettingsForm(info);
  const [form, setForm] = useState(saved);
  const [busy, setBusy] = useState(false);

  const errors = validateCodeSettings(form);
  const invalid = Object.keys(errors).length > 0;
  const unchanged = sameCodeSettings(saved, form);
  const on = form.canal === "whatsapp";

  async function save() {
    if (invalid) return;
    setBusy(true);
    const result = await api.changeCodeSettings(detail.restaurante.id, toCodeSettingsBody(form));
    setBusy(false);
    if (!result.ok) {
      toast(platformErrorMessage(result.status, result.body), "error");
      return;
    }
    toast("Código de verificación guardado.");
    await onChanged();
  }

  return (
    <section className="k-card k-ac" aria-labelledby="ac-title">
      <h2 id="ac-title" className="k-title">
        Antifraude: código de verificación
      </h2>
      <p className="k-muted k-small">
        En el pedido web, un código por WhatsApp solo cuando hay riesgo: teléfono sin pedidos
        entregados, reparto pagado en efectivo o importe alto. Gasto este mes:{" "}
        <strong>{euros(info.gasto_mes_eur)}</strong> de {euros(info.tope_mensual_eur)}.
      </p>
      <HelpNote items={INTERNO_HELP.antifraude} />
      {on && !info.api_configurada ? (
        <p className="k-warn" role="status">
          La API aún no tiene WhatsApp configurado: aunque esté activo, no se pide ni se envía
          ningún código.
        </p>
      ) : null}

      <fieldset className="k-ac-set" disabled={!canWrite || busy}>
        <legend className="k-sr-only">Canal del código</legend>
        <label className="k-ac-option">
          <input
            type="radio"
            name="ac-canal"
            checked={form.canal === "whatsapp"}
            onChange={() => setForm({ ...form, canal: "whatsapp" })}
          />
          <span>WhatsApp</span>
        </label>
        <label className="k-ac-option">
          <input
            type="radio"
            name="ac-canal"
            checked={form.canal === "apagado"}
            onChange={() => setForm({ ...form, canal: "apagado" })}
          />
          <span>Apagado</span>
        </label>
      </fieldset>

      <div className="k-ac-fields">
        <label className="k-field">
          <span>Importe desde el que se pide (€)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={!canWrite || busy || !on}
            value={form.umbral}
            placeholder={`${CODE_DEFAULT_THRESHOLD_EUR} (por defecto)`}
            onChange={(event) => setForm({ ...form, umbral: event.target.value })}
          />
          {errors.umbral ? <span className="k-alert">{errors.umbral}</span> : null}
        </label>
        <label className="k-field">
          <span>Tope de gasto al mes (€)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={!canWrite || busy || !on}
            value={form.tope}
            placeholder={`${CODE_DEFAULT_CAP_EUR} (por defecto)`}
            onChange={(event) => setForm({ ...form, tope: event.target.value })}
          />
          {errors.tope ? <span className="k-alert">{errors.tope}</span> : null}
        </label>
      </div>
      <p className="k-muted k-small">
        Con el tope alcanzado no se envían más códigos: el pago en efectivo pide tarjeta o llamar al
        local y el cobro con tarjeta sigue adelante. Dejar un campo vacío usa el valor por defecto.
      </p>

      {canWrite ? (
        <div className="k-ac-actions">
          <button
            type="button"
            className="k-btn k-btn-primary"
            disabled={busy || unchanged || invalid}
            onClick={() => void save()}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        <p className="k-muted k-small">Tu rol es de consulta: no puedes cambiar este ajuste.</p>
      )}
    </section>
  );
}
