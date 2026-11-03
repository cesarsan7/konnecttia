import {
  type Catalog,
  catalogFrom,
  cents,
  type MenuItem,
  type ModifierGroup,
  NOT_DECLARED,
} from "@konnecttia/domain";
import { eurosToCents, type Sql } from "../lib/db";

/**
 * Carta de un restaurante a partir del modelo de EasyOrder
 * (menu_category + menu_item + menu_variant + extra).
 *
 * Los extras de EasyOrder se convierten en un grupo de modificadores opcional («Extras»).
 * Los alérgenos aún no existen como campo estructurado: se marcan como «no informados»
 * hasta la migración de alérgenos (nunca como «sin alérgenos»).
 */

export const EXTRAS_GROUP_ID = 0;
export const EXTRAS_GROUP_NAME = "Extras";
export const MAX_EXTRA_QUANTITY = 10;

type ItemRow = {
  menu_item_id: number;
  menu_category_id: number;
  category_name: string;
  category_sort: number;
  name: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
};

type VariantRow = {
  menu_variant_id: number;
  menu_item_id: number;
  variant_name: string;
  price: string;
  is_active: boolean;
  is_default: boolean;
};

type ExtraRow = {
  menu_item_id: number;
  extra_id: number;
  name: string;
  price: string;
  is_active: boolean;
};

export type PublicMenuItem = {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly variants: readonly {
    readonly id: number;
    readonly name: string;
    readonly price: number;
    readonly isDefault: boolean;
  }[];
  readonly extras: readonly {
    readonly id: number;
    readonly name: string;
    readonly price: number;
  }[];
  readonly allergens: typeof NOT_DECLARED;
};

export type PublicMenu = {
  readonly categories: readonly {
    readonly id: number;
    readonly name: string;
    readonly items: readonly PublicMenuItem[];
  }[];
};

type CatalogRows = { items: ItemRow[]; variants: VariantRow[]; extras: ExtraRow[] };

async function loadRows(
  sql: Sql,
  restauranteId: number,
  itemIds: readonly number[] | null,
): Promise<CatalogRows> {
  const onlyItems = itemIds === null ? null : [...itemIds];
  const [items, variants, extras] = await Promise.all([
    sql<ItemRow[]>`
      SELECT mi.menu_item_id, mi.menu_category_id, mc.name AS category_name,
             mc.sort_order AS category_sort, mi.name, mi.description, mi.image_url,
             (mi.is_active AND mc.is_active) AS is_active
      FROM   public.menu_item mi
      JOIN   public.menu_category mc
             ON mc.menu_category_id = mi.menu_category_id
            AND mc.restaurante_id   = ${restauranteId}
      WHERE  mi.restaurante_id = ${restauranteId}
        AND  (${onlyItems}::bigint[] IS NULL OR mi.menu_item_id = ANY(${onlyItems}::bigint[]))
    `,
    sql<VariantRow[]>`
      SELECT mv.menu_variant_id, mv.menu_item_id, mv.variant_name, mv.price,
             mv.is_active, mv.is_default
      FROM   public.menu_variant mv
      JOIN   public.menu_item mi
             ON mi.menu_item_id   = mv.menu_item_id
            AND mi.restaurante_id = ${restauranteId}
      WHERE  mv.restaurante_id = ${restauranteId}
        AND  (${onlyItems}::bigint[] IS NULL OR mv.menu_item_id = ANY(${onlyItems}::bigint[]))
      ORDER  BY mv.price, mv.menu_variant_id
    `,
    sql<ExtraRow[]>`
      SELECT DISTINCT ON (mi.menu_item_id, e.extra_id)
             mi.menu_item_id, e.extra_id, e.name, e.price, e.is_active
      FROM   public.menu_item mi
      LEFT JOIN public.menu_item_extra mie ON mie.menu_item_id = mi.menu_item_id
      LEFT JOIN public.menu_category_extra mce ON mce.menu_category_id = mi.menu_category_id
      JOIN   public.extra e
             ON e.extra_id IN (mie.extra_id, mce.extra_id)
            AND e.restaurante_id = ${restauranteId}
      WHERE  mi.restaurante_id = ${restauranteId}
        AND  (${onlyItems}::bigint[] IS NULL OR mi.menu_item_id = ANY(${onlyItems}::bigint[]))
      ORDER  BY mi.menu_item_id, e.extra_id
    `,
  ]);
  return { items, variants, extras };
}

function toMenuItem(item: ItemRow, rows: CatalogRows): MenuItem {
  const extras = rows.extras.filter((extra) => extra.menu_item_id === item.menu_item_id);
  const groups: ModifierGroup[] =
    extras.length === 0
      ? []
      : [
          {
            id: EXTRAS_GROUP_ID,
            name: EXTRAS_GROUP_NAME,
            minSelect: 0,
            maxSelect: null,
            options: extras.map((extra) => ({
              id: extra.extra_id,
              name: extra.name,
              priceDeltaCents: cents(eurosToCents(extra.price)),
              active: extra.is_active,
              maxQuantity: MAX_EXTRA_QUANTITY,
              allergens: NOT_DECLARED,
            })),
          },
        ];
  return {
    id: item.menu_item_id,
    name: item.name,
    active: item.is_active,
    allergens: NOT_DECLARED,
    variants: rows.variants
      .filter((variant) => variant.menu_item_id === item.menu_item_id)
      .map((variant) => ({
        id: variant.menu_variant_id,
        name: variant.variant_name,
        priceCents: cents(eurosToCents(variant.price)),
        active: variant.is_active,
      })),
    modifierGroups: groups,
  };
}

/** Carta para calcular un pedido: solo los productos pedidos, activos o no (el dominio decide). */
export async function loadCatalogForItems(
  sql: Sql,
  restauranteId: number,
  itemIds: readonly number[],
): Promise<Catalog> {
  const rows = await loadRows(sql, restauranteId, itemIds);
  return catalogFrom(rows.items.map((item) => toMenuItem(item, rows)));
}

/** Carta pública: solo lo activo, agrupado por categoría y en el orden configurado. */
export async function loadPublicMenu(sql: Sql, restauranteId: number): Promise<PublicMenu> {
  const rows = await loadRows(sql, restauranteId, null);
  const categories = new Map<
    number,
    { id: number; name: string; sort: number; items: PublicMenuItem[] }
  >();
  for (const item of rows.items) {
    if (!item.is_active) continue;
    const variants = rows.variants.filter(
      (variant) => variant.menu_item_id === item.menu_item_id && variant.is_active,
    );
    if (variants.length === 0) continue;
    const category = categories.get(item.menu_category_id) ?? {
      id: item.menu_category_id,
      name: item.category_name,
      sort: item.category_sort,
      items: [],
    };
    category.items.push({
      id: item.menu_item_id,
      name: item.name,
      description: item.description,
      imageUrl: item.image_url,
      variants: variants.map((variant) => ({
        id: variant.menu_variant_id,
        name: variant.variant_name,
        price: Number(variant.price),
        isDefault: variant.is_default,
      })),
      extras: rows.extras
        .filter((extra) => extra.menu_item_id === item.menu_item_id && extra.is_active)
        .map((extra) => ({ id: extra.extra_id, name: extra.name, price: Number(extra.price) })),
      allergens: NOT_DECLARED,
    });
    categories.set(item.menu_category_id, category);
  }
  return {
    categories: [...categories.values()]
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
      .map(({ id, name, items }) => ({ id, name, items })),
  };
}
