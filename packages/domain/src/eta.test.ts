import { describe, expect, it } from "vitest";
import { adjustEta, ETA_SERVICE, extraMinutes, formatEtaRange } from "./eta";

const TZ = "Atlantic/Canary";
// Viernes 6 de noviembre de 2026, 20:30 en Canarias (UTC+0).
const fridayNight = new Date("2026-11-06T20:30:00Z");
const base = { min: 20, max: 20 };

describe("tiempo estimado variable", () => {
  it("sin ajustes, la base", () => {
    expect(formatEtaRange(adjustEta(base, ETA_SERVICE.Pickup, {}, fridayNight, TZ))).toBe("20 min");
  });

  it("sin base configurada no se inventa un tiempo", () => {
    expect(adjustEta(null, ETA_SERVICE.Pickup, { busy: [] }, fridayNight, TZ)).toBeNull();
  });

  it("suma la franja punta del día y servicio que coinciden (la mayor)", () => {
    const peaks = [
      { day: "Viernes", from: "20:00", to: "22:00", service: ETA_SERVICE.Both, extraMinutes: 10 },
      { day: null, from: "20:00", to: "21:00", service: ETA_SERVICE.Pickup, extraMinutes: 5 },
      { day: "Sábado", from: "20:00", to: "22:00", service: ETA_SERVICE.Both, extraMinutes: 30 },
      {
        day: "Viernes",
        from: "20:00",
        to: "22:00",
        service: ETA_SERVICE.Delivery,
        extraMinutes: 25,
      },
    ];
    expect(extraMinutes(ETA_SERVICE.Pickup, { peaks }, fridayNight, TZ)).toBe(10);
    expect(extraMinutes(ETA_SERVICE.Delivery, { peaks }, fridayNight, TZ)).toBe(25);
  });

  it("las franjas que cruzan la medianoche cuentan para el día en que empiezan", () => {
    const peaks = [
      { day: "Viernes", from: "23:00", to: "01:00", service: ETA_SERVICE.Both, extraMinutes: 15 },
    ];
    expect(extraMinutes(ETA_SERVICE.Pickup, { peaks }, new Date("2026-11-07T00:30:00Z"), TZ)).toBe(
      15,
    );
    expect(extraMinutes(ETA_SERVICE.Pickup, { peaks }, new Date("2026-11-08T00:30:00Z"), TZ)).toBe(
      0,
    );
  });

  it("el modo ocupado suma mientras no caduca", () => {
    const busy = [
      { service: ETA_SERVICE.Both, extraMinutes: 15, until: new Date("2026-11-06T21:00:00Z") },
      { service: ETA_SERVICE.Both, extraMinutes: 40, until: new Date("2026-11-06T20:00:00Z") },
    ];
    expect(extraMinutes(ETA_SERVICE.Pickup, { busy }, fridayNight, TZ)).toBe(15);
  });

  it("la cola suma minutos por cada pedido activo por encima del umbral", () => {
    const queue = { minutesPerOrder: 2, freeOrders: 3 };
    expect(extraMinutes(ETA_SERVICE.Pickup, { queue, activeOrders: 2 }, fridayNight, TZ)).toBe(0);
    expect(extraMinutes(ETA_SERVICE.Pickup, { queue, activeOrders: 8 }, fridayNight, TZ)).toBe(10);
  });

  it("todo junto", () => {
    const range = adjustEta(
      { min: 30, max: 45 },
      ETA_SERVICE.Delivery,
      {
        peaks: [
          { day: null, from: "20:00", to: "22:00", service: ETA_SERVICE.Both, extraMinutes: 10 },
        ],
        busy: [
          {
            service: ETA_SERVICE.Delivery,
            extraMinutes: 15,
            until: new Date("2026-11-06T22:00:00Z"),
          },
        ],
        queue: { minutesPerOrder: 1, freeOrders: 5 },
        activeOrders: 10,
      },
      fridayNight,
      TZ,
    );
    expect(formatEtaRange(range)).toBe("60-75 min");
  });
});
