import { describe, expect, it } from "vitest";
import { activityErrorMessage, actorLabel, formatMoment, minutesBetween } from "./activity";

describe("formatMoment", () => {
  it("da día/mes y hora en la zona del restaurante", () => {
    expect(formatMoment("2026-11-03T13:05:00Z", "Europe/Madrid")).toBe("03/11 14:05");
    expect(formatMoment("2026-11-03T13:05:00Z", "Atlantic/Canary")).toBe("03/11 13:05");
  });

  it("muestra un guion si falta o no es válida", () => {
    expect(formatMoment(null, "Europe/Madrid")).toBe("—");
    expect(formatMoment("nada", "Europe/Madrid")).toBe("—");
  });
});

describe("minutesBetween", () => {
  it("calcula minutos y descarta datos incompletos o al revés", () => {
    expect(minutesBetween("2026-11-03T13:00:00Z", "2026-11-03T13:20:00Z")).toBe(20);
    expect(minutesBetween(null, "2026-11-03T13:20:00Z")).toBeNull();
    expect(minutesBetween("2026-11-03T13:20:00Z", "2026-11-03T13:00:00Z")).toBeNull();
  });
});

describe("actorLabel y errores", () => {
  it("usa el actor o, si no consta, el origen", () => {
    expect(actorLabel({ actor: "ana@x.es", origen: "reparto" })).toBe("ana@x.es");
    expect(actorLabel({ actor: null, origen: "trigger" })).toBe("Sistema");
    expect(actorLabel({ actor: null, origen: "n8n" })).toBe("n8n");
  });

  it("traduce los errores de la API", () => {
    expect(activityErrorMessage(400)).toContain("fechas");
    expect(activityErrorMessage(404)).toContain("No encontramos");
    expect(activityErrorMessage(500)).toContain("No se pudo cargar");
  });
});
