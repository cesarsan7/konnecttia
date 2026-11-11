"use client";

import { useEffect, useState } from "react";
import type { SupportAccess } from "@/lib/interno/types";
import { HelpNote } from "../../HelpNote";
import { usePanel } from "../PanelProvider";
import { PERMISSION, useAccess } from "../PanelShell";

const stamp = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const HELP = [
  {
    campo: "Accesos de soporte",
    para: "Saber quién del equipo de Konnecttia ha entrado a tu panel y por qué.",
    como: "Cuando necesitamos ayudarte, entramos en modo soporte: solo lectura, una hora y con un motivo. Cada entrada queda aquí. No vemos datos de tus clientes ni podemos cambiar nada.",
  },
] as const;

/** Registro de accesos de soporte de Konnecttia. Solo aparece si Konnecttia lo ha habilitado. */
export function SupportLogSection() {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const [accesses, setAccesses] = useState<readonly SupportAccess[] | null>(null);
  const allowed = can(PERMISSION.TeamManage);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void api.supportLog(slug).then((result) => {
      if (active && result.ok && result.data.habilitado) setAccesses(result.data.accesos);
    });
    return () => {
      active = false;
    };
  }, [api, slug, allowed]);

  if (accesses === null) return null;
  return (
    <section className="k-card k-cat" aria-labelledby="soporte-registro">
      <h2 id="soporte-registro" className="k-title">
        Accesos de soporte de Konnecttia
      </h2>
      <HelpNote items={HELP} summary="¿Qué es esto?" />
      {accesses.length === 0 ? (
        <p className="k-muted">Nadie de Konnecttia ha entrado a tu panel.</p>
      ) : (
        <ul className="k-items">
          {accesses.map((access) => (
            <li key={access.id} className="k-item">
              <span className="k-item-main">
                <strong>{access.email ?? "Konnecttia"}</strong>
                <span className="k-small">{access.motivo}</span>
                <span className="k-small k-muted">
                  {stamp.format(new Date(access.entrada))}
                  {access.salida ? ` · salió ${stamp.format(new Date(access.salida))}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
