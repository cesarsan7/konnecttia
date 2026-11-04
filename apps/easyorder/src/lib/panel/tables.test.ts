import { describe, expect, it } from "vitest";
import {
  type DiningTable,
  groupByZone,
  matchesFilter,
  nextTableNumber,
  occupiedFor,
  selectableTables,
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
  ocupada_desde: null,
  pedidos: [],
  pedido: null,
  en_marcha: 0,
  cuenta: 0,
  por_cobrar: 0,
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

describe("filtros y selección de mesas", () => {
  it("filtra libres y ocupadas", () => {
    expect(matchesFilter({ ocupada: true }, "libres")).toBe(false);
    expect(matchesFilter({ ocupada: true }, "ocupadas")).toBe(true);
    expect(matchesFilter({ ocupada: false }, "todas")).toBe(true);
  });

  it("ofrece las mesas activas del local, primero las libres", () => {
    const busy = { ...table(1, 10), ocupada: true };
    const off = { ...table(4, null), activa: false };
    const list = selectableTables(
      { ...plan, mesas: [busy, table(2, null), off, table(3, 11, 2)] },
      1,
    );
    expect(list.map((t) => t.id)).toEqual([2, 1]);
    expect(selectableTables(null, 1)).toEqual([]);
  });
});
