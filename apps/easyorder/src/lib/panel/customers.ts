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
};

export type CustomerList = {
  readonly clientes: readonly CustomerRow[];
  readonly total: number;
  readonly pagina: number;
  readonly por_pagina: number;
};

export type CustomerDetail = {
  readonly cliente: {
    readonly id: number;
    readonly nombre: string | null;
    readonly telefono: string;
    readonly direccion_frecuente: string | null;
    readonly creado: string | null;
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
