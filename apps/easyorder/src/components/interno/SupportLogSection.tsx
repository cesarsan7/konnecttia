"use client";

import { useCallback, useEffect, useState } from "react";
import { HelpNote } from "@/components/HelpNote";
import { platformErrorMessage } from "@/lib/interno/logic";
import type { SupportLogInfo } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./support-log.css";

const stamp = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (iso: string) => stamp.format(new Date(iso));

const HELP = [
  {
    campo: "Mostrar al restaurante",
    para: "Dar transparencia: que el dueño vea quién de Konnecttia entró a su panel y por qué.",
    como: "Si lo activas, en Equipo de su panel aparece «Accesos de soporte de Konnecttia» con fecha, persona, rol y motivo. Apagado, el restaurante no ve nada (el registro sigue guardándose igual).",
    cuidado:
      "Quien gestiona el equipo del restaurante verá el email de quien entró y el motivo que escribió: redáctalo pensando en que puede leerlo el cliente.",
  },
] as const;

/** Registro de accesos de soporte y de cambios hechos desde /interno, y si el restaurante lo ve. */
export function SupportLogSection({ id }: { readonly id: number }) {
  const { api, canWrite, toast } = usePlatform();
  const [log, setLog] = useState<SupportLogInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.supportLog(id);
    if (result.ok) setLog(result.data);
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(visible: boolean) {
    setBusy(true);
    const result = await api.setSupportLogVisible(id, visible);
    setBusy(false);
    if (!result.ok) return toast(platformErrorMessage(result.status, result.body), "error");
    toast(visible ? "El restaurante ya ve el registro" : "El registro queda oculto al restaurante");
    void load();
  }

  if (!log) return null;
  return (
    <section className="k-card k-rd-section k-slog" aria-labelledby="rd-registro">
      <h2 id="rd-registro" className="k-title">
        Registro de accesos y cambios
      </h2>
      <label className="k-slog-toggle">
        <input
          type="checkbox"
          checked={log.visible_al_restaurante}
          disabled={!canWrite || busy}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>Mostrar los accesos de soporte al restaurante (en su Equipo)</span>
      </label>
      <HelpNote items={HELP} summary="¿Qué significa «mostrar al restaurante»?" />

      <h3 className="k-subtitle">Accesos de soporte</h3>
      {log.accesos.length === 0 ? (
        <p className="k-muted">
          Nadie de Konnecttia ha entrado a este restaurante en modo soporte.
        </p>
      ) : (
        <ul className="k-items">
          {log.accesos.map((access) => (
            <li key={access.id} className="k-item">
              <span className="k-item-main">
                <strong>{access.email ?? "—"}</strong>{" "}
                <span className="k-muted k-small">({access.rol ?? "—"})</span>
                <span className="k-small">{access.motivo}</span>
                <span className="k-small k-muted">
                  Entró {when(access.entrada)} ·{" "}
                  {access.salida
                    ? `salió ${when(access.salida)}`
                    : access.expira_en
                      ? `caducó ${when(access.expira_en)}`
                      : "sin salida"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="k-subtitle">Cambios hechos desde /interno</h3>
      {log.cambios.length === 0 ? (
        <p className="k-muted">Sin cambios registrados.</p>
      ) : (
        <ul className="k-items">
          {log.cambios.map((change) => (
            <li key={change.id} className="k-item">
              <span className="k-item-main">
                <strong>{change.accion.replace("plataforma.", "")}</strong>
                <span className="k-small k-muted">
                  {when(change.fecha)} · {change.email ?? "—"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
