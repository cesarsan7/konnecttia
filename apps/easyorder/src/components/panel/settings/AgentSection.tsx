"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgentParam } from "@/lib/agent-params";
import { agentParamError } from "@/lib/agent-params";
import { AgentParamsEditor } from "../../agent/AgentParamsEditor";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";

type Props = {
  readonly editable: boolean;
  readonly notify: (text: string, tone?: "ok" | "error") => void;
};

/**
 * Ajustes → «Agente de WhatsApp». Cada parámetro hereda el valor estándar de Konnecttia hasta que
 * el restaurante lo cambia. Lo premium se ve, pero se edita solo con el módulo Agente Pro.
 */
export function AgentSection({ editable, notify }: Props) {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [params, setParams] = useState<AgentParam[] | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await api.agentSettings(slug);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setParams(result.data.parametros);
    setVersion((n) => n + 1);
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <section className="k-card k-settings">
        <p className="k-alert" role="alert">
          No se pudo cargar el agente. Inténtalo de nuevo.
        </p>
        <button type="button" className="k-btn k-btn-secondary" onClick={() => void load()}>
          Reintentar
        </button>
      </section>
    );
  }
  if (!params) {
    return (
      <section className="k-card k-settings">
        <p className="k-muted">Cargando…</p>
      </section>
    );
  }

  const basic = params.filter((param) => param.nivel === "basico");
  const premium = params.filter((param) => param.nivel === "premium");

  async function save(changes: Record<string, unknown>): Promise<string | null> {
    const result = await api.agentSettingsSave(slug, changes);
    if (!result.ok) return agentParamError(result.body as { reason?: string; field?: string });
    notify("Guardado");
    await load();
    return null;
  }

  return (
    <>
      <section className="k-card k-settings">
        <header className="k-settings-head">
          <h2 className="k-title">Agente de WhatsApp</h2>
          <p className="k-muted k-small">
            Así atiende el agente a tus clientes. Lo que no cambies usa el valor estándar de
            Konnecttia.
          </p>
        </header>
        <AgentParamsEditor
          key={`basic-${version}`}
          params={basic}
          editable={editable}
          showOrigin
          onSave={save}
        />
      </section>
      {premium.length > 0 ? (
        <section className="k-card k-settings">
          <header className="k-settings-head">
            <h2 className="k-title">Agente Pro</h2>
            <p className="k-muted k-small">
              Notificaciones de estado, aviso antes de que caduque el carrito y cancelación
              automática de pagos pendientes.
            </p>
          </header>
          <AgentParamsEditor
            key={`premium-${version}`}
            params={premium}
            editable={editable}
            showOrigin
            onSave={save}
            lockedText="Disponible con el módulo Agente Pro. Pídelo a Konnecttia para activarlo."
          />
        </section>
      ) : null}
    </>
  );
}
