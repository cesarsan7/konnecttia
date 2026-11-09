import {
  countryOrDefault,
  effectiveBrandColor,
  readSocialLinks,
  type SocialLink,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";

export type Brand = {
  readonly logoUrl: string | null;
  readonly socialLinks: readonly SocialLink[];
  /** Color de marca propio (`#rrggbb`); null = el acento de EasyOrder. */
  readonly color: string | null;
  /** Eslogan del local (ajustes → General); null si no hay. */
  readonly slogan: string | null;
  /** País del restaurante (ISO alfa-2): prefijo y bandera del teléfono en el checkout. */
  readonly countryCode: string;
};

/**
 * Marca pública del restaurante (pieza Z): logo y redes sociales para la carta. La columna
 * `redes_sociales` viene de una versión anterior, por eso se lee con `readSocialLinks`: solo
 * pasa lo que tiene la forma esperada y una URL https válida.
 */
export async function loadBrand(sql: Sql, restauranteId: number): Promise<Brand> {
  const [row] = await sql<
    {
      logo_url: string | null;
      redes_sociales: unknown;
      brand_color: string | null;
      eslogan: string | null;
      pais_code: string | null;
    }[]
  >`
    SELECT logo_url, redes_sociales, brand_color, eslogan, pais_code
    FROM public.restaurante WHERE id = ${restauranteId}
  `;
  const logo = row?.logo_url?.trim() ?? "";
  return {
    logoUrl: /^https:\/\//.test(logo) ? logo : null,
    socialLinks: readSocialLinks(row?.redes_sociales),
    color: effectiveBrandColor(row?.brand_color),
    slogan: row?.eslogan?.trim() || null,
    countryCode: countryOrDefault(row?.pais_code).code,
  };
}
