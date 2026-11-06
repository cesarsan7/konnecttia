import { describe, expect, it } from "vitest";
import {
  branchesLabel,
  inviteLink,
  inviteMessage,
  parseMemberName,
  personLabel,
  roleSummary,
  teamErrorMessage,
} from "./team";

describe("equipo", () => {
  it("arma el enlace y el mensaje de invitación", () => {
    const link = inviteLink("https://panel.test/", "abc");
    expect(link).toBe("https://panel.test/panel/unirse/abc");
    expect(inviteMessage("Siempre Juntos", "Personal", link)).toContain("como personal");
  });

  it("describe roles conocidos y propios", () => {
    expect(roleSummary({ code: "staff", permisos: [] })).toMatch(/Tablero de pedidos/);
    expect(roleSummary({ code: "cajero", permisos: ["a", "b"] })).toBe(
      "2 permisos (rol propio del restaurante).",
    );
  });

  it("nombra los locales y traduce los errores", () => {
    const names = new Map([
      [1, "Centro"],
      [2, "Playa"],
    ]);
    expect(branchesLabel("todos", names)).toBe("Todos los locales");
    expect(branchesLabel([2], names)).toBe("Playa");
    expect(teamErrorMessage("last_owner")).toMatch(/propietario/);
    expect(teamErrorMessage(undefined)).toMatch(/No se pudo/);
  });

  it("llama a cada persona por su apodo o nombre y, si no, por el email", () => {
    expect(personLabel({ name: "Nuria", email: "n@test.local" }, "?")).toBe("Nuria");
    expect(personLabel({ name: null, email: "n@test.local" }, "?")).toBe("n@test.local");
    expect(personLabel({ name: " ", email: null }, "Miembro 3")).toBe("Miembro 3");
    expect(personLabel({}, "Miembro 3")).toBe("Miembro 3");
  });

  it("valida nombre (obligatorio) y apodo (opcional)", () => {
    expect(parseMemberName("  Nuria  ", "  ")).toEqual({ value: { nombre: "Nuria", apodo: null } });
    expect(parseMemberName("Nuria", " Nu ")).toEqual({ value: { nombre: "Nuria", apodo: "Nu" } });
    expect(parseMemberName("   ", "Nu")).toEqual({ error: "Escribe tu nombre." });
    expect(parseMemberName("x".repeat(81), "")).toHaveProperty("error");
    expect(parseMemberName("Nuria", "y".repeat(81))).toHaveProperty("error");
    expect(teamErrorMessage("name_required")).toMatch(/nombre/);
  });
});
