"use client";

import "./tour.css";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { helpPath } from "@/lib/ayuda/slugs";
import type { PanelAccess } from "@/lib/panel/types";
import { tourFor } from "@/lib/tour/steps";
import {
  availableSteps,
  browserStorage,
  hasSeenTour,
  isSettled,
  markTourSeen,
  presentSteps,
  sectionFromPath,
  type TourStep,
} from "@/lib/tour/tour";
import { usePanel } from "../PanelProvider";
import { stepExists } from "./dom";
import { Tour } from "./Tour";

/** Cada cuánto se mira si la pantalla ya cargó lo que la guía señala. */
const POLL_MS = 250;
/** Máximo de lecturas (unos 10 s) antes de arrancar con lo que haya o rendirse. */
const MAX_POLLS = 40;

/**
 * Barra superior del panel con el botón «?» (relanza la guía de la pantalla) y el enlace a la
 * ayuda de la sección. La primera vez que una persona entra en cada sección, en este navegador,
 * la guía arranca sola cuando la pantalla ha terminado de cargar.
 */
export function PanelGuide({
  slug,
  access,
}: {
  readonly slug: string;
  readonly access: PanelAccess;
}) {
  const pathname = usePathname();
  const { session } = usePanel();
  const [running, setRunning] = useState<readonly TourStep[] | null>(null);
  // Secciones lanzadas en esta visita: evita repetirlas si el navegador no guarda nada.
  const launched = useRef<Set<string>>(new Set());

  const section = sectionFromPath(pathname, slug);
  const definition = section ? tourFor(section) : undefined;
  const userId = session?.user.id ?? access.usuario.email ?? "anonimo";

  const steps = useMemo(() => {
    if (!definition) return [];
    const granted = new Set(access.permisos);
    return availableSteps(definition.steps, {
      can: (permission) => granted.has(permission),
      modules: access.modulos,
    });
  }, [definition, access.permisos, access.modulos]);

  useEffect(() => {
    // Al cambiar de sección se cierra la guía de la anterior.
    setRunning(null);
    if (!section || steps.length === 0) return;
    const storage = browserStorage();
    const key = `${userId}:${section}`;
    if (launched.current.has(key) || hasSeenTour(storage, userId, section)) return;
    const samples: number[] = [];
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      const present = presentSteps(steps, stepExists);
      samples.push(present.length);
      if (isSettled(samples) || (polls >= MAX_POLLS && present.length > 0)) {
        window.clearInterval(timer);
        launched.current.add(key);
        markTourSeen(storage, userId, section);
        setRunning(present);
      } else if (polls >= MAX_POLLS) {
        // No cargó nada que señalar: se reintenta en la próxima visita.
        window.clearInterval(timer);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [section, steps, userId]);

  const start = useCallback(() => {
    const present = presentSteps(steps, stepExists);
    if (present.length > 0) setRunning(present);
  }, [steps]);
  const close = useCallback(() => setRunning(null), []);

  const label = definition?.label ?? "el panel";
  return (
    <>
      <div className="k-topbar">
        {steps.length > 0 ? (
          <button
            type="button"
            className="k-topbar-btn"
            onClick={start}
            aria-haspopup="dialog"
            aria-label={`Ver la guía de ${label}`}
          >
            <span className="k-topbar-q" aria-hidden="true">
              ?
            </span>
            <span>Guía</span>
          </button>
        ) : null}
        <a
          className="k-topbar-btn k-topbar-link"
          href={helpPath(definition?.help)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Abrir la ayuda${definition ? ` de ${label}` : ""} en otra pestaña`}
        >
          Ayuda
        </a>
      </div>
      {running && running.length > 0 ? (
        <Tour steps={running} label={label} helpHref={helpPath(definition?.help)} onClose={close} />
      ) : null}
    </>
  );
}
