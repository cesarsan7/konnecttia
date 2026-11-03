import { type Allergen, sortAllergens } from "@konnecttia/domain";
import { centsToEuros, eurosToCents, type Sql } from "../lib/db";

/**
 * Carta vista y editada desde el panel (menu_category, menu_item, menu_variant, extra,
 * menu_category_extra, sucursal_item_no_disponible). Toda consulta filtra por restaurante_id:
 * un id de otro restaurante se comporta como inexistente.
 *
 * Importes en céntimos enteros hacia el panel; en la base siguen en euros (NUMERIC) porque n8n
 * y el dashboard actual los leen así.
 */

export type AdminCategory = {
  readonly id: number;
  readonly nombre: string;
  readonly activa: boolean;
  readonly orden: number;
};

export type AdminVariant = {
  readonly id: number;
  readonly nombre: string;
  readonly precio_centimos: number;
  readonly predeterminada: boolean;
  readonly activa: boolean;
  readonly orden: number;
};

export type AdminItem = {
  readonly id: number;
  readonly categoria_id: number;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagen_url: string | null;
  readonly activo: boolean;
  readonly orden: number;
  /** null = alérgenos no informados. */
  readonly alergenos: readonly Allergen[] | null;
  readonly variantes: readonly AdminVariant[];
  /** Locales (de los que el usuario puede ver) donde el producto no está disponible. */
  readonly no_disponible_en: readonly number[];
};

export type AdminExtra = {
  readonly id: number;
  readonly nombre: string;
  readonly precio_centimos: number;
  readonly activo: boolean;
  readonly orden: number;
  readonly alergenos: readonly Allergen[] | null;
  readonly categorias: readonly number[];
};

export type AdminMenu = {
  readonly categorias: readonly AdminCategory[];
  readonly productos: readonly AdminItem[];
  readonly extras: readonly AdminExtra[];
};

/** Carta completa (también lo oculto) para el panel. */
export async function loadAdminMenu(
  sql: Sql,
  restauranteId: number,
  visibleBranchIds: readonly number[],
): Promise<AdminMenu> {
  const branches = [...visibleBranchIds];
  const [categories, items, variants, extras, links, unavailable] = await Promise.all([
    sql<{ id: number; nombre: string; activa: boolean; orden: number }[]>`
      SELECT menu_category_id AS id, name AS nombre, is_active AS activa, sort_order AS orden
      FROM   public.menu_category
      WHERE  restaurante_id = ${restauranteId}
      ORDER  BY sort_order, menu_category_id
    `,
    sql<
      {
        id: number;
        categoria_id: number;
        nombre: string;
        descripcion: string | null;
        imagen_url: string | null;
        activo: boolean;
        orden: number;
        alergenos: string[] | null;
      }[]
    >`
      SELECT menu_item_id AS id, menu_category_id AS categoria_id, name AS nombre,
             description AS descripcion, image_url AS imagen_url, is_active AS activo,
             sort_order AS orden, alergenos
      FROM   public.menu_item
      WHERE  restaurante_id = ${restauranteId}
      ORDER  BY sort_order, menu_item_id
    `,
    sql<
      {
        id: number;
        menu_item_id: number;
        nombre: string;
        precio: string;
        predeterminada: boolean;
        activa: boolean;
        orden: number;
      }[]
    >`
      SELECT mv.menu_variant_id AS id, mv.menu_item_id, mv.variant_name AS nombre,
             mv.price AS precio, mv.is_default AS predeterminada, mv.is_active AS activa,
             mv.sort_order AS orden
      FROM   public.menu_variant mv
      JOIN   public.menu_item mi
             ON mi.menu_item_id = mv.menu_item_id AND mi.restaurante_id = ${restauranteId}
      WHERE  mv.restaurante_id = ${restauranteId}
      ORDER  BY mv.sort_order, mv.price, mv.menu_variant_id
    `,
    sql<
      {
        id: number;
        nombre: string;
        precio: string;
        activo: boolean;
        orden: number;
        alergenos: string[] | null;
      }[]
    >`
      SELECT extra_id AS id, name AS nombre, price AS precio, is_active AS activo,
             sort_order AS orden, alergenos
      FROM   public.extra
      WHERE  restaurante_id = ${restauranteId}
      ORDER  BY sort_order, extra_id
    `,
    sql<{ extra_id: number; menu_category_id: number }[]>`
      SELECT mce.extra_id, mce.menu_category_id
      FROM   public.menu_category_extra mce
      JOIN   public.extra e ON e.extra_id = mce.extra_id AND e.restaurante_id = ${restauranteId}
    `,
    branches.length === 0
      ? Promise.resolve([] as { menu_item_id: number; sucursal_id: number }[])
      : sql<{ menu_item_id: number; sucursal_id: number }[]>`
          SELECT sin.menu_item_id, sin.sucursal_id
          FROM   public.sucursal_item_no_disponible sin
          JOIN   public.sucursal s ON s.id = sin.sucursal_id AND s.restaurante_id = ${restauranteId}
          WHERE  sin.sucursal_id IN ${sql(branches)}
        `,
  ]);

  return {
    categorias: categories,
    productos: items.map((item) => ({
      ...item,
      alergenos: storedAllergens(item.alergenos),
      variantes: variants
        .filter((variant) => variant.menu_item_id === item.id)
        .map(({ menu_item_id: _, precio, ...variant }) => ({
          ...variant,
          precio_centimos: eurosToCents(precio),
        })),
      no_disponible_en: unavailable
        .filter((row) => row.menu_item_id === item.id)
        .map((row) => row.sucursal_id)
        .sort((a, b) => a - b),
    })),
    extras: extras.map(({ precio, ...extra }) => ({
      ...extra,
      precio_centimos: eurosToCents(precio),
      alergenos: storedAllergens(extra.alergenos),
      categorias: links
        .filter((link) => link.extra_id === extra.id)
        .map((link) => link.menu_category_id)
        .sort((a, b) => a - b),
    })),
  };
}

