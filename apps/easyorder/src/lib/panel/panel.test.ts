import { describe, expect, it } from "vitest";
import { canCancel, laneOf, newArrivals, orderLines, orderNotes, primaryAction } from "./orders";
import { change, niceTicks, peakHour, presetRange, todayIn } from "./stats";
import type { PanelOrder } from "./types";

const all = { changeStatus: true, confirmPayment: true };

const order = (overrides: Partial<PanelOrder>): PanelOrder => ({
  id: 1,
  pedido_codigo: "261103-1001",
  estado: "recibido",
  estado_pago: "no_aplica",
  tipo_despacho: "retiro",
  canal: "web",
  nombre_pedido: "Ana",
  telefono: "+34600000001",
  direccion: null,
  items: [],
  subtotal: "10.00",
  costo_envio: "0.00",
  total: "10.00",
  metodo_pago: "efectivo",
  tiempo_estimado: null,
  notas: null,
  created_at: "2026-11-03T12:00:00.000Z",
  updated_at: null,
  sucursal_id: 1,
  local_nombre: "Principal",
  ...overrides,
});

describe("tablero de pedidos", () => {
  it("coloca cada estado en su columna", () => {
    expect(laneOf(order({ estado: "pendiente_pago" }))).toBe("nuevos");
    expect(laneOf(order({ estado: "en_preparacion" }))).toBe("cocina");
    expect(laneOf(order({ estado: "en_camino" }))).toBe("listos");
    expect(laneOf(order({ estado: "cancelado" }))).toBe("cerrados");
  });

  it("propone el siguiente paso según recogida o reparto", () => {
    expect(primaryAction(order({ estado: "recibido" }), all)).toMatchObject({ to: "confirmado" });
    expect(primaryAction(order({ estado: "listo" }), all)).toMatchObject({ to: "entregado" });
    expect(primaryAction(order({ estado: "listo", tipo_despacho: "delivery" }), all)).toMatchObject(
      {
        to: "en_camino",
      },
    );
    expect(primaryAction(order({ estado: "entregado" }), all)).toBeNull();
  });

  it("no deja entregar sin cobrar: la acción pasa a ser confirmar el cobro", () => {
    const pending = order({ estado: "listo", estado_pago: "pendiente" });
    expect(primaryAction(pending, all)).toEqual({ kind: "payment", label: "Confirmar cobro" });
    expect(
      primaryAction(order({ estado: "pendiente_pago", estado_pago: "pendiente" }), all),
    ).toMatchObject({ kind: "payment" });
  });

  it("sin permisos no hay botones", () => {
    expect(
      primaryAction(order({ estado: "recibido" }), { changeStatus: false, confirmPayment: false }),
    ).toBeNull();
  });

  it("solo se cancela lo que la máquina de estados permite", () => {
    expect(canCancel(order({ estado: "en_preparacion" }))).toBe(true);
    expect(canCancel(order({ estado: "entregado" }))).toBe(false);
  });

  it("lee las líneas de la web y las de WhatsApp", () => {
    expect(
      orderLines([
        {
          item_name: "Salchimaduro",
          variant_name: "Grande",
          quantity: 2,
          extras: [{ name: "Queso", quantity: 4 }],
          nota: "sin cebolla",
        },
        { nombre: "Pizza", cantidad: 1 },
      ]),
    ).toEqual([
      {
        quantity: 2,
        name: "Salchimaduro",
        variant: "Grande",
        extras: ["2× Queso"],
        note: "sin cebolla",
      },
      { quantity: 1, name: "Pizza", variant: null, extras: [], note: null },
    ]);
    expect(orderLines("no es una lista")).toEqual([]);
  });

  it("muestra las notas del cliente pero no los suplementos", () => {
    expect(
      orderNotes([
        { item: "general", nota: "Llamar al llegar" },
        { item: "suplemento", nota: "Envases: 1,00 €" },
      ]),
    ).toEqual(["Llamar al llegar"]);
  });

  it("solo avisa de pedidos nuevos a partir de la segunda carga", () => {
    const list = [order({ id: 1 }), order({ id: 2 }), order({ id: 3, estado: "listo" })];
    expect(newArrivals(null, list)).toEqual([]);
    expect(newArrivals(new Set([1]), list).map((item) => item.id)).toEqual([2]);
  });
});

describe("estadísticas", () => {
  it("usa la fecha del restaurante, no la del navegador", () => {
    // 23:30 UTC del 31 de octubre: en Canarias sigue siendo 31; en Madrid ya es 1 de noviembre.
    const instant = new Date("2026-10-31T23:30:00Z");
    expect(todayIn("Atlantic/Canary", instant)).toBe("2026-10-31");
    expect(todayIn("Europe/Madrid", instant)).toBe("2026-11-01");
  });

  it("calcula los rangos predefinidos", () => {
    const instant = new Date("2026-11-03T12:00:00Z");
    expect(presetRange("hoy", "Atlantic/Canary", instant)).toEqual({
      desde: "2026-11-03",
      hasta: "2026-11-03",
    });
    expect(presetRange("7d", "Atlantic/Canary", instant).desde).toBe("2026-10-28");
    expect(presetRange("mes", "Atlantic/Canary", instant).desde).toBe("2026-11-01");
  });

  it("calcula la variación y la hora punta", () => {
    expect(change(150, 100)).toBe(50);
    expect(change(10, 0)).toBeNull();
    expect(
      peakHour([
        { hora: 13, pedidos: 2 },
        { hora: 21, pedidos: 5 },
      ]),
    ).toBe(21);
    expect(peakHour([{ hora: 13, pedidos: 0 }])).toBeNull();
  });

  it("genera marcas redondas para el eje", () => {
    expect(niceTicks(87)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0)).toEqual([0]);
  });
});
