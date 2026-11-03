import { describe, expect, it } from "vitest";
import { branchFromHint } from "../src/repositories/fulfillment";

const branches = [
  { name: "Siempre Juntos 2", address: "C. Carlos V, 9, Arrecife" },
  { name: "Siempre Juntos 1", address: "C. Huelva, 2, Arrecife" },
];

describe("local que menciona el cliente", () => {
  it("reconoce el nombre completo o la calle", () => {
    expect(branchFromHint(branches, "Recojo en Siempre Juntos 1")?.name).toBe("Siempre Juntos 1");
    expect(branchFromHint(branches, "el de la calle Carlos V porfa")?.name).toBe(
      "Siempre Juntos 2",
    );
    expect(branchFromHint(branches, "el de huelva")?.name).toBe("Siempre Juntos 1");
  });

  it("si no es claro, no adivina", () => {
    expect(branchFromHint(branches, "siempre juntos")).toBeUndefined();
    expect(branchFromHint(branches, "retiro")).toBeUndefined();
  });
});
