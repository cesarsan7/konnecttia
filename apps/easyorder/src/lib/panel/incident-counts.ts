import { useSyncExternalStore } from "react";
import type { IncidentCounts } from "./sounds";

/**
 * Cifras de incidencias y derivaciones abiertas, compartidas por quien las consulta (el aviso del
 * panel) y por quien las muestra (el número del menú). Sin dependencias: un almacén mínimo.
 */
const EMPTY: IncidentCounts = { incidencias: 0, derivaciones: 0 };
let current: IncidentCounts = EMPTY;
const listeners = new Set<() => void>();

export function setIncidentCounts(next: IncidentCounts) {
  if (next.incidencias === current.incidencias && next.derivaciones === current.derivaciones) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}

export const resetIncidentCounts = () => setIncidentCounts(EMPTY);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useIncidentTotal(): number {
  return useSyncExternalStore(
    subscribe,
    () => current.incidencias + current.derivaciones,
    () => 0,
  );
}
