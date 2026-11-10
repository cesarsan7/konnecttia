/** Respuesta de GET /panel/:slug/push (apps/api/src/routes/panel-push.ts). */
export type PushState = {
  readonly disponible: boolean;
  readonly clave_publica: string | null;
  readonly suscrito: boolean;
};

/** Lo que el navegador permite hacer con los avisos, para decidir qué mostrar. */
export type PushSupport = "ok" | "unsupported" | "denied" | "ios-install";

/** La clave VAPID llega en base64 URL-safe; `subscribe` la pide como bytes. */
export function urlBase64ToBytes(value: string): Uint8Array {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function pushSupport(env: {
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  readonly hasNotification: boolean;
  readonly permission: string;
  readonly isIos: boolean;
  readonly isStandalone: boolean;
}): PushSupport {
  // En iPhone/iPad los avisos solo funcionan con la app añadida a la pantalla de inicio.
  if (env.isIos && !env.isStandalone) return "ios-install";
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return "unsupported";
  if (env.permission === "denied") return "denied";
  return "ok";
}

export const PUSH_SUPPORT_TEXT: Readonly<Record<Exclude<PushSupport, "ok">, string>> = {
  unsupported:
    "Este navegador no permite avisos. Prueba con Chrome, Edge, Firefox o Safari reciente.",
  denied:
    "Bloqueaste los avisos de esta web. Actívalos en los permisos del navegador y vuelve a intentarlo.",
  "ios-install":
    "En iPhone: pulsa Compartir → «Añadir a pantalla de inicio», abre EasyOrder desde ese icono y activa los avisos allí.",
};
