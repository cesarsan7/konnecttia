import { personLabel } from "./team";
import type { PanelOrder } from "./types";

/** Respuesta de GET /panel/:slug/orders/historial (apps/api/src/routes/panel-orders-list.ts). */
export type OrderHistory = {
  readonly pedidos: readonly PanelOrder[];
  readonly total: number;
  readonly importe: number;
  readonly pagina: number;
  readonly por_pagina: number;
};

export const HISTORY_SORT = ["fecha", "codigo", "cliente", "estado", "total", "tipo"] as const;
export type HistorySort = (typeof HISTORY_SORT)[number];

export type HistoryFilters = {
  readonly dias: "hoy" | "ayer" | "7d" | "30d" | "todo" | "rango";
  readonly desde: string;
  readonly hasta: string;
  /** «» = todos, «activos» = en marcha, o un estado. */
  readonly estado: string;
  readonly tipo: string;
  readonly canal: string;
  readonly pago: string;
  readonly metodo: string;
  readonly local: number | null;
  /** Id de `meseros`; null = todos. */
  readonly mesero: number | null;
  /** membership_id del repartidor; null = todos. */
  readonly repartidor: number | null;
  readonly q: string;
  readonly orden: HistorySort;
  readonly dir: "asc" | "desc";
  readonly pagina: number;
};

export const DEFAULT_FILTERS: HistoryFilters = {
  dias: "hoy",
  desde: "",
  hasta: "",
  estado: "",
  tipo: "",
  canal: "",
  pago: "",
  metodo: "",
  local: null,
  mesero: null,
  repartidor: null,
  q: "",
  orden: "fecha",
  dir: "desc",
  pagina: 1,
};

export const DAY_PRESETS: readonly { id: HistoryFilters["dias"]; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "todo", label: "Todo" },
  { id: "rango", label: "Fechas" },
];

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Días (del restaurante) que cubre el filtro; null = sin límite de fechas. */
export function dayRange(
  filters: Pick<HistoryFilters, "dias" | "desde" | "hasta">,
  today: string,
): { desde: string; hasta: string } | null {
  switch (filters.dias) {
    case "hoy":
      return { desde: today, hasta: today };
    case "ayer":
      return { desde: shift(today, -1), hasta: shift(today, -1) };
    case "7d":
      return { desde: shift(today, -6), hasta: today };
    case "30d":
      return { desde: shift(today, -29), hasta: today };
    case "rango":
      if (!filters.desde || !filters.hasta) return null;
      return filters.desde <= filters.hasta
        ? { desde: filters.desde, hasta: filters.hasta }
        : { desde: filters.hasta, hasta: filters.desde };
    default:
      return null;
  }
}

/** Parámetros de la petición a partir de los filtros de la tabla. */
export function historyQuery(filters: HistoryFilters, today: string): URLSearchParams {
  const params = new URLSearchParams();
  const range = dayRange(filters, today);
  if (range) {
    params.set("desde", range.desde);
    params.set("hasta", range.hasta);
  }
  for (const key of ["estado", "tipo", "canal", "pago", "metodo"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (filters.local !== null) params.set("local", String(filters.local));
  if (filters.mesero !== null) params.set("mesero", String(filters.mesero));
  if (filters.repartidor !== null) params.set("repartidor", String(filters.repartidor));
  if (filters.q.trim()) params.set("q", filters.q.trim());
  params.set("orden", filters.orden);
  params.set("dir", filters.dir);
  params.set("pagina", String(filters.pagina));
  return params;
}

/** Clic en una cabecera: misma columna invierte el sentido; otra empieza descendente (texto: ascendente). */
export function toggleSort(filters: HistoryFilters, column: HistorySort): HistoryFilters {
  if (filters.orden === column) {
    return { ...filters, dir: filters.dir === "asc" ? "desc" : "asc", pagina: 1 };
  }
  const textual = column === "cliente" || column === "codigo" || column === "tipo";
  return { ...filters, orden: column, dir: textual ? "asc" : "desc", pagina: 1 };
}

/** Cuántos filtros (aparte de las fechas y el orden) hay activos. */
export function activeFilterCount(filters: HistoryFilters): number {
  return (
    (["estado", "tipo", "canal", "pago", "metodo", "q"] as const).filter(
      (key) => filters[key].trim() !== "",
    ).length +
    [filters.local, filters.mesero, filters.repartidor].filter((id) => id !== null).length
  );
}

export const CHANNEL_OPTIONS: readonly { id: string; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telefono", label: "Teléfono" },
  { id: "mostrador", label: "Mostrador" },
];

export const PAYMENT_STATUS_OPTIONS: readonly { id: string; label: string }[] = [
  { id: "pendiente", label: "Pendiente de cobro" },
  { id: "pagado", label: "Cobrado (confirmado)" },
  { id: "no_aplica", label: "Se cobra al entregar" },
  { id: "rechazado", label: "Cobro rechazado" },
];

/** Nombre del mesero del pedido para la columna «Mesero». */
export function waiterLabel(order: Pick<PanelOrder, "mesero_nombre">): string {
  return order.mesero_nombre?.trim() || "—";
}

/**
 * Repartidor del pedido: apodo o nombre; el email solo como último recurso (la API lo envía
 * únicamente a quien ve el equipo). «—» si el pedido no tiene repartidor.
 */
export function driverLabel(
  order: Pick<PanelOrder, "repartidor_nombre" | "repartidor_email">,
): string {
  return personLabel({ name: order.repartidor_nombre, email: order.repartidor_email }, "—");
}
