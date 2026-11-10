"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { platformErrorMessage } from "@/lib/interno/logic";
import {
  changedSettings,
  parseDraft,
  type SettingsDraft,
  type SettingsErrors,
  toDraft,
} from "@/lib/interno/trials";
import type { PlatformSettings, SignupSettings } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./signup-settings.css";
import { HelpNote } from "@/components/HelpNote";
import { INTERNO_HELP } from "@/lib/interno/help";

type Load =
  | { readonly kind: "loading" }
  | { readonly kind: "ready" }
  | { readonly kind: "error"; readonly message: string };

/** Configuración global del alta autoservicio (`plataforma_config`). Apagada por defecto. */
export function SignupSettingsView() {
  const { api, canWrite, toast } = usePlatform();
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [saved, setSaved] = useState<SignupSettings | null>(null);
  const [descriptions, setDescriptions] = useState<PlatformSettings["descripciones"]>({});
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.signupSettings();
    if (!result.ok) {
      setState({ kind: "error", message: platformErrorMessage(result.status, result.body) });
      return;
    }
    setSaved(result.data.config);
    setDescriptions(result.data.descripciones);
    setDraft(toDraft(result.data.config));
    setState({ kind: "ready" });
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !saved) return;
    const parsed = parseDraft(draft);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    const changes = changedSettings(saved, parsed.values);
    if (Object.keys(changes).length === 0) return toast("No hay cambios que guardar.");
    setBusy(true);
    setError(null);
    const result = await api.saveSignupSettings(changes);
    setBusy(false);
    if (!result.ok) return setError(platformErrorMessage(result.status, result.body));
    setSaved(result.data.config);
    setDraft(toDraft(result.data.config));
    toast("Configuración guardada.");
  }

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="k-page k-ss">
      <header className="k-page-head">
        <div>
          <p className="k-eyebrow">Konnecttia</p>
          <h1 className="k-heading">Configuración del alta</h1>
        </div>
      </header>
      <HelpNote items={INTERNO_HELP.alta} />

      {state.kind === "loading" || !draft ? (
        state.kind === "error" ? (
          <div className="k-card">
            <p className="k-alert" role="alert">
              {state.message}
            </p>
            <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="k-skeleton k-skeleton-tall" aria-busy="true" />
        )
      ) : (
        <form className="k-card k-ss-form" onSubmit={save} noValidate>
          <p className="k-muted">
            Estos ajustes valen para toda la plataforma. Los límites se copian a cada prueba en el
            momento del alta: cambiarlos aquí no altera las pruebas que ya están en marcha (esas se
            amplían una a una en «Pruebas»).
          </p>

          <label className="k-ss-check">
            <input
              type="checkbox"
              checked={draft.activa}
              disabled={!canWrite}
              onChange={(event) => set("activa", event.target.checked)}
            />
            <span>
              <strong>Alta autoservicio abierta</strong>
              <small className="k-muted">
                {descriptions.alta_autoservicio_activa ??
                  "Cualquiera puede crear su restaurante de prueba desde /alta."}
              </small>
            </span>
          </label>

          <label className="k-ss-check">
            <input
              type="checkbox"
              checked={draft.aprobacion}
              disabled={!canWrite}
              onChange={(event) => set("aprobacion", event.target.checked)}
            />
            <span>
              <strong>Exigir aprobación manual</strong>
              <small className="k-muted">
                {descriptions.alta_requiere_aprobacion ??
                  "La prueba nace pendiente hasta que Konnecttia la apruebe."}
              </small>
            </span>
          </label>

          <div className="k-ss-grid">
            <label className="k-field">
              <span>Días de prueba</span>
              <input
                inputMode="numeric"
                placeholder="Sin límite"
                value={draft.dias}
                disabled={!canWrite}
                onChange={(event) => set("dias", event.target.value)}
                aria-invalid={errors.dias ? true : undefined}
              />
              <small className={errors.dias ? "k-ss-error" : "k-muted"}>
                {errors.dias ?? "Vacío = sin límite de días."}
              </small>
            </label>
            <label className="k-field">
              <span>Pedidos de la prueba</span>
              <input
                inputMode="numeric"
                placeholder="Sin límite"
                value={draft.maxPedidos}
                disabled={!canWrite}
                onChange={(event) => set("maxPedidos", event.target.value)}
                aria-invalid={errors.maxPedidos ? true : undefined}
              />
              <small className={errors.maxPedidos ? "k-ss-error" : "k-muted"}>
                {errors.maxPedidos ?? "Vacío = sin límite. No cuentan carritos ni cancelados."}
              </small>
            </label>
          </div>

          <label className="k-field">
            <span>Email de contacto</span>
            <input
              type="email"
              inputMode="email"
              value={draft.contacto}
              disabled={!canWrite}
              onChange={(event) => set("contacto", event.target.value)}
              aria-invalid={errors.contacto ? true : undefined}
            />
            <small className={errors.contacto ? "k-ss-error" : "k-muted"}>
              {errors.contacto ??
                "Lo ven quienes quieren activar su plan, o cuando el alta está cerrada."}
            </small>
          </label>

          {error ? (
            <p className="k-alert" role="alert">
              {error}
            </p>
          ) : null}
          {canWrite ? (
            <div>
              <button type="submit" className="k-btn k-btn-primary" disabled={busy}>
                {busy ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          ) : (
            <p className="k-muted k-small">
              Tu rol es de consulta: no puedes cambiar la configuración.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
