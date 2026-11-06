import type { Sql } from "../lib/db";
import { parseHttpUrl } from "../lib/settings-validation";
import { CONFIG_KEY } from "./restaurants";

/**
 * Versión de la plantilla genérica de privacidad que sirve la web (`/[slug]/privacidad`) cuando
 * el restaurante no tiene su propia política. Súbela al cambiar el texto de esa página.
 */
export const GENERIC_PRIVACY_VERSION = "plantilla-1";

export type PrivacyPolicy = {
  /** Política propia del restaurante; `null` = se usa la página genérica de la web. */
  readonly url: string | null;
  /** Versión vigente: la configurada, o la de la plantilla genérica si no hay política propia. */
  readonly version: string | null;
};

/** Política de privacidad vigente de un restaurante, a partir de su configuración. */
export function privacyPolicy(config: ReadonlyMap<string, string>): PrivacyPolicy {
  const url = parseHttpUrl(config.get(CONFIG_KEY.PrivacyUrl));
  const configured = config.get(CONFIG_KEY.PrivacyVersion)?.trim() || null;
  return { url, version: configured ?? (url === null ? GENERIC_PRIVACY_VERSION : null) };
}

export type RestaurantContact = {
  readonly direccion: string | null;
  readonly telefono: string | null;
};

/** Datos de contacto del restaurante que muestra la página de privacidad (solo los que existen). */
export async function loadRestaurantContact(
  sql: Sql,
  restauranteId: number,
): Promise<RestaurantContact> {
  const rows = await sql<{ direccion: string | null; telefono: string | null }[]>`
    SELECT NULLIF(btrim(direccion), '') AS direccion, NULLIF(btrim(telefono), '') AS telefono
    FROM   public.restaurante
    WHERE  id = ${restauranteId}
  `;
  return rows[0] ?? { direccion: null, telefono: null };
}
