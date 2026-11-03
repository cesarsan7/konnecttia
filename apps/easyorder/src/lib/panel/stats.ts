/** Utilidades de la pantalla de estadísticas: rangos de fechas y variaciones. */

export type RangePreset = "hoy" | "7d" | "30d" | "mes";

export const RANGE_PRESETS: readonly { id: RangePreset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
];

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del restaurante. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shift(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function presetRange(
  preset: RangePreset,
  timeZone: string,
  now: Date = new Date(),
): { desde: string; hasta: string } {
  const today = todayIn(timeZone, now);
  switch (preset) {
    case "hoy":
      return { desde: today, hasta: today };
    case "7d":
      return { desde: shift(today, -6), hasta: today };
    case "30d":
      return { desde: shift(today, -29), hasta: today };
    case "mes":
      return { desde: `${today.slice(0, 8)}01`, hasta: today };
  }
}

/** Variación porcentual frente al periodo anterior; null si no hay base para comparar. */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function formatChange(value: number | null): string {
  if (value === null) return "sin datos del periodo anterior";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
}

/** Hora (0–23) con más pedidos; null si no hubo pedidos. */
export function peakHour(rows: readonly { hora: number; pedidos: number }[]): number | null {
  let best: { hora: number; pedidos: number } | null = null;
  for (const row of rows) {
    if (row.pedidos > 0 && (best === null || row.pedidos > best.pedidos)) best = row;
  }
  return best?.hora ?? null;
}

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const longDate = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export const formatShortDate = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));
export const formatLongDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));

/** Importe compacto para ejes: 950 €, 1,2 mil €. */
export function compactEuros(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

/** Marcas «redondas» para un eje que empieza en 0. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.999; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return ticks;
}
