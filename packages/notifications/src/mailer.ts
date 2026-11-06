/** Un email listo para enviar (el remitente lo pone el adaptador). */
export type MailMessage = {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

/** Envío de emails (Resend). */
export type Mailer = {
  readonly send: (message: MailMessage) => Promise<void>;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Envío de emails con Resend (la misma cuenta que usaba la versión antigua de EasyOrder y el
 * formulario de demo de la landing). La clave solo vive en las variables de entorno del servicio
 * que envía (API o worker).
 */
export function createResendMailer(
  apiKey: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    send: async (message) => {
      const response = await fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, ...message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        // El cuerpo de error de Resend no incluye la clave; se guarda solo el código.
        throw new Error(`Resend respondió ${response.status}`);
      }
    },
  };
}

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
