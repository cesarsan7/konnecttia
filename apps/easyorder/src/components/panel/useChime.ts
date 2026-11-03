"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "easyorder.panel.sonido";

/**
 * Aviso sonoro de pedido nuevo (dos notas, sintetizadas: sin archivos de audio). Los navegadores
 * solo dejan sonar audio después de un gesto del usuario, por eso hay un botón «Activar sonido».
 */
export function useChime() {
  const context = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const [enabled, setEnabled] = useState(false);

  const ensureContext = useCallback(() => {
    if (!context.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      context.current = new Ctor();
    }
    if (context.current.state === "suspended") void context.current.resume();
  }, []);

  const store = useCallback((value: boolean) => {
    enabledRef.current = value;
    setEnabled(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      // Sin almacenamiento (navegación privada): solo dura esta visita.
    }
  }, []);

  // Si ya se había activado, el sonido vuelve con el primer toque en la página.
  useEffect(() => {
    let remembered = false;
    try {
      remembered = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      remembered = false;
    }
    if (!remembered) return;
    const resume = () => {
      ensureContext();
      store(true);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    return () => window.removeEventListener("pointerdown", resume);
  }, [ensureContext, store]);

  const play = useCallback(() => {
    const audio = context.current;
    if (!enabledRef.current || !audio) return;
    const start = audio.currentTime;
    // Dos tonos ascendentes, dos veces: se oye en una cocina sin ser estridente.
    [0, 0.18, 0.6, 0.78].forEach((offset, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = index % 2 === 0 ? 880 : 1320;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.34);
    });
  }, []);

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      store(false);
      return;
    }
    ensureContext();
    store(true);
    play();
  }, [ensureContext, store, play]);

  return useMemo(() => ({ enabled, play, toggle }), [enabled, play, toggle]);
}
