import { describe, expect, it } from "vitest";
import { type DaySchedule, isOpenAt } from "./schedule";

const TZ = "Atlantic/Canary";

const day = (
  dia: string,
  a1: string | null,
  c1: string | null,
  a2: string | null = null,
  c2: string | null = null,
  disponible = true,
): DaySchedule => ({
  dia,
  disponible,
  apertura_1: a1,
  cierre_1: c1,
  apertura_2: a2,
  cierre_2: c2,
});

// Horario partido como el de una pizzería: 12:30–16:00 y 19:30–23:30; viernes hasta las 01:00.
const schedule = [
  day("Lunes", null, null, null, null, false),
  day("Martes", "12:30", "16:00", "19:30", "23:30"),
  day("Miércoles", "12:30", "16:00", "19:30", "23:30"),
  day("Jueves", "12:30", "16:00", "19:30", "23:30"),
  day("Viernes", "12:30:00", "16:00:00", "19:30:00", "01:00:00"),
  day("Sábado", "19:30", "23:30"),
  day("Domingo", "19:30", "23:30"),
];

describe("isOpenAt", () => {
  it("respeta los dos turnos en hora de Canarias (invierno, UTC+0)", () => {
    // Martes 3 de noviembre de 2026
    expect(isOpenAt(schedule, TZ, new Date("2026-11-03T13:00:00Z"))).toBe(true);
    expect(isOpenAt(schedule, TZ, new Date("2026-11-03T17:00:00Z"))).toBe(false);
    expect(isOpenAt(schedule, TZ, new Date("2026-11-03T20:00:00Z"))).toBe(true);
  });

  it("aplica el horario de verano (UTC+1)", () => {
    // Martes 7 de julio de 2026, 12:45 en Canarias = 11:45 UTC
    expect(isOpenAt(schedule, TZ, new Date("2026-07-07T11:45:00Z"))).toBe(true);
    // 12:15 en Canarias = 11:15 UTC: aún cerrado
    expect(isOpenAt(schedule, TZ, new Date("2026-07-07T11:15:00Z"))).toBe(false);
  });

  it("un turno que cruza la medianoche sigue abierto de madrugada al día siguiente", () => {
    // Sábado 7 de noviembre de 2026 a las 00:30 (turno del viernes hasta las 01:00)
    expect(isOpenAt(schedule, TZ, new Date("2026-11-07T00:30:00Z"))).toBe(true);
    expect(isOpenAt(schedule, TZ, new Date("2026-11-07T01:30:00Z"))).toBe(false);
  });

  it("un día no disponible está cerrado", () => {
    // Lunes 2 de noviembre de 2026
    expect(isOpenAt(schedule, TZ, new Date("2026-11-02T13:00:00Z"))).toBe(false);
  });

  it("el cierre o la apertura manual del panel mandan sobre el horario", () => {
    const tuesdayLunch = new Date("2026-11-03T13:00:00Z");
    expect(isOpenAt(schedule, TZ, tuesdayLunch, false)).toBe(false);
    expect(isOpenAt(schedule, TZ, new Date("2026-11-02T13:00:00Z"), true)).toBe(true);
  });

  it("acepta nombres de día sin tilde", () => {
    const sinTilde = [day("Miercoles", "10:00", "12:00")];
    // Miércoles 4 de noviembre de 2026
    expect(isOpenAt(sinTilde, TZ, new Date("2026-11-04T11:00:00Z"))).toBe(true);
  });
});

describe("festivos", () => {
  // Como Cafetería Siempre Juntos: martes a sábado 16:00–00:00; domingos y festivos 08:00–00:00.
  const cafeteria = [
    day("Lunes", null, null, null, null, false),
    day("Martes", "16:00", "00:00"),
    day("Miércoles", "16:00", "00:00"),
    day("Jueves", "16:00", "00:00"),
    day("Viernes", "16:00", "00:00"),
    day("Sábado", "16:00", "00:00"),
    day("Domingo", "08:00", "00:00"),
  ];
  // Martes 8 de diciembre de 2026 (Inmaculada Concepción), Canarias en UTC+0.
  const manana = new Date("2026-12-08T10:00:00Z");
  const noche = new Date("2026-12-08T23:30:00Z");

  it("sin festivo, un martes por la mañana está cerrado", () => {
    expect(isOpenAt(cafeteria, TZ, manana)).toBe(false);
    expect(isOpenAt(cafeteria, TZ, noche)).toBe(true);
  });

  it("un festivo usa el horario del domingo", () => {
    const festivos = [{ date: "2026-12-08", closed: false }];
    expect(isOpenAt(cafeteria, TZ, manana, null, festivos)).toBe(true);
    expect(isOpenAt(cafeteria, TZ, noche, null, festivos)).toBe(true);
  });

  it("un festivo puede cerrar todo el día", () => {
    const festivos = [{ date: "2026-12-08", closed: true }];
    expect(isOpenAt(cafeteria, TZ, noche, null, festivos)).toBe(false);
  });

  it("un festivo en lunes abre aunque el lunes sea de descanso", () => {
    // Lunes 7 de diciembre de 2026.
    const lunes = new Date("2026-12-07T12:00:00Z");
    expect(isOpenAt(cafeteria, TZ, lunes)).toBe(false);
    expect(isOpenAt(cafeteria, TZ, lunes, null, [{ date: "2026-12-07", closed: false }])).toBe(
      true,
    );
  });

  it("el turno de madrugada sigue el horario del día en que empezó", () => {
    // Viernes que cierra a la 01:00; el sábado es festivo cerrado: a las 00:30 sigue abierto.
    const madrugada = new Date("2026-11-07T00:30:00Z");
    expect(isOpenAt(schedule, TZ, madrugada, null, [{ date: "2026-11-07", closed: true }])).toBe(
      true,
    );
    // Si el festivo cerrado es el viernes, ese turno no existe.
    expect(isOpenAt(schedule, TZ, madrugada, null, [{ date: "2026-11-06", closed: true }])).toBe(
      false,
    );
  });

  it("la apertura o el cierre manual mandan sobre el festivo", () => {
    const festivos = [{ date: "2026-12-08", closed: true }];
    expect(isOpenAt(cafeteria, TZ, noche, true, festivos)).toBe(true);
  });
});
