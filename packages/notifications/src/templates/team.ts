import { escapeHtml } from "../mailer";

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

/** Email para crear una contraseña nueva (pedido desde «¿Olvidaste tu contraseña?»). */
export function recoveryEmail(input: { readonly link: string }) {
  const link = escapeHtml(input.link);
  const subject = "Crea una contraseña nueva para EasyOrder";
  const text = [
    "Has pedido crear una contraseña nueva para entrar en el panel de EasyOrder.",
    "",
    `Abre este enlace para elegirla (caduca pronto y vale una vez): ${input.link}`,
    "",
    "Si no lo has pedido tú, ignora este email: tu contraseña no cambia.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#fbf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0e2a33">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0e2a33;padding:20px 28px;color:#fbf7f1;font-size:20px;font-weight:800">EasyOrder</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px">Crea una contraseña nueva</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4e6168">
            Has pedido cambiar la contraseña del panel de EasyOrder. Pulsa el botón y elige una nueva.
          </p>
          <p style="margin:0 0 20px">
            <a href="${link}" style="display:inline-block;background:#ff6a4d;color:#0e2a33;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">Crear contraseña</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#4e6168">
            El enlace caduca pronto y solo vale una vez.<br>
            Si el botón no funciona, copia esta dirección: <span style="word-break:break-all">${link}</span>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e6dccf;font-size:12px;color:#4e6168">
          Si no lo has pedido tú, ignora este email: tu contraseña no cambia.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
