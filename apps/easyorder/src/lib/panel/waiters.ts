/** Respuesta de GET /panel/:slug/mesas/meseros (apps/api/src/routes/panel-waiters.ts). */
export type Waiter = {
  readonly id: number;
  readonly nombre: string;
  readonly activo: boolean;
  /** null = de todos los locales. */
  readonly sucursal_id: number | null;
  readonly membership_id: number | null;
  readonly email: string | null;
  readonly pedidos_hoy: number;
  readonly importe_hoy: number;
};

export type WaiterList = {
  readonly meseros: readonly Waiter[];
  /** Mesero que es el propio usuario (null si no lo es). */
  readonly yo: number | null;
};

/** Meseros activos que pueden atender en un local (los suyos y los de todos los locales). */
export function waitersFor(list: WaiterList | null, branchId: number | null): Waiter[] {
  if (!list || branchId === null) return [];
  return list.meseros.filter(
    (waiter) => waiter.activo && (waiter.sucursal_id === null || waiter.sucursal_id === branchId),
  );
}

/** Elección del mesero en el pedido: automático (el de la mesa o el propio usuario), ninguno o uno. */
export type WaiterChoice = "auto" | "ninguno" | number;

export function waiterBody(choice: WaiterChoice): { mesero_id?: number | null } {
  if (choice === "auto") return {};
  return { mesero_id: choice === "ninguno" ? null : choice };
}
