/** Rutas del sitio. «Acceder» redirige al panel de EasyOrder (EASYORDER_PANEL_URL). */
export const ROUTE = {
  Home: "/",
  EasyOrder: "/easyorder",
  PanelAccess: "/acceder",
} as const;

/** Enlace a una sección de la portada: ancla local en la portada, `/#id` desde otras páginas. */
export function sectionHref(id: string, onHome: boolean): string {
  return onHome ? `#${id}` : `${ROUTE.Home}#${id}`;
}
