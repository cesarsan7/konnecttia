/** Respuestas de GET /panel/:slug/mesas (apps/api/src/routes/panel-tables.ts). */

import type { PanelOrder } from "./types";

export type TableZone = {
  readonly id: number;
  readonly nombre: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly sucursal_id: number;
};

/** Pedido de la mesa (en marcha o de la ocupación actual). */
export type TableOrder = {
  readonly id: number;
  readonly codigo: string | null;
  readonly estado: string;
  readonly estado_pago: string;
  readonly metodo_pago: string | null;
  readonly tipo_despacho: PanelOrder["tipo_despacho"];
  readonly total: number;
  readonly items: unknown;
  readonly desde: string;
};

export type DiningTable = {
  readonly id: number;
  readonly numero: number;
  readonly nombre: string;
  readonly capacidad: number | null;
  readonly activa: boolean;
  readonly zona_id: number | null;
  readonly sucursal_id: number;
  readonly ocupada_manual: boolean;
  readonly ocupada: boolean;
  /** Inicio de la ocupación actual (UTC). */
  readonly ocupada_desde: string | null;
  /** Pedidos de la ocupación actual, del más antiguo al más reciente. */
  readonly pedidos: readonly TableOrder[];
  /** Último pedido en marcha. */
  readonly pedido: TableOrder | null;
  /** Pedidos en marcha (con alguno, la mesa no se puede liberar). */
  readonly en_marcha: number;
  /** Total de la mesa en euros (sin cancelados). */
  readonly cuenta: number;
  /** Parte de la cuenta con cobro pendiente (transferencia, Bizum). */
  readonly por_cobrar: number;
};

export const TABLE_FILTER = [
  { id: "todas", label: "Todas" },
  { id: "libres", label: "Libres" },
  { id: "ocupadas", label: "Ocupadas" },
] as const;
export type TableFilter = (typeof TABLE_FILTER)[number]["id"];

export function matchesFilter(table: Pick<DiningTable, "ocupada">, filter: TableFilter): boolean {
  if (filter === "libres") return !table.ocupada;
  if (filter === "ocupadas") return table.ocupada;
  return true;
}

/** Mesas activas de un local para elegir en el pedido manual: primero las libres. */
export function selectableTables(plan: TablePlan | null, branchId: number | null): DiningTable[] {
  if (!plan || branchId === null) return [];
  return plan.mesas
    .filter((table) => table.activa && table.sucursal_id === branchId)
    .sort((a, b) => Number(a.ocupada) - Number(b.ocupada) || a.numero - b.numero);
}

export type TablePlan = {
  readonly locales: readonly { readonly id: number; readonly nombre: string }[];
  readonly zonas: readonly TableZone[];
  readonly mesas: readonly DiningTable[];
};

/** Mesas de un local agrupadas por zona (las que no tienen zona, al final en «Sin zona»). */
export function groupByZone(
  plan: TablePlan,
  branchId: number,
): { zone: TableZone | null; tables: DiningTable[] }[] {
  const zones = plan.zonas.filter((zone) => zone.sucursal_id === branchId);
  const tables = plan.mesas.filter((table) => table.sucursal_id === branchId);
  const groups: { zone: TableZone | null; tables: DiningTable[] }[] = zones.map((zone) => ({
    zone,
    tables: tables.filter((table) => table.zona_id === zone.id),
  }));
  const loose = tables.filter((table) => !zones.some((zone) => zone.id === table.zona_id));
  if (loose.length > 0 || groups.length === 0) groups.push({ zone: null, tables: loose });
  return groups;
}

/** «12 min», «1 h 5 min» desde que se abrió el pedido de la mesa. */
export function occupiedFor(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function nextTableNumber(plan: TablePlan): number {
  return plan.mesas.reduce((max, table) => Math.max(max, table.numero), 0) + 1;
}
