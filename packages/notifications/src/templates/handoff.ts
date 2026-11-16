import { escapeHtml } from "../mailer";

const REASON_LABEL: Readonly<Record<string, string>> = {
  reclamo: "Reclamo",
  cancelacion: "Cancelación",
  modificacion_pedido: "Cambio en un pedido",
  pide_persona: "Pide hablar con una persona",
  error_sistema: "Problema técnico",
  otro: "Otro motivo",
};

/** Aviso al restaurante de que el agente de WhatsApp derivó una conversación a una persona. */
export function handoffEmail(input: {
  readonly restaurante: string;
  readonly motivo: string;
  readonly telefono: string;
  readonly resumen: string;
  readonly link: string | null;
}) {
  const motivo = REASON_LABEL[input.motivo] ?? input.motivo;
  const subject = `${motivo}: un cliente necesita atención en ${input.restaurante}`;
  const text = [
    `El agente de WhatsApp de ${input.restaurante} ha pasado una conversación a una persona.`,
    "",
    `Motivo: ${motivo}`,
    `Cliente: ${input.telefono}`,
    `Resumen: ${input.resumen}`,
    ...(input.link ? ["", `Abrir el panel: ${input.link}`] : []),
    "",
    "El agente no seguirá la conversación hasta que pase el tiempo de pausa configurado.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#fbf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0e2a33">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0e2a33;padding:20px 28px;color:#fbf7f1;font-size:20px;font-weight:800">EasyOrder</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px">Un cliente necesita atención</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4e6168">
            El agente de WhatsApp de <strong style="color:#0e2a33">${escapeHtml(input.restaurante)}</strong>
            ha pasado una conversación a una persona.
          </p>
          <p style="margin:0 0 6px;font-size:15px"><strong>Motivo:</strong> ${escapeHtml(motivo)}</p>
          <p style="margin:0 0 6px;font-size:15px"><strong>Cliente:</strong> ${escapeHtml(input.telefono)}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6"><strong>Resumen:</strong> ${escapeHtml(input.resumen)}</p>
          ${
            input.link
              ? `<p style="margin:0 0 20px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#ff6a4d;color:#0e2a33;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Abrir el panel</a></p>`
              : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
