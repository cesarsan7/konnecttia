"use client";

import { useState } from "react";
import {
  canCancelModule,
  type ManualOrigin,
  moduleToggle,
  originLabel,
  platformErrorMessage,
  stateLabel,
} from "@/lib/interno/logic";
import type { ModuleRow, RestaurantDetail } from "@/lib/interno/types";
import { usePlatform } from "./InternalShell";
import "./plan-modules.css";

const KIND_LABEL: Record<ModuleRow["tipo"], string> = {
  core: "Básico",
  plan: "De plan",
  addon: "Complemento",
  future: "Próximamente",
};

type Props = {
  readonly detail: RestaurantDetail;
  readonly onChanged: () => Promise<void>;
};

export function PlanModulesSection({ detail, onChanged }: Props) {
  const { api, canWrite, toast } = usePlatform();
  const id = detail.restaurante.id;
  const names = new Map(detail.modulos.map((module) => [module.code, module.nombre]));
  const [plan, setPlan] = useState(detail.plan?.code ?? "");
  const [confirmingPlan, setConfirmingPlan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [origins, setOrigins] = useState<Record<string, ManualOrigin>>({});

  async function applyPlan() {
    setBusy("plan");
    const result = await api.changePlan(id, plan);
    setBusy(null);
    setConfirmingPlan(false);
    if (!result.ok) {
      toast(platformErrorMessage(result.status, result.body, names), "error");
      return;
    }
    const added = result.data.modulos_anadidos.length;
    const removed = result.data.modulos_quitados.length;
    toast(
      `Plan cambiado. Módulos añadidos: ${added}. Quitados: ${removed}. Complementos y cortesías se mantienen.`,
    );
    await onChanged();
  }

  async function change(module: ModuleRow, body: ReturnType<typeof moduleToggle>) {
    setBusy(module.code);
    const result = await api.changeModule(id, module.code, body);
    setBusy(null);
    if (!result.ok) {
      toast(platformErrorMessage(result.status, result.body, names), "error");
    } else {
      toast(`${module.nombre}: ${stateLabel(result.data.estado).toLowerCase()}.`);
    }
    await onChanged();
  }

  const planChanged = plan !== (detail.plan?.code ?? "");
  return (
    <section className="k-card k-pm" aria-labelledby="pm-title">
      <h2 id="pm-title" className="k-title">
        Plan y módulos
      </h2>

      <div className="k-pm-plan">
        <label className="k-field k-pm-select">
          <span>Plan</span>
          <select
            value={plan}
            disabled={!canWrite || busy !== null}
            onChange={(event) => {
              setPlan(event.target.value);
              setConfirmingPlan(false);
            }}
          >
            {detail.plan ? null : <option value="">Sin plan</option>}
            {detail.planes.map((option) => (
              <option key={option.code} value={option.code}>
                {option.nombre}
              </option>
            ))}
          </select>
        </label>
        {canWrite && planChanged && plan ? (
          confirmingPlan ? (
            <fieldset className="k-pm-confirm">
              <legend className="k-sr-only">Confirmar cambio de plan</legend>
              <p className="k-small">
                Se añaden los módulos del plan nuevo y se quitan los del plan anterior que ya no
                incluye. Los complementos y cortesías se respetan.
              </p>
              <div className="k-pm-actions">
                <button
                  type="button"
                  className="k-btn k-btn-primary"
                  disabled={busy !== null}
                  onClick={() => void applyPlan()}
                >
                  {busy === "plan" ? "Aplicando…" : "Sí, cambiar de plan"}
                </button>
                <button
                  type="button"
                  className="k-btn k-btn-secondary"
                  onClick={() => setConfirmingPlan(false)}
                >
                  No
                </button>
              </div>
            </fieldset>
          ) : (
            <button
              type="button"
              className="k-btn k-btn-secondary"
              onClick={() => setConfirmingPlan(true)}
            >
              Cambiar plan
            </button>
          )
        ) : null}
      </div>
      {detail.plan ? (
        <p className="k-muted k-small">
          Plan {detail.plan.nombre} desde {new Date(detail.plan.desde).toLocaleDateString("es-ES")}.
        </p>
      ) : null}

      <ul className="k-pm-list">
        {detail.modulos.map((module) => {
          const active = module.estado === "activo";
          const origin = origins[module.code] ?? "complemento";
          const rowBusy = busy === module.code;
          return (
            <li key={module.code} className="k-pm-row">
              <div className="k-pm-info">
                <strong>{module.nombre}</strong>
                <span className="k-pm-tags">
                  <span className="k-pm-tag">{KIND_LABEL[module.tipo]}</span>
                  {module.en_plan ? <span className="k-pm-tag">En su plan</span> : null}
                  {module.estado ? (
                    <span className={`k-pm-tag is-${module.estado}`}>
                      {stateLabel(module.estado)}
                      {module.origen ? ` · ${originLabel(module.origen)}` : ""}
                    </span>
                  ) : module.gestionable ? (
                    <span className="k-pm-tag is-none">No contratado</span>
                  ) : null}
                </span>
                {module.depende_de.length > 0 ? (
                  <span className="k-muted k-small">
                    Necesita: {module.depende_de.map((code) => names.get(code) ?? code).join(", ")}
                  </span>
                ) : null}
              </div>

              {module.gestionable ? (
                <div className="k-pm-controls">
                  {canWrite && module.estado === null ? (
                    <label className="k-pm-origin">
                      <span className="k-sr-only">Origen de {module.nombre}</span>
                      <select
                        value={origin}
                        disabled={busy !== null}
                        onChange={(event) =>
                          setOrigins((current) => ({
                            ...current,
                            [module.code]: event.target.value as ManualOrigin,
                          }))
                        }
                      >
                        <option value="complemento">Complemento</option>
                        <option value="cortesia">Cortesía</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="k-toggle">
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={!canWrite || busy !== null}
                      onChange={() => void change(module, moduleToggle(module, origin))}
                    />
                    <span className="k-toggle-track" />
                    <span className="k-toggle-text">
                      {rowBusy ? "Guardando…" : active ? "Activo" : "Inactivo"}
                    </span>
                  </label>
                  {canWrite && canCancelModule(module) ? (
                    <button
                      type="button"
                      className="k-link k-link-danger k-small"
                      disabled={busy !== null}
                      onClick={() => void change(module, { estado: "cancelado" })}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="k-muted k-small">
                  {module.tipo === "core" ? "Siempre incluido" : "Aún no disponible"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {canWrite ? null : (
        <p className="k-muted k-small">
          Tu rol es de consulta: no puedes cambiar el plan ni los módulos.
        </p>
      )}
    </section>
  );
}
