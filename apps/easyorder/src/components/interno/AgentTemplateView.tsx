"use client";

import { useCallback, useEffect, useState } from "react";
import { type AgentParam, agentParamError } from "@/lib/agent-params";
import { AgentParamsEditor } from "../agent/AgentParamsEditor";
import { usePlatform } from "./InternalShell";

/**
 * Plantilla estándar del agente (ADR 0013): los valores que heredan todos los restaurantes que no
 * personalizan un parámetro. Cambiarla afecta de inmediato a quien hereda; «soporte» solo lee.
 */
export function AgentTemplateView() {
  const { api, canWrite, toast } = usePlatform();
  const [data, setData] = useState<{
    restaurantes_con_agente: number;
    parametros: AgentParam[];
  } | null>(null);
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await api.agentTemplate();
    if (!result.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData(result.data);
    setVersion((n) => n + 1);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(changes: Record<string, unknown>): Promise<string | null> {
    const result = await api.saveAgentTemplate(changes);
    if (!result.ok) return agentParamError(result.body as { reason?: string; field?: string });
    toast("Plantilla guardada", "ok");
    await load();
    return null;
  }

  if (failed) return <p className="k-alert">No se pudo cargar la plantilla del agente.</p>;
  if (!data) return <p className="k-muted">Cargando…</p>;

  // `agente_activo` no se hereda y lo interno se edita por restaurante: no van en la plantilla.
  const inherited = data.parametros.filter(
    (param) => param.editable_por !== "interno" && param.clave !== "agente_activo",
  );

  return (
    <div className="k-page">
      <section className="k-card k-settings">
        <header className="k-settings-head">
          <h1 className="k-title">Plantilla estándar del agente</h1>
          <p className="k-muted k-small">
            Valores que heredan los {data.restaurantes_con_agente} restaurante
            {data.restaurantes_con_agente === 1 ? "" : "s"} con el agente. Un restaurante puede
            personalizar cada parámetro desde sus Ajustes.
          </p>
        </header>
        <AgentParamsEditor
          key={version}
          params={inherited}
          editable={canWrite}
          showOrigin={false}
          onSave={save}
        />
      </section>
    </div>
  );
}
