import { describe, expect, it } from "vitest";
import {
  checklistItems,
  checklistProgress,
  DEFAULT_PREFS,
  readChecklistPrefs,
  saveChecklistPrefs,
} from "./onboarding";

const base = "/panel/mi-bar";
const empty = {
  logo: false,
  carta: false,
  horario: false,
  pagos: true,
  zonas: null,
  equipo: false,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("checklist de primeros pasos", () => {
  it("sin reparto no hay paso de zonas", () => {
    const ids = checklistItems(empty, base).map((item) => item.id);
    expect(ids).toEqual(["logo", "carta", "horario", "pagos", "equipo"]);
  });

  it("con reparto aparece el paso de zonas, antes del equipo", () => {
    const ids = checklistItems({ ...empty, zonas: false }, base).map((item) => item.id);
    expect(ids).toEqual(["logo", "carta", "horario", "pagos", "zonas", "equipo"]);
  });

  it("cada ítem enlaza a su pantalla", () => {
    const items = checklistItems({ ...empty, zonas: false }, base);
    const href = Object.fromEntries(items.map((item) => [item.id, item.href]));
    expect(href).toMatchObject({
      carta: "/panel/mi-bar/carta",
      equipo: "/panel/mi-bar/equipo",
      logo: "/panel/mi-bar/ajustes",
    });
  });

  it("cuenta lo hecho y detecta cuándo está completo", () => {
    const items = checklistItems(empty, base);
    expect(checklistProgress(items)).toEqual({ done: 1, total: 5, complete: false });
    const all = checklistItems(
      { logo: true, carta: true, horario: true, pagos: true, zonas: true, equipo: true },
      base,
    );
    expect(checklistProgress(all)).toEqual({ done: 6, total: 6, complete: true });
    expect(checklistProgress([]).complete).toBe(false);
  });
});

describe("preferencias del checklist en el navegador", () => {
  it("guarda y lee por restaurante", () => {
    const storage = memoryStorage();
    saveChecklistPrefs("mi-bar", { hidden: true, collapsed: false }, storage);
    expect(readChecklistPrefs("mi-bar", storage)).toEqual({ hidden: true, collapsed: false });
    expect(readChecklistPrefs("otro-bar", storage)).toEqual(DEFAULT_PREFS);
  });

  it("sin almacenamiento usa los valores por defecto y no falla al guardar", () => {
    expect(readChecklistPrefs("mi-bar", null)).toEqual(DEFAULT_PREFS);
    expect(() => saveChecklistPrefs("mi-bar", DEFAULT_PREFS, null)).not.toThrow();
  });

  it("un almacenamiento que lanza o con datos rotos no rompe nada", () => {
    const throwing = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(readChecklistPrefs("mi-bar", throwing)).toEqual(DEFAULT_PREFS);
    expect(() => saveChecklistPrefs("mi-bar", DEFAULT_PREFS, throwing)).not.toThrow();
    const broken = memoryStorage({ "easyorder.panel.primeros-pasos.mi-bar": "{no es json" });
    expect(readChecklistPrefs("mi-bar", broken)).toEqual(DEFAULT_PREFS);
    const odd = memoryStorage({ "easyorder.panel.primeros-pasos.mi-bar": "[1,2]" });
    expect(readChecklistPrefs("mi-bar", odd)).toEqual(DEFAULT_PREFS);
  });
});
