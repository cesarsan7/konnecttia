import { describe, expect, it } from "vitest";
import { demoRequestSchema } from "./demo-request";

const valid = {
  nombre: "Ana",
  restaurante: "Pizzería de prueba",
  ubicacion: "",
  contacto: "+34 600 000 000",
  mensaje: "",
  consentimiento: true,
  website: "",
};

describe("demoRequestSchema", () => {
  it("acepta una solicitud válida con teléfono o correo y sin ubicación", () => {
    expect(demoRequestSchema.safeParse(valid).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...valid, contacto: "ana@example.com" }).success).toBe(
      true,
    );
  });

  it("exige el consentimiento", () => {
    expect(demoRequestSchema.safeParse({ ...valid, consentimiento: false }).success).toBe(false);
  });

  it("rechaza contactos no válidos y nombres vacíos", () => {
    expect(demoRequestSchema.safeParse({ ...valid, contacto: "hola" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, restaurante: "" }).success).toBe(false);
  });
});
