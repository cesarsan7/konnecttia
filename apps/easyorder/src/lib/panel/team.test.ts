import { describe, expect, it } from "vitest";
import { branchesLabel, inviteLink, inviteMessage, roleSummary, teamErrorMessage } from "./team";

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
});
