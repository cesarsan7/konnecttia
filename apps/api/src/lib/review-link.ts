/**
 * Enlace de reseñas del restaurante: solo Google (ficha de Google Maps o su enlace corto de
 * reseñas), para que el botón del seguimiento no pueda llevar a otra web por error.
 */
export const REVIEW_URL_MAX = 300;

const REVIEW_HOSTS: ReadonlyArray<{ readonly host: string; readonly path: RegExp }> = [
  { host: "www.google.com", path: /^\/maps(\/|$)/ },
  { host: "google.com", path: /^\/maps(\/|$)/ },
  { host: "maps.google.com", path: /^\// },
  { host: "search.google.com", path: /^\/local\// },
  { host: "maps.app.goo.gl", path: /^\/./ },
  { host: "goo.gl", path: /^\/maps(\/|$)/ },
  { host: "g.page", path: /^\/./ },
  { host: "g.co", path: /^\/kgs\/./ },
];

/** El enlace normalizado si es un https de Google Maps o de reseñas de Google; `null` si no. */
export function parseReviewUrl(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || text.length > REVIEW_URL_MAX) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const allowed = REVIEW_HOSTS.some(
      (entry) => entry.host === url.hostname.toLowerCase() && entry.path.test(url.pathname),
    );
    return allowed ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Para el esquema de Ajustes: vacío (borrar) o un enlace de Google válido. */
export function isValidReviewUrl(value: string | null | undefined): boolean {
  return !value?.trim() || parseReviewUrl(value) !== null;
}
