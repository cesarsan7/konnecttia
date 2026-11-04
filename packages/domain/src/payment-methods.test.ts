import { describe, expect, it } from "vitest";
import { checkPaymentSetup, isValidIban, PAYMENT_SETUP_ERROR } from "./payment-methods";
import { checkDaySchedule, SCHEDULE_ERROR, sameWeekday } from "./schedule";

describe("métodos de pago", () => {
  it("exige al menos uno", () => {
    expect(checkPaymentSetup([], null)).toBe(PAYMENT_SETUP_ERROR.NoMethod);
  });

  it("transferencia necesita IBAN y titular; Bizum, un teléfono", () => {
    expect(checkPaymentSetup(["transferencia"], { iban: "ES91 2100 0418 4502 0005 1332" })).toBe(
      PAYMENT_SETUP_ERROR.TransferWithoutIban,
    );
    expect(
      checkPaymentSetup(["transferencia"], { iban: "ES9121000418450200051332", titular: "Ana" }),
    ).toBeNull();
    expect(checkPaymentSetup(["bizum"], {})).toBe(PAYMENT_SETUP_ERROR.BizumWithoutPhone);
    expect(checkPaymentSetup(["efectivo", "tarjeta"], null)).toBeNull();
  });

  it("valida el dígito de control del IBAN", () => {
    expect(isValidIban("ES91 2100 0418 4502 0005 1332")).toBe(true);
    expect(isValidIban("ES92 2100 0418 4502 0005 1332")).toBe(false);
    expect(isValidIban("1234")).toBe(false);
  });
});

describe("horario de un día", () => {
  const day = {
    dia: "Lunes",
    disponible: true,
    apertura_1: "12:00",
    cierre_1: "16:00",
    apertura_2: null,
    cierre_2: null,
  };

  it("acepta turnos completos y cruces de medianoche", () => {
    expect(checkDaySchedule(day)).toBeNull();
    expect(checkDaySchedule({ ...day, apertura_2: "20:00", cierre_2: "01:00" })).toBeNull();
    expect(
      checkDaySchedule({ ...day, disponible: false, apertura_1: null, cierre_1: null }),
    ).toBeNull();
  });

  it("rechaza turnos a medias, vacíos o un día abierto sin turnos", () => {
    expect(checkDaySchedule({ ...day, cierre_1: null })).toBe(SCHEDULE_ERROR.IncompleteShift);
    expect(checkDaySchedule({ ...day, cierre_1: "12:00" })).toBe(SCHEDULE_ERROR.EmptyShift);
    expect(
      checkDaySchedule({
        ...day,
        apertura_1: null,
        cierre_1: null,
        apertura_2: "20:00",
        cierre_2: "23:00",
      }),
    ).toBe(SCHEDULE_ERROR.SecondWithoutFirst);
    expect(checkDaySchedule({ ...day, apertura_1: null, cierre_1: null })).toBe(
      SCHEDULE_ERROR.OpenWithoutShift,
    );
  });

  it("compara días sin tildes ni mayúsculas", () => {
    expect(sameWeekday("miercoles", "Miércoles")).toBe(true);
    expect(sameWeekday("Lunes", "Martes")).toBe(false);
  });
});
