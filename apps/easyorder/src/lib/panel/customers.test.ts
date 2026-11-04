import { describe, expect, it } from "vitest";
import { formatPhone, pageCount, sinceLabel } from "./customers";

describe("clientes", () => {
  it("formatea teléfonos españoles", () => {
    expect(formatPhone("+34612345678")).toBe("612 345 678");
    expect(formatPhone("+573001234567")).toBe("+573001234567");
  });

  it("dice hace cuánto fue el último pedido", () => {
    const now = new Date("2026-11-04T12:00:00Z");
    expect(sinceLabel(null, now)).toBe("Sin pedidos");
    expect(sinceLabel("2026-11-04T08:00:00Z", now)).toBe("Hoy");
    expect(sinceLabel("2026-11-03T08:00:00Z", now)).toBe("Ayer");
    expect(sinceLabel("2026-10-20T08:00:00Z", now)).toBe("Hace 15 días");
    expect(sinceLabel("2026-08-01T08:00:00Z", now)).toBe("Hace 3 meses");
  });

  it("calcula páginas", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(101, 50)).toBe(3);
  });
});
