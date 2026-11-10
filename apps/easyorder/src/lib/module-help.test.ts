import { describe, expect, it } from "vitest";
import { MODULE_HELP } from "./module-help";

describe("ayuda contextual de Equipo, Mesas, Carta y Comanda", () => {
  it("cada parámetro explica para qué sirve y cómo funciona", () => {
    for (const [section, items] of Object.entries(MODULE_HELP)) {
      expect(items.length, section).toBeGreaterThan(0);
      const names = new Set<string>();
      for (const item of items) {
        expect(item.campo.trim(), section).not.toBe("");
        expect(item.para.trim(), item.campo).not.toBe("");
        expect(item.como.trim(), item.campo).not.toBe("");
        expect(names.has(item.campo), `${section}: ${item.campo} repetido`).toBe(false);
        names.add(item.campo);
      }
    }
  });
});
