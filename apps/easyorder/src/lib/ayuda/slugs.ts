/** Direcciones de las páginas del centro de ayuda (`/ayuda/<slug>`). */
export const HELP_SLUG = {
  FirstSteps: "primeros-pasos",
  Orders: "pedidos",
  WebOrders: "pedidos-por-la-web",
  Payments: "cobros",
  Tables: "mesas",
  Menu: "carta",
  Customers: "clientes",
  Stats: "estadisticas",
  Team: "equipo",
  Settings: "ajustes",
  MyDeliveries: "mis-repartos",
  Drivers: "repartidores-y-foto",
  Privacy: "privacidad-y-pedidos-sospechosos",
  Trial: "prueba-gratuita",
} as const;

export type HelpSlug = (typeof HELP_SLUG)[keyof typeof HELP_SLUG];

/** Ruta del índice de la ayuda. */
export const HELP_ROOT = "/ayuda";

export function helpPath(slug?: HelpSlug): string {
  return slug ? `${HELP_ROOT}/${slug}` : HELP_ROOT;
}
