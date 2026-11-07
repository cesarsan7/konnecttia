import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TOURS } from "../../tour/steps";
import { HELP_SLUG } from "../slugs";
import { HELP_PAGES } from "./index";

const PUBLIC_AYUDA = join(process.cwd(), "public", "ayuda");

describe("contenido de la ayuda", () => {
  it("tiene una página por cada slug y ninguno repetido", () => {
    const slugs = HELP_PAGES.map((page) => page.slug).sort();
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(Object.values(HELP_SLUG).sort());
  });

  it("cada tour apunta a una página que existe", () => {
    const slugs = new Set<string>(HELP_PAGES.map((page) => page.slug));
    for (const tour of TOURS) expect(slugs.has(tour.help)).toBe(true);
  });

  it("las páginas relacionadas existen y no se enlazan a sí mismas", () => {
    const slugs = new Set<string>(HELP_PAGES.map((page) => page.slug));
    for (const page of HELP_PAGES) {
      for (const related of page.related) {
        expect(slugs.has(related)).toBe(true);
        expect(related).not.toBe(page.slug);
      }
    }
  });

  it("cada página tiene resumen, pasos y preguntas", () => {
    for (const page of HELP_PAGES) {
      expect(page.summary.length).toBeGreaterThan(10);
      expect(page.purpose.length).toBeGreaterThan(0);
      expect(page.steps.length).toBeGreaterThan(0);
      expect(page.faq.length).toBeGreaterThan(0);
    }
  });

  it("cada captura existe en versión de escritorio y de móvil", () => {
    for (const page of HELP_PAGES) {
      for (const step of page.steps) {
        if (!step.shot) continue;
        for (const device of ["escritorio", "movil"]) {
          const file = join(PUBLIC_AYUDA, `${step.shot.file}-${device}.png`);
          expect(existsSync(file), file).toBe(true);
        }
        expect(step.shot.alt.length).toBeGreaterThan(10);
      }
    }
  });
});
