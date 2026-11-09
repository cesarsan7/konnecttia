import {
  parseSocialLinks,
  SOCIAL_ERROR,
  SOCIAL_LABEL,
  SOCIAL_NETWORKS,
  type SocialLink,
  type SocialNetwork,
} from "@konnecttia/domain";

/** Marca del restaurante en Ajustes (pieza Z): logo y redes sociales. */
export type SocialRow = { readonly red: SocialNetwork; readonly url: string };

/** Tamaño máximo del logo (el servidor aplica el mismo límite) y tipos que admite. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg,image/webp";

export function socialLabel(network: SocialNetwork): string {
  return SOCIAL_LABEL[network];
}

/** Redes que aún no tienen fila, en el orden del catálogo. */
export function freeNetworks(rows: readonly SocialRow[]): readonly SocialNetwork[] {
  const used = new Set(rows.map((row) => row.red));
  return SOCIAL_NETWORKS.filter((network) => !used.has(network));
}

/** Lo guardado → filas editables. */
export function rowsFrom(saved: readonly SocialLink[] | undefined): SocialRow[] {
  return (saved ?? []).map((link) => ({ red: link.red, url: link.url }));
}

/**
 * Valida las filas antes de enviarlas (el servidor vuelve a validar). Las filas con la URL vacía
 * se ignoran: así quitar el texto equivale a quitar la red.
 */
export function socialPayload(
  rows: readonly SocialRow[],
): { ok: true; links: readonly SocialLink[] } | { ok: false; message: string } {
  const filled = rows.filter((row) => row.url.trim().length > 0);
  const result = parseSocialLinks(filled);
  if (result.ok) return { ok: true, links: result.links };
  const row = filled[result.index];
  const name = row ? socialLabel(row.red) : "La red";
  if (result.error === SOCIAL_ERROR.Duplicate)
    return { ok: false, message: `${name}: ya la añadiste.` };
  if (result.error === SOCIAL_ERROR.Unknown)
    return { ok: false, message: `${name}: red no admitida.` };
  return {
    ok: false,
    message: `${name}: el enlace no es válido. Pega la dirección completa, por ejemplo https://instagram.com/tulocal.`,
  };
}

/** Mensaje al fallar la subida del logo. */
export function logoError(status: number, reason?: string): string {
  if (status === 413 || reason === "too_large") return "El logo pesa demasiado (máximo 2 MB).";
  if (status === 415 || reason === "unsupported_type") return "Sube el logo como PNG, JPG o WebP.";
  if (status === 503) return "La subida de imágenes no está activada en este entorno.";
  if (status === 403) return "Tu usuario no puede cambiar la marca del restaurante.";
  return "No se pudo subir el logo. Inténtalo de nuevo.";
}

/** Comprobación en el navegador antes de subir (tipo y tamaño). `null` = vale. */
export function checkLogoFile(file: {
  readonly type: string;
  readonly size: number;
}): string | null {
  if (!LOGO_ACCEPT.split(",").includes(file.type)) return logoError(415);
  if (file.size > LOGO_MAX_BYTES) return logoError(413);
  return null;
}
