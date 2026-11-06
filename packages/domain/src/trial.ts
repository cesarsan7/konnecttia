/** Estado de la prueba gratuita de un restaurante (`restaurante_prueba.estado`). */
export const TRIAL_STATE = {
  /** Espera la aprobación de Konnecttia; no acepta pedidos. */
  Pending: "pendiente",
  /** Acepta pedidos hasta que venza por fecha o por pedidos. */
  Active: "activa",
  /** Pasó a un plan de pago. */
  Converted: "convertida",
  /** Konnecttia no la aprobó; no acepta pedidos. */
  Rejected: "rechazada",
} as const;

export type TrialState = (typeof TRIAL_STATE)[keyof typeof TRIAL_STATE];

export function isTrialState(value: string): value is TrialState {
  return (Object.values(TRIAL_STATE) as string[]).includes(value);
}

const DAY_MS = 86_400_000;

/**
 * Días que le quedan a una prueba, redondeados hacia arriba (un día empezado cuenta entero).
 * `null` si no tiene fecha de fin; 0 si ya venció.
 */
export function trialDaysLeft(end: Date | null, now: Date): number | null {
  if (end === null) return null;
  const left = end.getTime() - now.getTime();
  return left <= 0 ? 0 : Math.ceil(left / DAY_MS);
}

/** Pedidos que le quedan a una prueba. `null` si no tiene límite; nunca negativo. */
export function trialOrdersLeft(max: number | null, used: number): number | null {
  if (max === null) return null;
  return Math.max(0, max - used);
}

/** Fecha de fin de una prueba que empieza en `start` y dura `days` (`null` = sin límite). */
export function trialEnd(start: Date, days: number | null): Date | null {
  return days === null ? null : new Date(start.getTime() + days * DAY_MS);
}

/**
 * Nueva fecha de fin al aprobar una prueba pendiente: la prueba empieza al aprobarse y dura lo
 * mismo que se le concedió al crearla (`end - start`). Sin fecha de fin, sigue sin ella.
 */
export function trialEndOnApproval(start: Date, end: Date | null, approvedAt: Date): Date | null {
  if (end === null) return null;
  return new Date(approvedAt.getTime() + Math.max(0, end.getTime() - start.getTime()));
}
