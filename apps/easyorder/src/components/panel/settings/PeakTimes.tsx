"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { type PeakTime, SERVICE_LABEL, zoneErrorMessage } from "@/lib/panel/settings";
import { SETTINGS_HELP } from "@/lib/settings-help";
import { HelpNote } from "../../HelpNote";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

type Notify = (text: string, tone?: "ok" | "error") => void;

/** Horas punta: minutos extra al tiempo estimado en franjas que se repiten cada semana. */
export function PeakTimes({
  branches,
  fullScope,
  editable,
  notify,
}: {
  readonly branches: readonly { readonly id: number; readonly nombre: string }[];
  readonly fullScope: boolean;
  readonly editable: boolean;
  readonly notify: Notify;
}) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [peaks, setPeaks] = useState<PeakTime[] | null>(null);
  const [dia, setDia] = useState<string>("");
  const [desde, setDesde] = useState("20:00");
  const [hasta, setHasta] = useState("22:00");
  const [servicio, setServicio] = useState<PeakTime["servicio"]>("ambos");
  const [minutos, setMinutos] = useState("15");
  const [local, setLocal] = useState<number | null>(fullScope ? null : (branches[0]?.id ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = new Map(branches.map((branch) => [branch.id, branch.nombre]));

  const load = useCallback(async () => {
    const result = await api.peaks(slug);
    if (result.ok) setPeaks(result.data.franjas);
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const extra = Number(minutos);
    if (!Number.isInteger(extra) || extra < 1 || extra > 240)
      return setError("Minutos extra: de 1 a 240.");
    setBusy(true);
    const result = await api.settingsChange(slug, "POST", "/franjas", {
      dia: dia || null,
      desde,
      hasta,
      servicio,
      minutos_extra: extra,
      sucursal_id: local,
    });
    setBusy(false);
    if (!result.ok)
      return setError(zoneErrorMessage((result.body as { reason?: string } | null)?.reason));
    setError(null);
    notify("Hora punta añadida");
    void load();
  }

  async function change(peak: PeakTime, patch: Partial<PeakTime> | null) {
    const { id, ...rest } = peak;
    const result =
      patch === null
        ? await api.settingsChange(slug, "DELETE", `/franjas/${id}`)
        : await api.settingsChange(slug, "PUT", `/franjas/${id}`, { ...rest, ...patch });
    if (result.ok) notify(patch === null ? "Hora punta quitada" : "Hora punta guardada");
    else notify("No se pudo cambiar la hora punta.", "error");
    void load();
  }

  const canTouch = (peak: PeakTime) => editable && (peak.sucursal_id !== null || fullScope);

  return (
    <section className="k-card k-settings">
      <header className="k-settings-head">
        <h2 className="k-title">Horas punta</h2>
        <p className="k-muted k-small">
          Minutos que se suman al tiempo estimado en las franjas de más trabajo (por ejemplo,
          viernes de 20:00 a 22:00, +15 min). Para un aumento puntual usa el modo ocupado del
          tablero.
        </p>
        <HelpNote items={SETTINGS_HELP.horasPunta} />
      </header>
      {peaks === null ? (
        <div className="k-skeleton" aria-busy="true" />
      ) : peaks.length === 0 ? (
        <p className="k-muted k-small">Sin horas punta.</p>
      ) : (
        <ul className="k-holidays">
          {peaks.map((peak) => (
            <li key={peak.id} className={peak.activo ? "" : "is-off"}>
              <span>
                <strong>{peak.dia ?? "Todos los días"}</strong> · {peak.desde}–{peak.hasta} ·{" "}
                <strong>+{peak.minutos_extra} min</strong>
              </span>
              <span className="k-holiday-tags">
                <span className="k-chip">{SERVICE_LABEL[peak.servicio]}</span>
                {branches.length > 1 || peak.sucursal_id !== null ? (
                  <span className="k-chip">
                    {peak.sucursal_id === null
                      ? "Todos los locales"
                      : (names.get(peak.sucursal_id) ?? "Local")}
                  </span>
                ) : null}
                {!peak.activo ? <span className="k-chip k-chip-off">Pausada</span> : null}
                {canTouch(peak) ? (
                  <>
                    <button
                      type="button"
                      className="k-link k-small"
                      onClick={() => void change(peak, { activo: !peak.activo })}
                    >
                      {peak.activo ? "Pausar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      className="k-link k-small k-link-danger"
                      onClick={() => void change(peak, null)}
                    >
                      Quitar
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable ? (
        <form className="k-peak-form" onSubmit={add} noValidate>
          <label className="k-field">
            <span>Día</span>
            <select className="k-input" value={dia} onChange={(e) => setDia(e.target.value)}>
              <option value="">Todos los días</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="k-field">
            <span>Desde</span>
            <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="k-field">
            <span>Hasta</span>
            <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <label className="k-field">
            <span>Servicio</span>
            <select
              className="k-input"
              value={servicio}
              onChange={(e) => setServicio(e.target.value as PeakTime["servicio"])}
            >
              {Object.entries(SERVICE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="k-field">
            <span>Minutos extra</span>
            <input
              value={minutos}
              inputMode="numeric"
              onChange={(e) => setMinutos(e.target.value)}
            />
          </label>
          {branches.length > 1 || !fullScope ? (
            <label className="k-field">
              <span>Local</span>
              <select
                className="k-input"
                value={local ?? ""}
                onChange={(e) => setLocal(e.target.value ? Number(e.target.value) : null)}
              >
                {fullScope ? <option value="">Todos los locales</option> : null}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="submit" className="k-btn k-btn-secondary" disabled={busy}>
            Añadir
          </button>
          {error ? (
            <p className="k-alert k-full" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
