/**
 * Horarios de apertura. Fuente única de zona horaria: `restaurante.zona_horaria`.
 * Compatible con la tabla `horarios` de EasyOrder (día en español, dos turnos, cruces de medianoche).
 */

export const WEEKDAYS_ES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export type WeekdayEs = (typeof WEEKDAYS_ES)[number];

export type DaySchedule = {
  readonly dia: string;
  readonly disponible: boolean;
  /** "HH:MM" o "HH:MM:SS" */
  readonly apertura_1: string | null;
  readonly cierre_1: string | null;
  readonly apertura_2: string | null;
  readonly cierre_2: string | null;
};

/** Apertura o cierre forzado desde el panel (`is_open_override`). `null` = seguir el horario. */
export type OpenOverride = boolean | null;

type LocalTime = { readonly weekdayIndex: number; readonly minutes: number };

function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function normalizeDay(day: string): string {
  return day
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function localTime(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    weekdayIndex: weekdays.indexOf(value("weekday")),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function findDay(schedule: readonly DaySchedule[], weekdayIndex: number): DaySchedule | undefined {
  const name = normalizeDay(WEEKDAYS_ES[(weekdayIndex + 7) % 7] ?? "");
  return schedule.find((day) => normalizeDay(day.dia) === name);
}

function slots(day: DaySchedule | undefined): { open: number; close: number }[] {
  if (!day?.disponible) {
    return [];
  }
  const result: { open: number; close: number }[] = [];
  for (const [open, close] of [
    [day.apertura_1, day.cierre_1],
    [day.apertura_2, day.cierre_2],
  ] as const) {
    if (open && close) {
      result.push({ open: toMinutes(open), close: toMinutes(close) });
    }
  }
  return result;
}

/**
 * ¿Está abierto el local en ese instante?
 * Un turno que cruza la medianoche (22:00–02:00) cuenta para el día en que empieza.
 */
export function isOpenAt(
  schedule: readonly DaySchedule[],
  timeZone: string,
  instant: Date,
  override: OpenOverride = null,
): boolean {
  if (override !== null) {
    return override;
  }
  const { weekdayIndex, minutes } = localTime(instant, timeZone);

  for (const slot of slots(findDay(schedule, weekdayIndex))) {
    if (slot.close > slot.open) {
      if (minutes >= slot.open && minutes < slot.close) return true;
    } else if (minutes >= slot.open) {
      return true;
    }
  }
  // Madrugada: turno de ayer que cruzó la medianoche.
  for (const slot of slots(findDay(schedule, weekdayIndex - 1))) {
    if (slot.close <= slot.open && minutes < slot.close) return true;
  }
  return false;
}
