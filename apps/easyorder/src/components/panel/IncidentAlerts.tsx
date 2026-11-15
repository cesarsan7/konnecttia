"use client";

import { BOARD_SOUND, type BoardSounds, DEFAULT_BOARD_SOUNDS } from "@konnecttia/domain";
import { useEffect, useRef } from "react";
import { resetIncidentCounts, setIncidentCounts } from "@/lib/panel/incident-counts";
import { type IncidentCounts, incidentEvents } from "@/lib/panel/sounds";
import { usePanel } from "./PanelProvider";
import { useChime } from "./useChime";

const POLL_MS = 30_000;

/**
 * Consulta cada 30 s cuántas incidencias y derivaciones hay abiertas, deja la cifra al menú y suena
 * cuando sube (con el sonido que el restaurante eligió en Ajustes → Sonidos). No pinta nada.
 */
export function IncidentAlerts({ slug }: { slug: string }) {
  const { api } = usePanel();
  const chime = useChime();
  const playRef = useRef(chime.play);
  playRef.current = chime.play;

  useEffect(() => {
    let alive = true;
    let previous: IncidentCounts | null = null;
    let sounds: BoardSounds = DEFAULT_BOARD_SOUNDS;

    const load = async () => {
      if (document.visibilityState === "hidden") return;
      const result = await api.incidentSummary(slug);
      if (!alive || !result.ok) return;
      const next = result.data;
      const first = incidentEvents(previous, next).find(
        (event) => sounds[event] !== BOARD_SOUND.None,
      );
      if (first) playRef.current(sounds[first]);
      previous = next;
      setIncidentCounts(next);
    };

    void (async () => {
      const result = await api.boardSounds(slug);
      if (alive && result.ok) sounds = result.data.sonidos;
      await load();
    })();
    const timer = window.setInterval(load, POLL_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      resetIncidentCounts();
    };
  }, [api, slug]);

  return null;
}
