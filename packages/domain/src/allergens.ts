/**
 * Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011, anexo II).
 */
export const ALLERGENS = [
  "gluten",
  "crustaceos",
  "huevos",
  "pescado",
  "cacahuetes",
  "soja",
  "lacteos",
  "frutos_de_cascara",
  "apio",
  "mostaza",
  "sesamo",
  "sulfitos",
  "altramuces",
  "moluscos",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_STATUS = {
  Declared: "declared",
  NotDeclared: "not_declared",
} as const;

/**
 * `not_declared` significa que el restaurante no ha informado los alérgenos.
 * Nunca debe mostrarse como «sin alérgenos».
 */
export type AllergenInfo =
  | { readonly status: typeof ALLERGEN_STATUS.Declared; readonly allergens: readonly Allergen[] }
  | { readonly status: typeof ALLERGEN_STATUS.NotDeclared };

export const NOT_DECLARED: AllergenInfo = { status: ALLERGEN_STATUS.NotDeclared };

export function declareAllergens(allergens: readonly Allergen[]): AllergenInfo {
  return { status: ALLERGEN_STATUS.Declared, allergens: [...new Set(allergens)] };
}

/**
 * Une los alérgenos de un producto, su variante y los extras elegidos.
 * Si alguna parte no está declarada, el resultado tampoco lo está.
 */
export function combineAllergens(parts: readonly AllergenInfo[]): AllergenInfo {
  const combined = new Set<Allergen>();
  for (const part of parts) {
    if (part.status === ALLERGEN_STATUS.NotDeclared) {
      return NOT_DECLARED;
    }
    for (const allergen of part.allergens) {
      combined.add(allergen);
    }
  }
  return declareAllergens([...combined]);
}

export function allergenLabel(info: AllergenInfo): string {
  if (info.status === ALLERGEN_STATUS.NotDeclared) {
    return "Alérgenos no informados: consulta al restaurante";
  }
  return info.allergens.length === 0 ? "Sin alérgenos declarados" : info.allergens.join(", ");
}