function storedAllergens(value: string[] | null): Allergen[] | null {
  return value === null ? null : sortAllergens(value as Allergen[]);
}

/** Para guardar: orden del reglamento y sin repetidos. null se mantiene («no informados»). */
export function allergensForStorage(value: readonly Allergen[] | null): string[] | null {
  return value === null ? null : sortAllergens([...new Set(value)]);
}

export function centsToPrice(value: number): number {
  return centsToEuros(value);
}

export const MENU_ENTITY = {
  Category: "menu_category",
  Item: "menu_item",
  Variant: "menu_variant",
  Extra: "extra",
} as const;

export type MenuEntity = (typeof MENU_ENTITY)[keyof typeof MENU_ENTITY];

/** ¿Existe este registro en el restaurante? */
export async function existsInRestaurant(
  sql: Sql,
  entity: MenuEntity,
  id: number,
  restauranteId: number,
): Promise<boolean> {
  const rows = await (() => {
    switch (entity) {
      case MENU_ENTITY.Category:
        return sql`SELECT 1 FROM public.menu_category WHERE menu_category_id = ${id} AND restaurante_id = ${restauranteId}`;
      case MENU_ENTITY.Item:
        return sql`SELECT 1 FROM public.menu_item WHERE menu_item_id = ${id} AND restaurante_id = ${restauranteId}`;
      case MENU_ENTITY.Variant:
        return sql`SELECT 1 FROM public.menu_variant WHERE menu_variant_id = ${id} AND restaurante_id = ${restauranteId}`;
      case MENU_ENTITY.Extra:
        return sql`SELECT 1 FROM public.extra WHERE extra_id = ${id} AND restaurante_id = ${restauranteId}`;
    }
  })();
  return rows.length > 0;
}

/** Ids de categorías del restaurante entre los indicados (para validar listas del navegador). */
export async function categoriesOf(
  sql: Sql,
  restauranteId: number,
  ids: readonly number[],
): Promise<number[]> {
  if (ids.length === 0) return [];
  const rows = await sql<{ id: number }[]>`
    SELECT menu_category_id AS id FROM public.menu_category
    WHERE  restaurante_id = ${restauranteId} AND menu_category_id IN ${sql([...ids])}
  `;
  return rows.map((row) => row.id);
}

/** Mismo conjunto de ids, sin repetidos. */
export function sameIdSet(expected: readonly number[], received: readonly number[]): boolean {
  if (expected.length !== received.length) return false;
  const set = new Set(received);
  return set.size === received.length && expected.every((id) => set.has(id));
}

/** Tipos de imagen admitidos, reconocidos por su firma (no por lo que diga el navegador). */
export const IMAGE_TYPE = {
  Jpeg: { mime: "image/jpeg", ext: "jpg" },
  Png: { mime: "image/png", ext: "png" },
  Webp: { mime: "image/webp", ext: "webp" },
} as const;

export type ImageType = (typeof IMAGE_TYPE)[keyof typeof IMAGE_TYPE];

export function detectImageType(bytes: Uint8Array): ImageType | null {
  const at = (index: number) => bytes[index];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return IMAGE_TYPE.Jpeg;
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return IMAGE_TYPE.Png;
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return IMAGE_TYPE.Webp;
  }
  return null;
}
