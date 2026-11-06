"use client";

import { useEffect, useRef } from "react";
import { TURNSTILE_SCRIPT_URL } from "@/lib/turnstile";
import "./turnstile.css";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Carga el script de Cloudflare una sola vez por página. Si falla, se podrá reintentar. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile no disponible"));
    script.onerror = () => reject(new Error("No se pudo cargar Turnstile"));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

type Props = {
  readonly siteKey: string;
  /** Recibe el token (un solo uso) o null cuando caduca o falla. */
  readonly onToken: (token: string | null) => void;
  readonly onLoadError: () => void;
  /** Al cambiar, pide un token nuevo (el anterior ya se gastó en un intento de envío). */
  readonly resetKey: number;
};

/**
 * Captcha invisible de Turnstile: solo se ve un desafío si Cloudflare duda del navegador
 * (`appearance: interaction-only`). Los fallos se comunican con `onToken(null)`.
 */
export function TurnstileWidget({ siteKey, onToken, onLoadError, resetKey }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onLoadError });
  callbacks.current = { onToken, onLoadError };

  useEffect(() => {
    let cancelled = false;
    const target = container.current;
    if (!target) return;
    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId.current = api.render(target, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: (token: string) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => callbacks.current.onToken(null),
          "timeout-callback": () => callbacks.current.onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) callbacks.current.onLoadError();
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey]);

  // Cada reintento de envío necesita un token nuevo.
  useEffect(() => {
    if (resetKey > 0 && widgetId.current && window.turnstile) {
      callbacks.current.onToken(null);
      window.turnstile.reset(widgetId.current);
    }
  }, [resetKey]);

  return <div ref={container} className="turnstile-slot" />;
}
