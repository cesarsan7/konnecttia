import { describe, expect, it } from "vitest";
import {
  type DiningTable,
  groupByZone,
  matchesFilter,
  nextTableNumber,
  occupiedFor,
  selectableTables,
  shortDuration,
  type TablePlan,
  tableTimes,
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
  mesero_id: null,
  mesero_nombre: null,
  ocupada_desde: null,
  pedidos: [],
  pedido: null,
  en_marcha: 0,
  cuenta: 0,
  por_cobrar: 0,
});

const plan: TablePlan = {
  avisos: { espera_minutos: null, estancia_minutos: null },
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

describe("tiempos de la mesa", () => {
  const now = new Date("2026-11-04T21:00:00Z");
  const tableOrder = (estado: string, desde: string, estadoDesde: string) => ({
    id: 1,
    codigo: "M-1",
    estado,
    estado_pago: "no_aplica",
    metodo_pago: "efectivo",
    tipo_despacho: "mesa" as const,
    total: 10,
    items: [],
    desde,
    estado_desde: estadoDesde,
    historial: [],
    mesero_nombre: null,
  });
  const busy = {
    ocupada: true,
    ocupada_desde: "2026-11-04T19:20:00Z",
    pedidos: [
      tableOrder("entregado", "2026-11-04T19:25:00Z", "2026-11-04T19:50:00Z"),
      tableOrder("en_preparacion", "2026-11-04T20:35:00Z", "2026-11-04T20:48:00Z"),
    ],
  };

  it("mide la espera del pedido en marcha más antiguo y la estancia", () => {
    const times = tableTimes(busy, { espera_minutos: null, estancia_minutos: null }, now);
    expect(times).toMatchObject({
      waiting: 25,
      inState: 12,
      stay: 100,
      waitAlert: false,
      stayAlert: false,
    });
    expect(times.oldest?.estado).toBe("en_preparacion");
  });

  it("avisa al pasar los umbrales configurados", () => {
    expect(tableTimes(busy, { espera_minutos: 20, estancia_minutos: 120 }, now)).toMatchObject({
      waitAlert: true,
      stayAlert: false,
    });
    expect(tableTimes(busy, { espera_minutos: 30, estancia_minutos: 90 }, now)).toMatchObject({
      waitAlert: false,
      stayAlert: true,
    });
    const free = tableTimes(
      { ocupada: false, ocupada_desde: null, pedidos: [] },
      { espera_minutos: 1, estancia_minutos: 1 },
      now,
    );
    expect(free).toMatchObject({ waiting: null, stay: null, waitAlert: false, stayAlert: false });
  });

  it("formatea duraciones cortas", () => {
    expect(shortDuration(12)).toBe("12 min");
    expect(shortDuration(60)).toBe("1 h");
    expect(shortDuration(65)).toBe("1 h 5 min");
  });
});
