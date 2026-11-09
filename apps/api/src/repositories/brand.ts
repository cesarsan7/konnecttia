import { readSocialLinks, type SocialLink } from "@konnecttia/domain";
import type { Sql } from "../lib/db";

export type Brand = {
  readonly logoUrl: string | null;
  readonly socialLinks: readonly SocialLink[];
};

/**
 * Marca pública del restaurante (pieza Z): logo y redes sociales para la carta. La columna
 * `redes_sociales` viene de una versión anterior, por eso se lee con `readSocialLinks`: solo
 * pasa lo que tiene la forma esperada y una URL https válida.
 */
export async function loadBrand(sql: Sql, restauranteId: number): Promise<Brand> {
  const [row] = await sql<{ logo_url: string | null; redes_sociales: unknown }[]>`
    SELECT logo_url, redes_sociales FROM public.restaurante WHERE id = ${restauranteId}
  `;
  const logo = row?.logo_url?.trim() ?? "";
  return {
    logoUrl: /^https:\/\//.test(logo) ? logo : null,
    socialLinks: readSocialLinks(row?.redes_sociales),
  };
}
