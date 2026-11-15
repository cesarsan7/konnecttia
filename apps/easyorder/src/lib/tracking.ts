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

/** Un estado por el que pasó el pedido y cuándo (el seguimiento público lo devuelve en `historial`). */
export type StateEntry = { readonly estado: string; readonly desde: string };

/** Tiempos de un paso alcanzado: desde que llegó el pedido y desde el paso anterior (en minutos). */
export type StepTime = { readonly desdeLlegada: number; readonly desdeAnterior: number | null };

/** Minutos enteros entre dos instantes (nunca negativos). */
export function minutesBetween(from: string | number | Date, to: string | number | Date): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60_000)) : 0;
}

/** «menos de 1 min», «12 min», «1 h», «1 h 5 min». */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Tiempo de cada paso del seguimiento: minutos desde que llegó el pedido y desde el paso anterior
 * alcanzado. Un paso sin entrada en el historial (aún no llegó o se saltó) es `null`. «pagado» cuenta
 * como «confirmado», igual que en la pantalla de pasos.
 */
export function stepTimes(
  steps: readonly string[],
  historial: readonly StateEntry[],
  createdAt: string,
): readonly (StepTime | null)[] {
  const firstAt = new Map<string, string>();
  for (const entry of historial) {
    const estado = entry.estado === "pagado" ? "confirmado" : entry.estado;
    if (!firstAt.has(estado)) firstAt.set(estado, entry.desde);
  }
  let previous: string | null = null;
  return steps.map((step) => {
    // El primer paso es la llegada del pedido: sin historial, vale `createdAt`.
    const at = firstAt.get(step) ?? (step === "recibido" ? createdAt : undefined);
    if (at === undefined) return null;
    const time: StepTime = {
      desdeLlegada: minutesBetween(createdAt, at),
      desdeAnterior: previous === null ? null : minutesBetween(previous, at),
    };
    previous = at;
    return time;
  });
}
