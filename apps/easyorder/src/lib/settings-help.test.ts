import { describe, expect, it } from "vitest";
import { SETTINGS_HELP } from "./settings-help";

describe("ayuda contextual de Ajustes", () => {
  it("cada parámetro explica para qué sirve y cómo funciona", () => {
    for (const [section, items] of Object.entries(SETTINGS_HELP)) {
      expect(items.length, section).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.campo.trim(), section).not.toBe("");
        expect(item.para.trim(), item.campo).not.toBe("");
        expect(item.como.trim(), item.campo).not.toBe("");
      }
    }
  });
});
