/** Tipos de incidencia que el cliente puede abrir desde el seguimiento (pieza P). */
export const INCIDENT_OPTIONS = [
  { value: "falta_algo", label: "Falta algo" },
  { value: "llego_mal", label: "Llegó mal o en mal estado" },
  { value: "retraso", label: "Se está retrasando" },
  { value: "otro", label: "Otro problema" },
] as const;

export const INCIDENT_MIN = 3;
export const INCIDENT_MAX = 1000;

export type IncidentForm = {
  readonly tipo: string;
  readonly descripcion: string;
};

/** Mensaje de error del formulario, o `null` si se puede enviar. */
export function incidentFormError(form: IncidentForm): string | null {
  if (!INCIDENT_OPTIONS.some((option) => option.value === form.tipo)) {
    return "Elige qué ha pasado.";
  }
  const length = form.descripcion.trim().length;
  if (length < INCIDENT_MIN) return "Cuéntanos qué ha pasado, aunque sea en pocas palabras.";
  if (length > INCIDENT_MAX)
    return `El texto es demasiado largo (máximo ${INCIDENT_MAX} caracteres).`;
  return null;
}

/** Mensaje al fallar el envío, según la respuesta del servidor. */
export function incidentSendError(status: number, reason?: string): string {
  if (status === 429 && reason === "too_many_open") {
    return "Ya tienes varias incidencias abiertas en este pedido. El local las está revisando.";
  }
  if (status === 429) return "Demasiados intentos. Espera un momento.";
  if (status === 409) return "Este pedido ya no admite incidencias. Contacta con el local.";
  return "No hemos podido enviar la incidencia. Inténtalo de nuevo.";
}
