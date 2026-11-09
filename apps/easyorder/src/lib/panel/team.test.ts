import { describe, expect, it } from "vitest";
import {
  branchesLabel,
  customizeWarning,
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

describe("customizeWarning", () => {
  it("avisa de a quién se le cambia el rol", () => {
    expect(customizeWarning({ nombre: "Mesero", miembros: 0, invitaciones: 0 })).toBe(
      "Se creará una copia propia de «Mesero» que podrás editar.",
    );
    expect(customizeWarning({ nombre: "Mesero", miembros: 2, invitaciones: 1 })).toContain(
      "2 personas y 1 invitación pendiente",
    );
    expect(customizeWarning({ nombre: "Mesero", miembros: 1, invitaciones: 0 })).toContain(
      "1 persona",
    );
  });
});
