/** Respuestas de GET /panel/:slug/ajustes (apps/api/src/routes/panel-settings.ts). */

export type OpenMode = "auto" | "abierto" | "cerrado";

export type Day = {
  readonly dia: string;
  readonly disponible: boolean;
  readonly apertura_1: string | null;
  readonly cierre_1: string | null;
  readonly apertura_2: string | null;
  readonly cierre_2: string | null;
};

export type BankDetails = {
  readonly titular?: string;
  readonly banco?: string;
  readonly iban?: string;
  readonly concepto?: string;
  readonly bizum?: string;
};

export type RestaurantSettings = {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly descripcion: string | null;
  readonly eslogan: string | null;
  readonly zona_horaria: string | null;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly metodos_pago: readonly string[];
  readonly datos_bancarios: BankDetails | null;
  readonly apertura_manual: OpenMode;
  readonly recogida_minutos: number | null;
  readonly reparto_minutos_min: number | null;
  readonly reparto_minutos_max: number | null;
  readonly modo_ocupado_opciones: readonly number[];
  readonly modo_ocupado_duracion_minutos: number | null;
};

export type BranchSettings = {
  readonly id: number;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly principal: boolean;
  readonly activo: boolean;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly apertura_manual: OpenMode;
  readonly horario_propio: readonly Day[] | null;
};

export type Holiday = {
  readonly id: number;
  readonly fecha: string;
  readonly nombre: string | null;
  readonly cerrado: boolean;
  readonly sucursal_id: number | null;
};

export type Settings = {
  readonly restaurante: RestaurantSettings;
  readonly horario: readonly Day[];
  readonly locales: readonly BranchSettings[];
  readonly festivos: readonly Holiday[];
  readonly metodos_disponibles: readonly string[];
  readonly edicion_completa: boolean;
};

export const PAYMENT_HINT: Readonly<Record<string, string>> = {
  efectivo: "Se paga al recoger o al repartidor.",
  tarjeta: "Datáfono en el local o en la entrega.",
  transferencia: "El pedido queda pendiente hasta que confirmes el cobro.",
  bizum: "El pedido queda pendiente hasta que confirmes el cobro.",
};

const SETTINGS_ERROR: Readonly<Record<string, string>> = {
  no_service: "Deja activa al menos la recogida o el reparto.",
  no_payment_method: "Elige al menos un método de pago.",
  transfer_without_iban: "Para aceptar transferencias, indica el IBAN y el titular.",
  invalid_iban: "El IBAN no es válido. Revisa los dígitos.",
  bizum_without_phone: "Para aceptar Bizum, indica el teléfono de Bizum.",
  min_over_max: "El tiempo mínimo de reparto no puede ser mayor que el máximo.",
  incomplete_shift: "Cada turno necesita hora de apertura y de cierre.",
  empty_shift: "La apertura y el cierre de un turno no pueden ser la misma hora.",
  second_without_first: "Rellena el primer turno antes que el segundo.",
  open_without_shift: "Un día abierto necesita al menos un turno.",
  principal_required: "El local principal no se puede desactivar.",
  lat_lng_together: "Indica latitud y longitud juntas.",
  duplicate_date: "Ya hay un festivo en esa fecha.",
  branch_scope_limited: "Tu usuario solo opera algunos locales: esto lo cambia el propietario.",
};

export function settingsErrorMessage(reason: string | undefined, field?: string): string {
  const base = reason ? SETTINGS_ERROR[reason] : undefined;
  if (base && field && /^[A-ZÁÉÍÓÚ]/.test(field)) return `${field}: ${base}`;
  return base ?? "No se pudo guardar. Revisa los datos e inténtalo de nuevo.";
}

/** «20» → 20; vacío → null; texto no numérico o fuera de rango → undefined (error). */
export function parseMinutes(text: string, max = 600): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= max ? minutes : undefined;
}

/** «10, 20,30» → [10, 20, 30] sin repetidos; undefined si algo no es válido. */
export function parseMinuteList(text: string): number[] | undefined {
  const parts = text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const values = parts.map((part) => parseMinutes(part, 240));
  if (values.some((value) => value === undefined || value === null)) return undefined;
  const unique = [...new Set(values as number[])].sort((a, b) => a - b);
  return unique.length <= 6 ? unique : undefined;
}

/** Copia el horario de un día al resto (la tarea más repetida al configurar). */
export function copyDayToAll(week: readonly Day[], from: string): Day[] {
  const source = week.find((day) => day.dia === from);
  if (!source) return [...week];
  return week.map((day) => ({ ...source, dia: day.dia }));
}

export function closedWeekFrom(week: readonly Day[]): Day[] {
  return week.map((day) => ({ ...day }));
}

/** Resumen de un día para la lista: «12:00–16:00 · 20:00–00:30» o «Cerrado». */
export function dayLabel(day: Day): string {
  if (!day.disponible || !day.apertura_1 || !day.cierre_1) return "Cerrado";
  const first = `${day.apertura_1}–${day.cierre_1}`;
  return day.apertura_2 && day.cierre_2 ? `${first} · ${day.apertura_2}–${day.cierre_2}` : first;
}

/** Fecha «2026-12-25» → «vie, 25 dic 2026» en español. */
export function holidayDate(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}
