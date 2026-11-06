import { describe, expect, it } from "vitest";
import { parsePositiveId } from "../src/routes/panel-orders-list";

describe("parsePositiveId (filtros mesero y repartidor)", () => {
  it("sin valor no hay filtro", () => {
    expect(parsePositiveId(undefined)).toBeUndefined();
    expect(parsePositiveId("")).toBeUndefined();
    expect(parsePositiveId("  ")).toBeUndefined();
  });

  it("acepta enteros positivos", () => {
    expect(parsePositiveId("1")).toBe(1);
    expect(parsePositiveId(" 42 ")).toBe(42);
    expect(parsePositiveId("3002")).toBe(3002);
  });

  it("rechaza lo que no es un entero positivo", () => {
    for (const raw of ["0", "-1", "1.5", "abc", "1e3", "1,2", "0x10", "99999999999999999999"]) {
      expect(parsePositiveId(raw), raw).toBeNull();
    }
  });
});
