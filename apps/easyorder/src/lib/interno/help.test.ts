import { describe, expect, it } from "vitest";
import { INTERNO_HELP } from "./help";

describe("ayuda contextual de /interno", () => {
  it("cada parámetro explica para qué sirve y cómo funciona", () => {
    for (const [section, items] of Object.entries(INTERNO_HELP)) {
      expect(items.length, section).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.para.trim(), item.campo).not.toBe("");
        expect(item.como.trim(), item.campo).not.toBe("");
      }
    }
  });
});
