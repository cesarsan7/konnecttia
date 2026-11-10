"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PUSH_SUPPORT_TEXT,
  type PushState,
  type PushSupport,
  pushSupport,
  urlBase64ToBytes,
} from "@/lib/panel/push";
import { Icon } from "./Icon";
import { usePanel } from "./PanelProvider";
import { useAccess } from "./PanelShell";

function detectSupport(): PushSupport {
  const ua = navigator.userAgent;
  return pushSupport({
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "denied",
    isIos: /iPad|iPhone|iPod/.test(ua),
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true,
  });
}

/**
 * «Activar avisos»: el navegador avisa de cada pedido nuevo aunque el tablero esté cerrado. Cada
 * persona y cada dispositivo lo activa por su cuenta. No aparece si la plataforma no tiene claves.
 */
export function PushToggle() {
  const { api } = usePanel();
  const { slug } = useAccess();
  const [state, setState] = useState<PushState | null>(null);
  const [support, setSupport] = useState<PushSupport>("ok");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.pushState(slug);
    if (result.ok) setState(result.data);
  }, [api, slug]);

  useEffect(() => {
    setSupport(detectSupport());
    void load();
  }, [load]);

  if (!state?.disponible || !state.clave_publica) return null;
  const key = state.clave_publica;

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setSupport(detectSupport());
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(key) as BufferSource,
        }));
      const saved = await api.pushSubscribe(slug, subscription.toJSON());
      if (!saved.ok) throw new Error("save");
      await load();
    } catch {
      setMessage("No se pudieron activar los avisos. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.pushUnsubscribe(slug, subscription.endpoint);
        await subscription.unsubscribe();
      }
      await load();
    } catch {
      setMessage("No se pudieron desactivar los avisos. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (support !== "ok") {
    return (
      <p className="k-note" role="note">
        {PUSH_SUPPORT_TEXT[support]}
      </p>
    );
  }
  return (
    <>
      <button
        type="button"
        className={`k-btn k-btn-secondary k-btn-sm${state.suscrito ? "" : " is-attention"}`}
        onClick={state.suscrito ? disable : enable}
        disabled={busy}
        aria-pressed={state.suscrito}
        title="Aviso en el móvil o el ordenador cuando llega un pedido, aunque el tablero esté cerrado"
      >
        <Icon name={state.suscrito ? "bell" : "bellOff"} size={18} />
        {state.suscrito ? "Avisos activados" : "Activar avisos"}
      </button>
      {message ? (
        <span className="k-note" role="alert">
          {message}
        </span>
      ) : null}
    </>
  );
}
