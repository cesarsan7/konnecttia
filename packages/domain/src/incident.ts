import { ORDER_STATUS } from "./order-status";

/** Tipos de incidencia que el cliente puede abrir sobre su pedido (pieza P). */
export const INCIDENT_TYPE = {
  Missing: "falta_algo",
  Wrong: "llego_mal",
  Delay: "retraso",
  Other: "otro",
} as const;

export type IncidentType = (typeof INCIDENT_TYPE)[keyof typeof INCIDENT_TYPE];

export const INCIDENT_TYPES: readonly IncidentType[] = Object.values(INCIDENT_TYPE);

export const INCIDENT_STATUS = { Open: "abierta", Resolved: "resuelta" } as const;

export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];

/** Tope de incidencias abiertas por pedido: evita que un enlace se use para inundar al local. */
export const MAX_OPEN_INCIDENTS_PER_ORDER = 3;

export const INCIDENT_TEXT_MAX = 1000;
export const INCIDENT_NOTE_MAX = 500;

/**
 * ¿Se puede abrir una incidencia sobre un pedido en este estado? Sí mientras exista de verdad para
 * el local: desde que se recibe hasta después de entregado. No en un carrito sin enviar, ni en un
 * pedido cancelado o expirado (para eso no hay nada que reclamar).
 */
export function canReportIncident(estado: string): boolean {
  return (
    estado !== ORDER_STATUS.InCart &&
    estado !== ORDER_STATUS.Cancelled &&
    estado !== ORDER_STATUS.Expired
  );
}
