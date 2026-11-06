/** Respuestas de las rutas de reparto (apps/api/src/routes/panel-drivers.ts). */

export type Driver = {
  readonly membership_id: number;
  /** Solo llega a quien ve el equipo. */
  readonly email: string | null;
  /** Apodo o nombre del miembro. */
  readonly nombre_mostrar: string | null;
  readonly roles: readonly string[];
  readonly locales: "todos" | readonly number[];
  /** Repartos en marcha que tiene asignados. */
  readonly en_curso: number;
};

export type Delivery = {
  readonly id: number;
  readonly pedido_codigo: string | null;
  readonly estado: string;
  readonly estado_pago: string;
  readonly metodo_pago: string | null;
  readonly total: string | number;
  readonly nombre_pedido: string | null;
  readonly telefono: string;
  readonly direccion: string | null;
  readonly lat: string | number | null;
  readonly lng: string | number | null;
  readonly items: unknown;
  readonly notas: unknown;
  readonly tiempo_estimado: string | null;
  readonly local_nombre: string | null;
  readonly created_at: string;
  readonly asignado_at: string;
  readonly salida_at: string | null;
  readonly entregado_at: string | null;
};

/** Repartidores que pueden llevar un pedido de ese local. */
export function driversFor(drivers: readonly Driver[], branchId: number | null): Driver[] {
  return drivers.filter(
    (driver) =>
      driver.locales === "todos" || (branchId !== null && driver.locales.includes(branchId)),
  );
}

/** Siguiente paso del repartidor: salir (desde «listo») o entregar (en camino). */
export function deliveryStep(
  delivery: Pick<Delivery, "estado" | "estado_pago">,
): { readonly action: "salida" | "entregado"; readonly label: string } | null {
  if (delivery.estado === "listo") return { action: "salida", label: "Salgo a repartir" };
  if (delivery.estado === "en_camino") {
    return delivery.estado_pago === "pendiente"
      ? null
      : { action: "entregado", label: "Entregado" };
  }
  return null;
}

/** Enlace de mapas: coordenadas si las hay, si no la dirección. */
export function mapsLink(delivery: Pick<Delivery, "lat" | "lng" | "direccion">): string | null {
  if (delivery.lat !== null && delivery.lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${delivery.lat},${delivery.lng}`;
  }
  return delivery.direccion
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.direccion)}`
    : null;
}
