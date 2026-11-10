import webpush from "web-push";

/**
 * Envío de Web Push con claves VAPID. Las claves vienen del entorno, nunca de archivos. Un envío
 * devuelve `gone` cuando el servicio push dice que la suscripción ya no existe (404/410): quien
 * llama la borra.
 */

export type PushTarget = {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
};

export type PushPayload = {
  readonly title: string;
  readonly body: string;
  /** Ruta a abrir al tocar el aviso. */
  readonly url: string;
  /** Misma etiqueta = el aviso nuevo sustituye al anterior. */
  readonly tag?: string;
};

export type PushResult = "sent" | "gone" | "error";

export type PushSender = {
  readonly publicKey: string;
  readonly send: (target: PushTarget, payload: PushPayload) => Promise<PushResult>;
};

export function createPushSender(keys: {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}): PushSender {
  const details = {
    vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
  };
  return {
    publicKey: keys.publicKey,
    send: async (target, payload) => {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "high", vapidDetails: details.vapidDetails },
        );
        return "sent";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? "gone" : "error";
      }
    },
  };
}

/** Un endpoint de Web Push siempre es https; evita que se guarde una URL arbitraria. */
export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 2000;
  } catch {
    return false;
  }
}
