import type { AllergenInfo } from "./allergens";
import type { Cents } from "./money";

export type Id = number;

export type Variant = {
  readonly id: Id;
  readonly name: string;
  readonly priceCents: Cents;
  readonly active: boolean;
  /** Alérgenos propios de la variante (por ejemplo, pan sin gluten). */
  readonly allergens?: AllergenInfo;
};

export type ModifierOption = {
  readonly id: Id;
  readonly name: string;
  /** Suplemento sobre el precio de la variante. 0 si es gratis. */
  readonly priceDeltaCents: Cents;
  readonly active: boolean;
  /** Cantidad máxima de esta opción en una línea (por defecto 1). */
  readonly maxQuantity?: number;
  readonly allergens: AllergenInfo;
};

/**
 * Grupo de modificadores: «Elige tu salsa» (mín. 1, máx. 1),
 * «Extras» (mín. 0, máx. sin límite), «Tipo de pan» (mín. 1, máx. 1).
 */
export type ModifierGroup = {
  readonly id: Id;
  readonly name: string;
  readonly minSelect: number;
  /** `null` = sin límite. */
  readonly maxSelect: number | null;
  readonly options: readonly ModifierOption[];
};

export type MenuItem = {
  readonly id: Id;
  readonly name: string;
  readonly active: boolean;
  readonly allergens: AllergenInfo;
  readonly variants: readonly Variant[];
  readonly modifierGroups: readonly ModifierGroup[];
};

export type Catalog = ReadonlyMap<Id, MenuItem>;

export function catalogFrom(items: readonly MenuItem[]): Catalog {
  return new Map(items.map((item) => [item.id, item]));
}
