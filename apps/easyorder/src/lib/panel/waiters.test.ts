import { describe, expect, it } from "vitest";
import { waiterBody, waitersFor } from "./waiters";

const waiter = (id: number, sucursal: number | null, activo = true) => ({
  id,
  nombre: `M${id}`,
  activo,
  sucursal_id: sucursal,
  membership_id: null,
  email: null,
  pedidos_hoy: 0,
  importe_hoy: 0,
});

describe("meseros", () => {
  it("ofrece los activos del local y los de todos los locales", () => {
    const list = {
      meseros: [waiter(1, 10), waiter(2, null), waiter(3, 11), waiter(4, 10, false)],
      yo: null,
    };
    expect(waitersFor(list, 10).map((w) => w.id)).toEqual([1, 2]);
    expect(waitersFor(null, 10)).toEqual([]);
  });

  it("envía el mesero solo si se elige", () => {
    expect(waiterBody("auto")).toEqual({});
    expect(waiterBody("ninguno")).toEqual({ mesero_id: null });
    expect(waiterBody(7)).toEqual({ mesero_id: 7 });
  });
});
