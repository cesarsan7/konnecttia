"use client";

import { useState } from "react";
import type { PanelBranch } from "@/lib/panel/types";
import { Icon } from "./Icon";

type Props = {
  readonly branch: PanelBranch;
  readonly showName: boolean;
  readonly timeZone: string;
  /** Minutos extra que ofrece el restaurante (restaurante_config.modo_ocupado_opciones). */
  readonly options: readonly number[];
  /** null = volver a los tiempos normales. */
  readonly onChange: (minutes: number | null) => Promise<void>;
};

/**
 * «Modo ocupado»: suma minutos al tiempo que ven los clientes al pedir (web y, cuando n8n lo lea,
 * WhatsApp). Se apaga solo al cabo del tiempo configurado (modo_ocupado_duracion_minutos).
 */
export function BusyModeControl({ branch, showName, timeZone, options, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const busy = branch.modo_ocupado;

  async function apply(minutes: number | null) {
    setSaving(true);
    await onChange(minutes);
    setSaving(false);
  }

  return (
    <div className={`k-busy${busy ? " is-on" : ""}`}>
      <span className="k-busy-label">
        <Icon name="flame" size={18} />
        {showName ? <strong>{branch.nombre}</strong> : null}
        {busy ? (
          <span>
            Ocupado: +{busy.minutos_extra} min hasta las{" "}
            {new Date(busy.hasta).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone,
            })}
          </span>
        ) : showName ? (
          <span className="k-muted">Tiempos normales</span>
        ) : (
          <span className="k-muted">¿Mucho lío? Avisa a los clientes de que tardarás más:</span>
        )}
      </span>
      <span className="k-busy-actions">
        {busy ? (
          <button
            type="button"
            className="k-btn k-btn-secondary k-btn-sm"
            disabled={saving}
            onClick={() => apply(null)}
          >
            Quitar
          </button>
        ) : (
          options.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="k-btn k-btn-secondary k-btn-sm"
              disabled={saving}
              onClick={() => apply(minutes)}
            >
              +{minutes} min
            </button>
          ))
        )}
      </span>
    </div>
  );
}

/**
 * Explicación del modo ocupado (comprobada con repositories/eta.ts de la API): suma minutos al
 * tiempo estimado que ven los clientes nuevos; no para pedidos ni cambia los ya hechos.
 */
export function BusyModeHelp({ duration }: { readonly duration: number | null }) {
  return (
    <details className="k-help">
      <summary>¿Qué hace el modo ocupado?</summary>
      <ul>
        <li>
          Suma los minutos que elijas al{" "}
          <strong>tiempo de espera que ven los clientes nuevos</strong> de ese local, en la web y
          por WhatsApp. Ejemplo: si se anuncia «25-35 min», con +15 min se anuncia «40-50 min».
        </li>
        <li>
          <strong>No deja de aceptar pedidos</strong> ni cambia el tiempo de los que ya están
          hechos. Si necesitas parar los pedidos, pon el local en «Cerrado ahora» (Ajustes →
          General).
        </li>
        <li>
          Se quita solo
          {duration ? (
            <>
              {" "}
              a los <strong>{duration} min</strong>
            </>
          ) : (
            " al cabo del tiempo configurado en Ajustes"
          )}
          , o antes con «Quitar».
        </li>
        <li>
          Se suma a las horas punta (Ajustes → Horario) y al tiempo extra por pedidos en cola, si
          está configurado.
        </li>
      </ul>
    </details>
  );
}
