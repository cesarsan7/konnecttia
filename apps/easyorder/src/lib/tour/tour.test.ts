import { describe, expect, it } from "vitest";
import {
  availableSteps,
  hasSeenTour,
  isSettled,
  markTourSeen,
  placeBalloon,
  presentSteps,
  sectionFromPath,
  spotlightRect,
  stepIndexFrom,
  stepLabel,
  TOUR_SECTION,
  type TourStep,
  type TourStorage,
  tourKey,
  visibleRect,
} from "./tour";

const step = (target: string, extra: Partial<TourStep> = {}): TourStep => ({
  target,
  title: target,
  body: "texto",
  ...extra,
});

describe("availableSteps", () => {
  const steps = [
    step("libre"),
    step("con-permiso", { permission: "orders.create" }),
    step("con-modulo", { module: "tables" }),
    step("ambos", { permission: "tables.manage", module: "tables" }),
  ];

  it("deja todos los pasos sin condiciones", () => {
    const all = availableSteps(steps, { can: () => true, modules: ["tables"] });
    expect(all.map((s) => s.target)).toEqual(["libre", "con-permiso", "con-modulo", "ambos"]);
  });

  it("quita los pasos de permisos que la persona no tiene", () => {
    const result = availableSteps(steps, {
      can: (permission) => permission !== "orders.create",
      modules: ["tables"],
    });
    expect(result.map((s) => s.target)).toEqual(["libre", "con-modulo", "ambos"]);
  });

  it("quita los pasos de módulos que el restaurante no tiene", () => {
    const result = availableSteps(steps, { can: () => true, modules: [] });
    expect(result.map((s) => s.target)).toEqual(["libre", "con-permiso"]);
  });

  it("pide el permiso y el módulo a la vez", () => {
    const result = availableSteps(steps, {
      can: (permission) => permission !== "tables.manage",
      modules: ["tables"],
    });
    expect(result.map((s) => s.target)).not.toContain("ambos");
  });

  it("sin pasos devuelve una lista vacía", () => {
    expect(availableSteps([], { can: () => true, modules: [] })).toEqual([]);
  });
});

describe("stepIndexFrom y presentSteps", () => {
  const steps = [step("a"), step("b"), step("c"), step("d")];
  const only =
    (...targets: string[]) =>
    (s: TourStep) =>
      targets.includes(s.target);

  it("salta los pasos cuyo elemento no existe", () => {
    expect(stepIndexFrom(steps, 0, 1, only("a", "c"))).toBe(0);
    expect(stepIndexFrom(steps, 1, 1, only("a", "c"))).toBe(2);
    expect(stepIndexFrom(steps, 3, 1, only("a", "c"))).toBeNull();
  });

  it("también salta hacia atrás", () => {
    expect(stepIndexFrom(steps, 2, -1, only("a", "d"))).toBe(0);
    expect(stepIndexFrom(steps, 0, -1, only("d"))).toBeNull();
  });

  it("devuelve null si no existe ninguno o la lista está vacía", () => {
    expect(stepIndexFrom(steps, 0, 1, () => false)).toBeNull();
    expect(stepIndexFrom([], 0, 1, () => true)).toBeNull();
  });

  it("no se sale de la lista con un índice fuera de rango", () => {
    expect(stepIndexFrom(steps, 9, 1, () => true)).toBeNull();
    expect(stepIndexFrom(steps, -1, -1, () => true)).toBeNull();
  });

  it("presentSteps conserva el orden de los que existen", () => {
    expect(presentSteps(steps, only("d", "b")).map((s) => s.target)).toEqual(["b", "d"]);
  });

  it("stepLabel cuenta desde 1", () => {
    expect(stepLabel(1, 5)).toBe("Paso 2 de 5");
    expect(stepLabel(0, 1)).toBe("Paso 1 de 1");
  });
});

