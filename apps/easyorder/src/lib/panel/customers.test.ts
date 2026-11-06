import { describe, expect, it } from "vitest";
import {
  deleteCustomerError,
  formatPhone,
  pageCount,
  promotionsLabel,
  sinceLabel,
} from "./customers";

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

describe("tratamiento de datos del cliente", () => {
  const format = (date: Date) => date.toISOString().slice(0, 10);

  it("resume el consentimiento de promociones", () => {
    expect(promotionsLabel(null, null, format)).toBe("Sin preguntar");
    expect(promotionsLabel(true, "2026-11-03T10:00:00Z", format)).toBe("Acepta (desde 2026-11-03)");
    expect(promotionsLabel(false, "2026-11-03T10:00:00Z", format)).toBe(
      "No acepta (desde 2026-11-03)",
    );
    expect(promotionsLabel(true, null, format)).toBe("Acepta");
  });

  it("explica por qué no se pudieron borrar los datos", () => {
    expect(deleteCustomerError(409, "open_orders")).toMatch(/pedidos sin cerrar/);
    expect(deleteCustomerError(403, "customer_out_of_scope")).toMatch(/locales a los que no/);
    expect(deleteCustomerError(403, undefined)).toMatch(/permiso/);
    expect(deleteCustomerError(500, undefined)).toMatch(/Inténtalo de nuevo/);
  });
});
