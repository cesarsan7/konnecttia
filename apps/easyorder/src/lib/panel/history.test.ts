import { describe, expect, it } from "vitest";
import { activeFilterCount, DEFAULT_FILTERS, dayRange, historyQuery, toggleSort } from "./history";
import { sortLaneOrders } from "./orders";

const today = "2026-11-04";

describe("tabla de pedidos", () => {
  it("convierte los atajos de fecha en días del restaurante", () => {
    expect(dayRange({ dias: "hoy", desde: "", hasta: "" }, today)).toEqual({
      desde: today,
      hasta: today,
    });
    expect(dayRange({ dias: "ayer", desde: "", hasta: "" }, today)).toEqual({
      desde: "2026-11-03",
      hasta: "2026-11-03",
    });
    expect(dayRange({ dias: "7d", desde: "", hasta: "" }, today)?.desde).toBe("2026-10-29");
    expect(dayRange({ dias: "todo", desde: "", hasta: "" }, today)).toBeNull();
    // Rango al revés: se corrige; incompleto: sin límite.
    expect(dayRange({ dias: "rango", desde: "2026-11-02", hasta: "2026-11-01" }, today)).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-02",
    });
    expect(dayRange({ dias: "rango", desde: "2026-11-02", hasta: "" }, today)).toBeNull();
  });

  it("solo envía los filtros con valor", () => {
    const query = historyQuery(
      { ...DEFAULT_FILTERS, estado: "activos", local: 3002, q: "  ana " },
      today,
    );
    expect(Object.fromEntries(query)).toEqual({
      desde: today,
      hasta: today,
      estado: "activos",
      local: "3002",
      q: "ana",
      orden: "fecha",
      dir: "desc",
      pagina: "1",
    });
    expect(activeFilterCount({ ...DEFAULT_FILTERS, estado: "activos", local: 3002 })).toBe(2);
  });

  it("ordena por columna y vuelve a la primera página", () => {
    const byTotal = toggleSort({ ...DEFAULT_FILTERS, pagina: 3 }, "total");
    expect(byTotal).toMatchObject({ orden: "total", dir: "desc", pagina: 1 });
    expect(toggleSort(byTotal, "total").dir).toBe("asc");
    expect(toggleSort(DEFAULT_FILTERS, "cliente").dir).toBe("asc");
  });
});

describe("orden del tablero", () => {
  const order = (
    id: string,
    created: string,
    total: number,
    tipo: "retiro" | "delivery" | "mesa",
  ) => ({
    id,
    created_at: created,
    total,
    tipo_despacho: tipo,
  });
  const list = [
    order("b", "2026-11-04T10:05:00Z", 30, "delivery"),
    order("a", "2026-11-04T10:00:00Z", 10, "retiro"),
    order("c", "2026-11-04T10:10:00Z", 20, "mesa"),
  ];
  const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

  it("por defecto, lo que más espera primero (y en terminados, lo último cerrado)", () => {
    expect(ids(sortLaneOrders(list, "antiguos", false))).toEqual(["a", "b", "c"]);
    expect(ids(sortLaneOrders(list, "antiguos", true))).toEqual(["c", "b", "a"]);
  });

  it("recientes, importe y tipo", () => {
    expect(ids(sortLaneOrders(list, "recientes", false))).toEqual(["c", "b", "a"]);
    expect(ids(sortLaneOrders(list, "importe", false))).toEqual(["b", "c", "a"]);
    expect(ids(sortLaneOrders(list, "tipo", false))).toEqual(["c", "a", "b"]);
  });
});