describe("sectionFromPath", () => {
  it("reconoce cada sección del panel", () => {
    expect(sectionFromPath("/panel/mi-bar", "mi-bar")).toBe(TOUR_SECTION.Orders);
    expect(sectionFromPath("/panel/mi-bar/", "mi-bar")).toBe(TOUR_SECTION.Orders);
    expect(sectionFromPath("/panel/mi-bar/mesas", "mi-bar")).toBe(TOUR_SECTION.Tables);
    expect(sectionFromPath("/panel/mi-bar/carta", "mi-bar")).toBe(TOUR_SECTION.Menu);
    expect(sectionFromPath("/panel/mi-bar/clientes", "mi-bar")).toBe(TOUR_SECTION.Customers);
    expect(sectionFromPath("/panel/mi-bar/estadisticas", "mi-bar")).toBe(TOUR_SECTION.Stats);
    expect(sectionFromPath("/panel/mi-bar/equipo", "mi-bar")).toBe(TOUR_SECTION.Team);
    expect(sectionFromPath("/panel/mi-bar/ajustes", "mi-bar")).toBe(TOUR_SECTION.Settings);
    expect(sectionFromPath("/panel/mi-bar/repartos", "mi-bar")).toBe(TOUR_SECTION.Deliveries);
  });

  it("devuelve null fuera del panel del restaurante o en rutas sin guía", () => {
    expect(sectionFromPath("/panel", "mi-bar")).toBeNull();
    expect(sectionFromPath("/panel/otro/mesas", "mi-bar")).toBeNull();
    expect(sectionFromPath("/panel/mi-bar/pedidos", "mi-bar")).toBeNull();
    expect(sectionFromPath("/panel/mi-bar/nada", "mi-bar")).toBeNull();
    expect(sectionFromPath("/panel/mi-barra", "mi-bar")).toBeNull();
  });
});

describe("visibleRect y spotlightRect", () => {
  const viewport = { width: 400, height: 800 };

  it("recorta a la pantalla lo que se sale", () => {
    expect(visibleRect({ top: -50, left: -20, width: 500, height: 300 }, viewport)).toEqual({
      top: 0,
      left: 0,
      width: 400,
      height: 250,
    });
  });

  it("un elemento fuera de la pantalla queda sin tamaño", () => {
    const rect = visibleRect({ top: 900, left: 0, width: 100, height: 50 }, viewport);
    expect(rect.height).toBe(0);
  });

  it("el foco añade aire alrededor del elemento", () => {
    expect(spotlightRect({ top: 100, left: 50, width: 100, height: 40 }, viewport, 6)).toEqual({
      top: 94,
      left: 44,
      width: 112,
      height: 52,
    });
  });

  it("el foco no sale de la pantalla", () => {
    const rect = spotlightRect({ top: 0, left: 0, width: 400, height: 800 }, viewport, 6);
    expect(rect).toEqual({ top: 0, left: 0, width: 400, height: 800 });
  });
});

describe("placeBalloon", () => {
  const desktop = { width: 1280, height: 800 };
  const phone = { width: 360, height: 640 };
  const balloon = { width: 352, height: 220 };

  const inside = (pos: ReturnType<typeof placeBalloon>, viewport: typeof desktop, margin = 12) => {
    expect(pos.left).toBeGreaterThanOrEqual(margin);
    expect(pos.top).toBeGreaterThanOrEqual(margin);
    expect(pos.left + pos.width).toBeLessThanOrEqual(viewport.width - margin);
  };

  it("va debajo del elemento si cabe", () => {
    const pos = placeBalloon({ top: 100, left: 500, width: 200, height: 40 }, balloon, desktop);
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(100 + 40 + 14);
    // centrado en el elemento
    expect(pos.left).toBe(600 - 176);
    inside(pos, desktop);
  });

  it("va encima si abajo no hay sitio", () => {
    const pos = placeBalloon({ top: 650, left: 500, width: 200, height: 40 }, balloon, desktop);
    expect(pos.placement).toBe("top");
    expect(pos.top).toBe(650 - 14 - 220);
    inside(pos, desktop);
  });

  it("se queda dentro de la pantalla cuando el elemento está pegado al borde derecho", () => {
    const pos = placeBalloon({ top: 100, left: 1200, width: 70, height: 40 }, balloon, desktop);
    expect(pos.left + pos.width).toBeLessThanOrEqual(desktop.width - 12);
    expect(pos.arrow).not.toBeNull();
    // La flecha sigue señalando al elemento aunque el globo se haya desplazado.
    expect((pos.arrow ?? 0) + pos.left).toBeGreaterThan(1200);
  });

  it("se queda dentro de la pantalla cuando el elemento está pegado al borde izquierdo", () => {
    const pos = placeBalloon({ top: 100, left: 0, width: 40, height: 40 }, balloon, desktop);
    expect(pos.left).toBe(12);
  });

  it("si el elemento ocupa casi toda la pantalla, el globo va dentro, abajo", () => {
    const pos = placeBalloon({ top: 20, left: 0, width: 1280, height: 700 }, balloon, desktop);
    expect(pos.placement).toBe("inside");
    expect(pos.arrow).toBeNull();
    expect(pos.top + 220).toBeLessThanOrEqual(desktop.height - 12);
    expect(pos.top).toBe(desktop.height - 220 - 12);
  });

  it("si el elemento está en la mitad baja y ocupa el resto, el globo va arriba", () => {
    const pos = placeBalloon({ top: 150, left: 0, width: 1280, height: 650 }, balloon, desktop);
    expect(pos.placement).toBe("inside");
    expect(pos.top).toBe(12);
  });

  it("en un móvil estrecho el globo se ajusta al ancho de la pantalla", () => {
    const pos = placeBalloon({ top: 100, left: 20, width: 320, height: 40 }, balloon, phone);
    expect(pos.width).toBe(360 - 24);
    expect(pos.left).toBe(12);
    expect(pos.placement).toBe("bottom");
    inside(pos, phone);
  });

  it("en un móvil, con el elemento abajo, el globo va encima y entero a la vista", () => {
    const pos = placeBalloon({ top: 540, left: 20, width: 320, height: 60 }, balloon, phone);
    expect(pos.placement).toBe("top");
    expect(pos.top).toBeGreaterThanOrEqual(12);
    expect(pos.top + 220).toBeLessThanOrEqual(540 - 14);
  });

  it("nunca sale de la pantalla aunque el globo sea más alto que ella", () => {
    const tall = { width: 352, height: 900 };
    const pos = placeBalloon({ top: 100, left: 20, width: 100, height: 40 }, tall, phone);
    expect(pos.top).toBeGreaterThanOrEqual(12);
    expect(pos.maxHeight).toBe(640 - 24);
  });

  it("recorta el elemento a lo visible antes de colocar el globo", () => {
    // El elemento empieza por encima de la pantalla: se señala la parte que se ve.
    const pos = placeBalloon({ top: -400, left: 100, width: 200, height: 450 }, balloon, desktop);
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(50 + 14);
  });

  it("un elemento sin tamaño visible coloca el globo dentro de la pantalla", () => {
    const pos = placeBalloon({ top: 2000, left: 100, width: 200, height: 50 }, balloon, desktop);
    expect(pos.placement).toBe("inside");
    inside(pos, desktop);
  });
});

