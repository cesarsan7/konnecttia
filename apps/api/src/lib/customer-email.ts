/** Email del cliente en los eventos del outbox: solo si el pedido lo tiene. */
export function emailPayload(email: string | null | undefined): { email_cliente?: string } {
  return email ? { email_cliente: email } : {};
}

/**
 * Email para mostrarlo en el seguimiento público sin exponerlo entero: «j***@gmail.com». Quien
 * tiene el enlace puede ver a qué dirección se avisa, pero no leer la dirección completa.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
