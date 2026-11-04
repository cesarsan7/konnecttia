import { describe, expect, it } from "vitest";
import {
  copyDayToAll,
  type Day,
  dayLabel,
  parseMinuteList,
  parseMinutes,
  settingsErrorMessage,
} from "./settings";

const day = (dia: string, overrides: Partial<Day> = {}): Day => ({
  dia,
  disponible: true,
  apertura_1: "12:00",
  cierre_1: "16:00",
  apertura_2: null,
  cierre_2: null,
  ...overrides,
});

describe("ajustes", () => {
  it("lee minutos y listas de minutos", () => {
    expect(parseMinutes("20")).toBe(20);
    expect(parseMinutes(" ")).toBeNull();
    expect(parseMinutes("0")).toBeUndefined();
    expect(parseMinutes("abc")).toBeUndefined();
    expect(parseMinuteList("20, 10 20")).toEqual([10, 20]);
    expect(parseMinuteList("10, x")).toBeUndefined();
    expect(parseMinuteList("")).toEqual([]);
  });

  it("copia un día al resto de la semana", () => {
    const week = [
      day("Lunes", { disponible: false }),
      day("Martes", { cierre_2: "23:00", apertura_2: "20:00" }),
    ];
    expect(copyDayToAll(week, "Martes").map(dayLabel)).toEqual([
      "12:00–16:00 · 20:00–23:00",
      "12:00–16:00 · 20:00–23:00",
    ]);
    expect(copyDayToAll(week, "Martes")[0]?.dia).toBe("Lunes");
  });

  it("resume un día cerrado o con dos turnos", () => {
    expect(dayLabel(day("Lunes", { disponible: false }))).toBe("Cerrado");
    expect(dayLabel(day("Lunes"))).toBe("12:00–16:00");
  });

  it("traduce los motivos de la API y nombra el día", () => {
    expect(settingsErrorMessage("transfer_without_iban")).toMatch(/IBAN/);
    expect(settingsErrorMessage("incomplete_shift", "Martes")).toMatch(/^Martes: /);
    expect(settingsErrorMessage("desconocido")).toMatch(/No se pudo guardar/);
  });
});
