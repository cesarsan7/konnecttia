/** Rutas del sitio. «Acceder» redirige al panel de EasyOrder (EASYORDER_PANEL_URL). */
export const ROUTE = {
  Home: "/",
  EasyOrder: "/easyorder",
  PanelAccess: "/acceder",
  /** Redirige al alta autoservicio del panel (`/alta`); solo se ofrece si hay EASYORDER_PANEL_URL. */
  FreeTrial: "/prueba-gratis",
} as const;

/**
 * Dirección del alta autoservicio: `/alta` en el mismo dominio que el panel de EasyOrder
 * (EASYORDER_PANEL_URL puede apuntar a `/panel` o a la raíz). Sin variable, no hay botón.
 */
export function signupUrl(panelUrl: string | undefined | null): string | null {
  const value = panelUrl?.trim();
  if (!value) return null;
  try {
    return new URL("/alta", value).toString();
  } catch {
    return null;
  }
}

/** Enlace a una sección de la portada: ancla local en la portada, `/#id` desde otras páginas. */
export function sectionHref(id: string, onHome: boolean): string {
  return onHome ? `#${id}` : `${ROUTE.Home}#${id}`;
}
