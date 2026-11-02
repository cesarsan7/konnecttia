import { describe, expect, it } from "vitest";
import { demoRequestSchema } from "./demo-request";

const valid = {
  nombre: "Ana",
  negocio: "Pizzería de prueba",
  municipio: "Arrecife",
  contacto: "+34 600 000 000",
  producto: "EasyOrder",
  mensaje: "",
  privacidad: true,
  website: "",
};

describe("demoRequestSchema", () => {
  it("acepta una solicitud válida con teléfono o correo", () => {
    expect(demoRequestSchema.safeParse(valid).success).toBe(true);
    expect(demoRequestSchema.safeParse({ ...valid, contacto: "ana@example.com" }).success).toBe(
      true,
    );
  });

  it("exige aceptar la privacidad", () => {
    expect(demoRequestSchema.safeParse({ ...valid, privacidad: false }).success).toBe(false);
  });

  it("rechaza contactos no válidos y productos desconocidos", () => {
    expect(demoRequestSchema.safeParse({ ...valid, contacto: "hola" }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ ...valid, producto: "Otro" }).success).toBe(false);
  });
});
