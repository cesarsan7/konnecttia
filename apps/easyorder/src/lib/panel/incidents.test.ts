import { describe, expect, it } from "vitest";
import { incidentError, incidentHandler, incidentLabel } from "./incidents";

describe("incidencias del panel", () => {
  it("etiqueta los tipos y deja pasar uno desconocido", () => {
    expect(incidentLabel("falta_algo")).toBe("Falta algo");
    expect(incidentLabel("raro")).toBe("raro");
  });

  it("dice quién repartió o atendió, con el repartidor primero", () => {
    expect(incidentHandler({ repartidor_nombre: " Luis ", mesero_nombre: "Ana" })).toBe(
      "Repartió: Luis",
    );
    expect(incidentHandler({ repartidor_nombre: null, mesero_nombre: "Ana" })).toBe("Atendió: Ana");
    expect(incidentHandler({ repartidor_nombre: null, mesero_nombre: null })).toBeNull();
  });

  it("traduce los errores del servidor", () => {
    expect(incidentError(403)).toContain("no puede");
    expect(incidentError(404)).toContain("ya no está");
    expect(incidentError(500)).toContain("Inténtalo");
  });
});