describe("recordado en el navegador", () => {
  const memory = (): TourStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    };
  };

  it("la clave distingue usuario y sección", () => {
    expect(tourKey("u1", TOUR_SECTION.Orders)).not.toBe(tourKey("u2", TOUR_SECTION.Orders));
    expect(tourKey("u1", TOUR_SECTION.Orders)).not.toBe(tourKey("u1", TOUR_SECTION.Menu));
  });

  it("no la ha visto hasta que se marca", () => {
    const storage = memory();
    expect(hasSeenTour(storage, "u1", TOUR_SECTION.Menu)).toBe(false);
    markTourSeen(storage, "u1", TOUR_SECTION.Menu, new Date("2026-11-05T10:00:00Z"));
    expect(hasSeenTour(storage, "u1", TOUR_SECTION.Menu)).toBe(true);
    expect(storage.data.get(tourKey("u1", TOUR_SECTION.Menu))).toBe("2026-11-05T10:00:00.000Z");
  });

  it("verla en una sección o con un usuario no la marca en otros", () => {
    const storage = memory();
    markTourSeen(storage, "u1", TOUR_SECTION.Menu);
    expect(hasSeenTour(storage, "u1", TOUR_SECTION.Orders)).toBe(false);
    expect(hasSeenTour(storage, "u2", TOUR_SECTION.Menu)).toBe(false);
  });

  it("sin almacenamiento se da por vista, para no insistir", () => {
    expect(hasSeenTour(null, "u1", TOUR_SECTION.Menu)).toBe(true);
    expect(() => markTourSeen(null, "u1", TOUR_SECTION.Menu)).not.toThrow();
  });

  it("si el almacenamiento lanza errores, no rompe y se da por vista", () => {
    const broken: TourStorage = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("lleno");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(hasSeenTour(broken, "u1", TOUR_SECTION.Menu)).toBe(true);
    expect(() => markTourSeen(broken, "u1", TOUR_SECTION.Menu)).not.toThrow();
  });
});

describe("isSettled", () => {
  it("espera a tener suficientes lecturas", () => {
    expect(isSettled([3, 3])).toBe(false);
  });

  it("no arranca mientras la cuenta cambia", () => {
    expect(isSettled([1, 2, 3])).toBe(false);
    expect(isSettled([2, 3, 3])).toBe(false);
  });

  it("no arranca si no hay ningún paso visible", () => {
    expect(isSettled([0, 0, 0])).toBe(false);
  });

  it("arranca cuando la cuenta se mantiene", () => {
    expect(isSettled([1, 4, 4, 4])).toBe(true);
  });
});
