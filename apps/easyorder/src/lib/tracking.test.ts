import { describe, expect, it, vi } from "vitest";
import {
  contactHref,
  copyText,
  formatMinutes,
  isClosed,
  minutesBetween,
  stepTimes,
} from "./tracking";

describe("seguimiento", () => {
  it.each(["entregado", "cancelado", "expirado"])("%s está cerrado", (estado) => {
    expect(isClosed(estado)).toBe(true);
  });

  it.each(["recibido", "pendiente_pago", "confirmado", "en_preparacion", "en_camino", "listo"])(
    "%s sigue abierto",
    (estado) => {
      expect(isClosed(estado)).toBe(false);
    },
  );

  it("copia el enlace y avisa de si pudo", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyText("https://x.test/a/pedido/t", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x.test/a/pedido/t");
  });

  it("si el portapapeles falla o no existe, devuelve false sin lanzar", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denegado"));
    expect(await copyText("https://x.test", { writeText })).toBe(false);
    expect(await copyText("https://x.test", undefined)).toBe(false);
  });

  it("arma el enlace de «Contactar con el local» solo con un teléfono usable", () => {
    expect(contactHref("+34 928 12 34 56")).toBe("tel:+34928123456");
    expect(contactHref("12")).toBeNull();
    expect(contactHref(null)).toBeNull();
  });
});

describe("tiempos del seguimiento", () => {
  const steps = ["recibido", "confirmado", "en_preparacion", "listo", "entregado"];
  const createdAt = "2026-11-15T12:00:00Z";

  it("calcula los minutos desde la llegada y desde el paso anterior", () => {
    const times = stepTimes(
      steps,
      [
        { estado: "recibido", desde: "2026-11-15T12:00:00Z" },
        { estado: "confirmado", desde: "2026-11-15T12:03:30Z" },
        { estado: "en_preparacion", desde: "2026-11-15T12:10:00Z" },
      ],
      createdAt,
    );
    expect(times[0]).toEqual({ desdeLlegada: 0, desdeAnterior: null });
    expect(times[1]).toEqual({ desdeLlegada: 3, desdeAnterior: 3 });
    expect(times[2]).toEqual({ desdeLlegada: 10, desdeAnterior: 6 });
    expect(times[3]).toBeNull();
    expect(times[4]).toBeNull();
  });

  it("«pagado» cuenta como «confirmado» y un paso saltado no rompe el cálculo", () => {
    const times = stepTimes(
      steps,
      [
        { estado: "pagado", desde: "2026-11-15T12:05:00Z" },
        { estado: "listo", desde: "2026-11-15T12:20:00Z" },
      ],
      createdAt,
    );
    expect(times[0]).toEqual({ desdeLlegada: 0, desdeAnterior: null });
    expect(times[1]).toEqual({ desdeLlegada: 5, desdeAnterior: 5 });
    expect(times[2]).toBeNull();
    expect(times[3]).toEqual({ desdeLlegada: 20, desdeAnterior: 15 });
  });

  it("minutesBetween no devuelve negativos ni NaN", () => {
    expect(minutesBetween("2026-11-15T12:10:00Z", "2026-11-15T12:00:00Z")).toBe(0);
    expect(minutesBetween("no-es-fecha", "2026-11-15T12:00:00Z")).toBe(0);
  });

  it("formatMinutes", () => {
    expect(formatMinutes(0)).toBe("menos de 1 min");
    expect(formatMinutes(12)).toBe("12 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(65)).toBe("1 h 5 min");
  });
});
