/** Incidencias del cliente sobre su pedido (pieza P): GET /panel/:slug/incidencias. */
export type Incident = {
  readonly id: number;
  readonly pedido_id: number;
  readonly pedido_codigo: string | null;
  readonly tipo: string;
  readonly descripcion: string;
  readonly estado: "abierta" | "resuelta";
  readonly nota_resolucion: string | null;
  readonly resuelta_por: string | null;
  readonly resuelta_at: string | null;
  readonly created_at: string;
  readonly tipo_despacho: string | null;
  readonly pedido_estado: string;
  readonly nombre_pedido: string | null;
  readonly telefono: string;
  readonly local_nombre: string | null;
  readonly mesero_nombre: string | null;
  readonly repartidor_nombre: string | null;
};

export type IncidentList = {
  readonly incidencias: readonly Incident[];
  readonly total: number;
  readonly abiertas: number;
  readonly pagina: number;
  readonly por_pagina: number;
};

export const INCIDENT_LABEL: Readonly<Record<string, string>> = {
  falta_algo: "Falta algo",
  llego_mal: "Llegó mal",
  retraso: "Retraso",
  otro: "Otro",
};

export function incidentLabel(tipo: string): string {
  return INCIDENT_LABEL[tipo] ?? tipo;
}

/** Quién repartió o atendió el pedido, para seguir la incidencia. Vacío si no consta. */
export function incidentHandler(
  incident: Pick<Incident, "repartidor_nombre" | "mesero_nombre">,
): string | null {
  if (incident.repartidor_nombre?.trim()) return `Repartió: ${incident.repartidor_nombre.trim()}`;
  if (incident.mesero_nombre?.trim()) return `Atendió: ${incident.mesero_nombre.trim()}`;
  return null;
}

export function incidentError(status: number): string {
  if (status === 403) return "Tu usuario no puede resolver incidencias.";
  if (status === 404) return "Esa incidencia ya no está disponible.";
  return "No se pudo guardar. Inténtalo de nuevo.";
}
