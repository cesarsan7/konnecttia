"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type ChecklistPrefs,
  checklistItems,
  checklistProgress,
  type FirstSteps as FirstStepsData,
  readChecklistPrefs,
  saveChecklistPrefs,
} from "@/lib/panel/onboarding";
import { usePanel } from "../PanelProvider";
import { useAccess } from "../PanelShell";
import "./first-steps.css";

/**
 * Tarjeta «Primeros pasos» de la pantalla de Pedidos: lo que falta por configurar. Se puede
 * plegar y ocultar (se recuerda en este navegador) y desaparece sola cuando todo está listo.
 */
export function FirstSteps() {
  const { api } = usePanel();
  const { slug, can } = useAccess();
  const [data, setData] = useState<FirstStepsData["pasos"] | null>(null);
  // Hasta leer el navegador se asume «oculta» para no parpadear en el primer pintado.
  const [prefs, setPrefs] = useState<ChecklistPrefs | null>(null);

  useEffect(() => {
    setPrefs(readChecklistPrefs(slug));
  }, [slug]);

  useEffect(() => {
    let active = true;
    void api.firstSteps(slug).then((result) => {
      if (active && result.ok) setData(result.data.pasos);
    });
    return () => {
      active = false;
    };
  }, [api, slug]);

  const items = useMemo(() => (data ? checklistItems(data, `/panel/${slug}`) : []), [data, slug]);
  const progress = checklistProgress(items);

  if (!data || prefs === null || prefs.hidden || progress.complete) return null;

  const update = (next: ChecklistPrefs) => {
    setPrefs(next);
    saveChecklistPrefs(slug, next);
  };
  const open = !prefs.collapsed;

  return (
    <section className="k-fs k-card" aria-labelledby="k-fs-title">
      <header className="k-fs-head">
        <div className="k-fs-title">
          <h2 id="k-fs-title" className="k-title">
            Primeros pasos
          </h2>
          <span className="k-fs-count">
            {progress.done} de {progress.total}
          </span>
        </div>
        <div className="k-fs-tools">
          <button
            type="button"
            className="k-link k-small"
            aria-expanded={open}
            onClick={() => update({ ...prefs, collapsed: open })}
          >
            {open ? "Plegar" : "Desplegar"}
          </button>
          <button
            type="button"
            className="k-link k-small"
            onClick={() => update({ ...prefs, hidden: true })}
          >
            Ocultar
          </button>
        </div>
      </header>
      <progress className="k-fs-bar" max={progress.total} value={progress.done}>
        {progress.done} de {progress.total}
      </progress>
      {open ? (
        <ul className="k-fs-list">
          {items.map((item) => (
            <li key={item.id} className={item.done ? "is-done" : ""}>
              <span className="k-fs-mark" aria-hidden="true">
                {item.done ? "✓" : ""}
              </span>
              {can(item.permission) ? (
                <Link href={item.href} className="k-fs-link">
                  {item.label}
                </Link>
              ) : (
                <span className="k-fs-link">{item.label}</span>
              )}
              <span className="k-sr-only">{item.done ? " (hecho)" : " (pendiente)"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
