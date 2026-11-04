import { describe, expect, it } from "vitest";
import {
  type DiningTable,
  groupByZone,
  nextTableNumber,
  occupiedFor,
  type TablePlan,
} from "./tables";

const table = (id: number, zona: number | null, sucursal = 1): DiningTable => ({
  id,
  numero: id,
  nombre: `Mesa ${id}`,
  capacidad: 4,
  activa: true,
  zona_id: zona,
  sucursal_id: sucursal,
  ocupada_manual: false,
  ocupada: false,
  pedido: null,
});

const plan: TablePlan = {
  locales: [{ id: 1, nombre: "Centro" }],
  zonas: [
    { id: 10, nombre: "Sala", orden: 1, activa: true, sucursal_id: 1 },
    { id: 11, nombre: "Terraza", orden: 2, activa: true, sucursal_id: 2 },
  ],
  mesas: [table(1, 10), table(2, null), table(3, 11, 2)],
};

describe("mesas", () => {
  it("agrupa por zona del local y deja las sueltas al final", () => {
    const groups = groupByZone(plan, 1);
    expect(
      groups.map((group) => [group.zone?.nombre ?? null, group.tables.map((t) => t.id)]),
    ).toEqual([
      ["Sala", [1]],
      [null, [2]],
    ]);
  });

  it("calcula el tiempo ocupada y el siguiente número", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(occupiedFor("2026-11-04T11:48:00Z", now)).toBe("12 min");
    expect(occupiedFor("2026-11-04T10:55:00Z", now)).toBe("1 h 5 min");
    expect(nextTableNumber(plan)).toBe(4);
  });
});
