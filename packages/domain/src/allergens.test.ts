import { describe, expect, it } from "vitest";
import {
  ALLERGEN_LABEL,
  ALLERGEN_STATUS,
  ALLERGENS,
  allergenLabel,
  allergensFromStored,
  sortAllergens,
} from "./allergens";

describe("alérgenos guardados", () => {
  it("sin dato (null) es «no informados», nunca «sin alérgenos»", () => {
    expect(allergensFromStored(null)).toEqual({ status: ALLERGEN_STATUS.NotDeclared });
    expect(allergenLabel(allergensFromStored(null))).toMatch(/no informados/);
  });

  it("lista vacía es una declaración explícita de que no contiene ninguno", () => {
    expect(allergensFromStored([])).toEqual({ status: ALLERGEN_STATUS.Declared, allergens: [] });
  });

  it("un código desconocido invalida la declaración", () => {
    expect(allergensFromStored(["gluten", "picante"]).status).toBe(ALLERGEN_STATUS.NotDeclared);
  });

  it("ordena según el reglamento y todos tienen nombre", () => {
    expect(sortAllergens(["sulfitos", "gluten", "lacteos"])).toEqual([
      "gluten",
      "lacteos",
      "sulfitos",
    ]);
    expect(Object.keys(ALLERGEN_LABEL)).toEqual([...ALLERGENS]);
  });
});
