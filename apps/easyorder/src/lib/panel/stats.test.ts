import { describe, expect, it } from "vitest";
import { formatMinutes } from "./stats";

describe("formatMinutes (tiempo medio de reparto)", () => {
  it("muestra minutos, y horas desde los 60", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(29.6)).toBe("30 min");
    expect(formatMinutes(59)).toBe("59 min");
    expect(formatMinutes(60)).toBe("1 h 00 min");
    expect(formatMinutes(125)).toBe("2 h 05 min");
  });

  it("sin dato o dato no válido, un guion", () => {
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(-1)).toBe("—");
    expect(formatMinutes(Number.NaN)).toBe("—");
  });
});
