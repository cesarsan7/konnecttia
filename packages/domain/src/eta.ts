import { localTime, WEEKDAYS_ES } from "./schedule";

/**
 * Tiempo estimado variable: base configurada + ajustes. Todos los valores vienen de la base
 * de datos; aquí solo está la regla de cálculo.
 */

export const ETA_SERVICE = { Pickup: "recogida", Delivery: "reparto", Both: "ambos" } as const;
export type EtaService = typeof ETA_SERVICE.Pickup | typeof ETA_SERVICE.Delivery;
type EtaScope = (typeof ETA_SERVICE)[keyof typeof ETA_SERVICE];

export type EtaRange = { readonly min: number; readonly max: number };

/** Franja de hora punta recurrente. `day` null = todos los días. */
export type PeakWindow = {
  readonly day: string | null;
  /** "HH:MM"; si `to` <= `from`, la franja cruza la medianoche. */
  readonly from: string;
  readonly to: string;
  readonly service: EtaScope;
  readonly extraMinutes: number;
};

/** «Modo ocupado» activado desde el panel, hasta una hora concreta. */
export type BusyMode = {
  readonly service: EtaScope;
  readonly extraMinutes: number;
  readonly until: Date;
};

/** Ajuste por carga: minutos por cada pedido activo por encima de un umbral. */
export type QueueRule = {
  readonly minutesPerOrder: number;
  readonly freeOrders: number;
};

export type EtaAdjustments = {
  readonly peaks?: readonly PeakWindow[];
  readonly busy?: readonly BusyMode[];
  readonly queue?: QueueRule | null;
  readonly activeOrders?: number;
};

const applies = (scope: EtaScope, service: EtaService) =>
  scope === ETA_SERVICE.Both || scope === service;

const toMinutes = (time: string) => {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
};

const normalize = (day: string) =>
  day
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

function inWindow(window: PeakWindow, weekdayIndex: number, minutes: number): boolean {
  const from = toMinutes(window.from);
  const to = toMinutes(window.to);
  const dayName = (index: number) => normalize(WEEKDAYS_ES[(index + 7) % 7] ?? "");
  const dayMatches = (index: number) =>
    window.day === null || normalize(window.day) === dayName(index);
  if (to > from) return dayMatches(weekdayIndex) && minutes >= from && minutes < to;
  // Cruza la medianoche: cuenta para el día en que empieza.
  return (
    (dayMatches(weekdayIndex) && minutes >= from) || (dayMatches(weekdayIndex - 1) && minutes < to)
  );
}

/** Minutos extra que tocan ahora: la franja punta mayor + el modo ocupado mayor + la cola. */
export function extraMinutes(
  service: EtaService,
  adjustments: EtaAdjustments,
  now: Date,
  timeZone: string,
): number {
  const { weekdayIndex, minutes } = localTime(now, timeZone);
  const peak = Math.max(
    0,
    ...(adjustments.peaks ?? [])
      .filter(
        (window) => applies(window.service, service) && inWindow(window, weekdayIndex, minutes),
      )
      .map((window) => window.extraMinutes),
  );
  const busy = Math.max(
    0,
    ...(adjustments.busy ?? [])
      .filter((mode) => applies(mode.service, service) && mode.until.getTime() > now.getTime())
      .map((mode) => mode.extraMinutes),
  );
  const queue = adjustments.queue
    ? Math.max(0, (adjustments.activeOrders ?? 0) - adjustments.queue.freeOrders) *
      adjustments.queue.minutesPerOrder
    : 0;
  return Math.max(0, Math.round(peak + busy + queue));
}

/** Suma los ajustes a la base. Sin base configurada no se inventa un tiempo: `null`. */
export function adjustEta(
  base: EtaRange | null,
  service: EtaService,
  adjustments: EtaAdjustments,
  now: Date,
  timeZone: string,
): EtaRange | null {
  if (!base) return null;
  const extra = extraMinutes(service, adjustments, now, timeZone);
  return { min: base.min + extra, max: base.max + extra };
}

export function formatEtaRange(range: EtaRange | null): string | null {
  if (!range) return null;
  return range.min === range.max ? `${range.min} min` : `${range.min}-${range.max} min`;
}
