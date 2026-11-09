/** Estados en los que el pedido ya no cambia: dejan de refrescarse y no se avisa de «no cierres». */
export const CLOSED_STATES: ReadonlySet<string> = new Set(["entregado", "cancelado", "expirado"]);

export function isClosed(estado: string): boolean {
  return CLOSED_STATES.has(estado);
}

/** Lo mínimo que usamos del portapapeles del navegador (facilita probarlo). */
export type ClipboardLike = { writeText(text: string): Promise<void> };

/** Copia el texto; devuelve `false` si el navegador no lo permite (HTTP, permisos, sin soporte). */
export async function copyText(
  text: string,
  clipboard: ClipboardLike | undefined,
): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Texto de «Contactar con el local» cuando el pedido ya no se puede cancelar desde el seguimiento. */
export function contactHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 6 ? `tel:${digits}` : null;
}
