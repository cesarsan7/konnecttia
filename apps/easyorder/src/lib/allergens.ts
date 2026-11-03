import {
  ALLERGEN_LABEL,
  ALLERGEN_STATUS,
  type AllergenInfo,
  allergensFromStored,
  combineAllergens,
  NOT_DECLARED,
} from "@konnecttia/domain";
import type { AllergenPayload, MenuItem } from "./types";

function fromPayload(payload: AllergenPayload | undefined): AllergenInfo {
  if (!payload || payload.status !== ALLERGEN_STATUS.Declared) return NOT_DECLARED;
  return allergensFromStored(payload.allergens ?? []);
}

/**
 * Alérgenos de lo que el cliente va a pedir: producto + extras elegidos. Si alguna parte no está
 * informada, el conjunto tampoco (nunca se dice «sin alérgenos» por falta de datos).
 */
export function lineAllergens(item: MenuItem, extraIds: readonly number[]): AllergenInfo {
  return combineAllergens([
    fromPayload(item.allergens),
    ...item.extras
      .filter((extra) => extraIds.includes(extra.id))
      .map((e) => fromPayload(e.allergens)),
  ]);
}

export function allergenNames(info: AllergenInfo): string[] {
  return info.status === ALLERGEN_STATUS.Declared
    ? info.allergens.map((allergen) => ALLERGEN_LABEL[allergen])
    : [];
}
