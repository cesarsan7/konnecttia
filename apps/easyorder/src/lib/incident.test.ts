import { describe, expect, it } from "vitest";
import { incidentFormError, incidentSendError } from "./incident";

describe("incidencia del cliente", () => {
  it("exige tipo y un texto con sentido", () => {
    expect(incidentFormError({ tipo: "", descripcion: "Falta la bebida" })).toContain("Elige");
    expect(incidentFormError({ tipo: "otro", descripcion: " a " })).toContain("Cuéntanos");
    expect(incidentFormError({ tipo: "otro", descripcion: "x".repeat(1001) })).toContain("largo");
    expect(incidentFormError({ tipo: "falta_algo", descripcion: "Falta la bebida" })).toBeNull();
  });

  it("explica por qué falla el envío", () => {
    expect(incidentSendError(429, "too_many_open")).toContain("abiertas");
    expect(incidentSendError(429)).toContain("Espera");
    expect(incidentSendError(409)).toContain("Contacta");
    expect(incidentSendError(500)).toContain("Inténtalo");
  });
});
