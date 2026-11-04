import type { Mailer } from "../context";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Envío de emails con Resend (la misma cuenta que usaba la versión antigua de EasyOrder y el
 * formulario de demo de la landing). La clave solo vive en las variables de entorno de la API.
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Email de invitación al equipo de un restaurante. */
export function inviteEmail(input: {
  readonly restaurante: string;
  readonly rol: string;
  readonly link: string;
  readonly dias: number;
}) {
  const restaurante = escapeHtml(input.restaurante);
  const rol = escapeHtml(input.rol.toLowerCase());
  const link = escapeHtml(input.link);
  const subject = `Te han invitado al panel de ${input.restaurante} en EasyOrder`;
  const text = [
    `Te han invitado al panel de ${input.restaurante} en EasyOrder como ${input.rol.toLowerCase()}.`,
    "",
    `Entra con este enlace (caduca en ${input.dias} días): ${input.link}`,
    "",
    "Si no esperabas esta invitación, ignora este email.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#fbf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0e2a33">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0e2a33;padding:20px 28px;color:#fbf7f1;font-size:20px;font-weight:800">EasyOrder</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px">Te han invitado a ${restaurante}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4e6168">
            Entra al panel del restaurante como <strong style="color:#0e2a33">${rol}</strong>.
            Al abrir el enlace podrás entrar con tu cuenta o crear una.
          </p>
          <p style="margin:0 0 20px">
            <a href="${link}" style="display:inline-block;background:#ff6a4d;color:#0e2a33;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Aceptar invitación</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#4e6168">
            El enlace es personal y caduca en ${input.dias} días.<br>
            Si el botón no funciona, copia esta dirección: <span style="word-break:break-all">${link}</span>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e6dccf;font-size:12px;color:#4e6168">
          Si no esperabas esta invitación, ignora este email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
