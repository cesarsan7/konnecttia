/** Respuestas de la ficha de actividad (apps/api/src/routes/panel-activity.ts). */

export type ActivityDriver = {
  readonly membership_id: number;
  readonly nombre: string | null;
  readonly email: string | null;
};

export type ActivityWaiter = {
  readonly id: number;
  readonly nombre: string;
  readonly activo: boolean;
  readonly sucursal_id: number | null;
  readonly membership_id: number | null;
};

export type ActivityPeople = {
  readonly repartidores: readonly ActivityDriver[];
  readonly meseros: readonly ActivityWaiter[];
};

export type DriverActivity = {
  readonly persona: {
    readonly membership_id: number;
    readonly nombre: string | null;
    readonly email: string | null;
  };
  readonly resumen: {
    readonly repartos: number;
    readonly entregados: number;
    readonly cancelados: number;
    readonly en_curso: number;
    readonly importe_entregado: number;
    readonly por_cobrar: number;
    readonly min_hasta_salida: number | null;
    readonly min_en_ruta: number | null;
  };
  readonly repartos: readonly {
    readonly id: number;
    readonly pedido_codigo: string | null;
    readonly estado: string;
    readonly estado_pago: string;
    readonly metodo_pago: string | null;
    readonly total: number;
    readonly direccion: string | null;
    readonly local_nombre: string | null;
    readonly asignado_por: string;
    readonly asignado_at: string;
    readonly salida_at: string | null;
    readonly entregado_at: string | null;
    readonly fotos_entrega: number;
  }[];
  readonly truncado: boolean;
};

export type WaiterActivity = {
  readonly persona: { readonly id: number; readonly nombre: string; readonly activo: boolean };
  readonly resumen: {
    readonly pedidos: number;
    readonly mesas: number;
    readonly importe: number;
    readonly cancelados: number;
  };
  readonly pedidos: readonly {
    readonly id: number;
    readonly pedido_codigo: string | null;
    readonly estado: string;
    readonly metodo_pago: string | null;
    readonly total: number;
    readonly mesa_numero: string | null;
    readonly local_nombre: string | null;
    readonly created_at: string;
  }[];
  readonly truncado: boolean;
};

/** Quién llevó o atendió un pedido y por qué estados pasó. */
export type OrderTrace = {
  readonly pedido: { readonly id: number; readonly codigo: string | null; readonly estado: string };
  readonly repartidor: {
    readonly membership_id: number;
    readonly nombre: string | null;
    readonly asignado_por: string;
    readonly asignado_at: string;
    readonly salida_at: string | null;
    readonly entregado_at: string | null;
    readonly fotos_entrega: number;
  } | null;
  readonly mesero: {
    readonly id: number;
    readonly nombre: string | null;
    readonly mesa: string | null;
  } | null;
  readonly historial: readonly {
    readonly estado_anterior: string | null;
    readonly estado_nuevo: string;
    readonly origen: string;
    readonly actor: string | null;
    readonly motivo: string | null;
    readonly created_at: string;
  }[];
};

/** Fecha y hora corta («03/11 14:05») en la zona del restaurante; «—» si no hay. */
export function formatMoment(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    (parts.find((part) => part.type === type)?.value ?? "").padStart(2, "0");
  // Algunos motores dan «24» a medianoche: se normaliza a «00».
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("day")}/${get("month")} ${hour}:${get("minute")}`;
}

/** Texto de quién hizo cada paso del historial: el actor, o el origen si no consta. */
export function actorLabel(entry: { readonly actor: string | null; readonly origen: string }) {
  return entry.actor ?? (entry.origen === "trigger" ? "Sistema" : entry.origen);
}

/** Minutos entre dos instantes (null si falta alguno o van al revés). */
export function minutesBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.round(ms / 60_000) : null;
}

export function activityErrorMessage(status: number): string {
  if (status === 400) return "Revisa las fechas: el rango no es válido.";
  if (status === 403) return "Tu usuario no tiene acceso a este restaurante.";
  if (status === 404) return "No encontramos esa persona o no puedes ver su actividad.";
  return "No se pudo cargar la actividad. Inténtalo de nuevo.";
}
