"use client";

import { useCallback, useEffect, useState } from "react";
import { type AgentParam, agentParamError } from "@/lib/agent-params";
import { AgentParamsEditor } from "../agent/AgentParamsEditor";
import { usePlatform } from "./InternalShell";

/** Ficha del restaurante: parámetros del agente con su origen; aquí también los solo internos. */
export function AgentRestaurantSection({ id }: { readonly id: number }) {
  const { api, canWrite, toast } = usePlatform();
  const [data, setData] = useState<{
    agente_contratado: boolean;
    parametros: AgentParam[];
  } | null>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    const result = await api.restaurantAgent(id);
    if (!result.ok) return;
    setData(result.data);
    setVersion((n) => n + 1);
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;

  async function save(changes: Record<string, unknown>): Promise<string | null> {
    const result = await api.saveRestaurantAgent(id, changes);
    if (!result.ok) return agentParamError(result.body as { reason?: string; field?: string });
    toast("Agente guardado", "ok");
    await load();
    return null;
  }

  return (
    <section className="k-card k-rd-section" aria-labelledby="rd-agente">
      <h2 id="rd-agente" className="k-title">
        Agente de WhatsApp
      </h2>
      {!data.agente_contratado ? (
        <p className="k-muted k-small">
          Este restaurante no tiene el módulo del agente; los valores se guardan pero no se usan
          hasta activarlo.
        </p>
      ) : null}
      <AgentParamsEditor
        key={version}
        params={data.parametros.map((param) => ({ ...param, bloqueado: false }))}
        editable={canWrite}
        showOrigin
        onSave={save}
      />
    </section>
  );
}
