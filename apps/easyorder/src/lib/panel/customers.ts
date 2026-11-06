/** Respuestas de /panel/:slug/clientes (apps/api/src/routes/panel-customers.ts). */

export type CustomerRow = {
  readonly id: number;
  readonly nombre: string | null;
  readonly telefono: string;
  readonly direccion_frecuente: string | null;
  readonly creado: string | null;
  readonly pedidos: number;
  readonly gastado: number;
  readonly ultimo_pedido: string | null;
  /** El teléfono está bloqueado: no puede pedir por la web. */
  readonly bloqueado: boolean;
};

export type CustomerList = {
  readonly clientes: readonly CustomerRow[];
  readonly total: number;
  readonly pagina: number;
  readonly por_pagina: number;
};

/** Bloqueo del teléfono de un cliente (pieza Q, antifraude). `desde` es una fecha ISO. */
export type CustomerBlock = {
  readonly motivo: string | null;
  readonly desde: string;
};

export type CustomerDetail = {
  /** null si el cliente no está bloqueado. */
  readonly bloqueo: CustomerBlock | null;
  readonly cliente: {
    readonly id: number;
    readonly nombre: string | null;
    readonly telefono: string;
    readonly direccion_frecuente: string | null;
    readonly creado: string | null;
    /** true dado, false retirado o rechazado, null nunca preguntado (p. ej. solo WhatsApp). */
    readonly acepta_promociones: boolean | null;
    readonly acepta_promociones_at: string | null;
  };
  readonly resumen: {
    readonly pedidos: number;
    readonly gastado: number;
    readonly ticket_medio: number;
    readonly primer_pedido: string | null;
    readonly ultimo_pedido: string | null;
  };
  readonly favoritos: readonly { readonly nombre: string; readonly cantidad: number }[];
  readonly pedidos: readonly {
    readonly id: number;
    readonly pedido_codigo: string | null;
    readonly estado: string;
    readonly canal: string;
    readonly tipo_despacho: string | null;
    readonly total: number;
    readonly metodo_pago: string | null;
    readonly created_at: string;
    readonly local_nombre: string | null;
  }[];
};

export const CUSTOMER_SORT = [
  { id: "recientes", label: "Recientes" },
  { id: "pedidos", label: "Más pedidos" },
  { id: "gasto", label: "Más gasto" },
] as const;

export type CustomerSort = (typeof CUSTOMER_SORT)[number]["id"];

export const CHANNEL_LABEL: Readonly<Record<string, string>> = {
  web: "Web",
  whatsapp: "WhatsApp",
  telefono: "Teléfono",
  mostrador: "Mostrador",
};

/** «+34612345678» → «612 345 678» (los españoles); el resto, tal cual. */
export function formatPhone(phone: string): string {
  const spanish = /^\+34(\d{3})(\d{3})(\d{3})$/.exec(phone);
  return spanish ? `${spanish[1]} ${spanish[2]} ${spanish[3]}` : phone;
}

/** Hace cuánto: «hoy», «ayer», «hace 5 días», «hace 3 meses». */
export function sinceLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Sin pedidos";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 30) return `Hace ${days} días`;
  const months = Math.floor(days / 30);
  return months < 12 ? `Hace ${months} ${months === 1 ? "mes" : "meses"}` : "Hace más de un año";
}

export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** Estado de las promociones en la ficha: «Acepta (desde …)», «No acepta», «Sin preguntar». */
export function promotionsLabel(
  accepts: boolean | null,
  at: string | null,
  format: (date: Date) => string,
): string {
  if (accepts === null) return "Sin preguntar";
  if (!accepts) return at ? `No acepta (desde ${format(new Date(at))})` : "No acepta";
  return at ? `Acepta (desde ${format(new Date(at))})` : "Acepta";
}

/** Tope del motivo al bloquear (igual que en la API y en la tabla). */
export const BLOCK_REASON_MAX = 300;

/** Mensaje al fallar «Bloquear» o «Desbloquear» a partir del estado HTTP. */
export function blockCustomerError(status: number, unblock: boolean): string {
  if (status === 403) return "Tu usuario no tiene permiso para bloquear clientes.";
  if (status === 404) return "Este cliente ya no está disponible.";
  return unblock
    ? "No se pudo desbloquear. Inténtalo de nuevo."
    : "No se pudo bloquear. Inténtalo de nuevo.";
}

/** Texto de la ficha de un cliente bloqueado: «Bloqueado desde …» y, si lo hay, el motivo. */
export function blockLabel(block: CustomerBlock, format: (date: Date) => string): string {
  const since = `Bloqueado desde ${format(new Date(block.desde))}`;
  return block.motivo ? `${since}. Motivo: ${block.motivo}` : since;
}

/** Mensaje al fallar «Borrar datos del cliente» a partir del estado y el motivo de la API. */
export function deleteCustomerError(status: number, reason: string | undefined): string {
  if (status === 409 && reason === "open_orders") {
    return "Tiene pedidos sin cerrar. Cuando se entreguen o cancelen podrás borrar sus datos.";
  }
  if (status === 403 && reason === "customer_out_of_scope") {
    return "Tiene pedidos en locales a los que no tienes acceso: pídele a un propietario que borre sus datos.";
  }
  if (status === 403) return "Tu usuario no tiene permiso para borrar datos de clientes.";
  if (status === 404) return "Este cliente ya no está disponible.";
  return "No se pudieron borrar los datos. Inténtalo de nuevo.";
}
