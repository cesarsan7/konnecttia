"use client";

import { BOARD_SOUND, type BoardSound } from "@konnecttia/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SOUND_TONES } from "@/lib/panel/sounds";

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

  const sing = useCallback((sound: BoardSound) => {
    const audio = context.current;
    if (!audio) return;
    const start = audio.currentTime;
    for (const tone of SOUND_TONES[sound]) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, start + tone.at);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + tone.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + tone.dur);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(start + tone.at);
      oscillator.stop(start + tone.at + tone.dur + 0.02);
    }
  }, []);

  /** Suena si el sonido está activado en este navegador. Sin argumento, la campana de siempre. */
  const play = useCallback(
    (sound: BoardSound = BOARD_SOUND.Bell) => {
      if (!enabledRef.current) return;
      sing(sound);
    },
    [sing],
  );

  /** Para probar un sonido desde Ajustes: va con un clic, así que el navegador lo permite. */
  const preview = useCallback(
    (sound: BoardSound) => {
      ensureContext();
      sing(sound);
    },
    [ensureContext, sing],
  );

  const toggle = useCallback(() => {
    if (enabledRef.current) {
      store(false);
      return;
    }
    ensureContext();
    store(true);
    play();
  }, [ensureContext, store, play]);

  return useMemo(() => ({ enabled, play, preview, toggle }), [enabled, play, preview, toggle]);
}
