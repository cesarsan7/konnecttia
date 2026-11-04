/** Respuestas de GET /panel/:slug/mesas (apps/api/src/routes/panel-tables.ts). */

export type TableZone = {
  readonly id: number;
  readonly nombre: string;
  readonly orden: number;
  readonly activa: boolean;
  readonly sucursal_id: number;
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
  readonly pedido: {
    readonly id: number;
    readonly codigo: string | null;
    readonly estado: string;
    readonly total: number;
    readonly desde: string;
  } | null;
};

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
