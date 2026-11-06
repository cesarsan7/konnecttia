import { describe, expect, it } from "vitest";
import { describeProofViewError, pendingProofs, proofIndicator, proofLinkLabel } from "./proofs";

describe("justificantes en el panel", () => {
  it("solo cuentan mientras el cobro está pendiente", () => {
    expect(pendingProofs({ estado_pago: "pendiente", justificantes: 2 })).toBe(2);
    expect(pendingProofs({ estado_pago: "pagado", justificantes: 2 })).toBe(0);
    expect(pendingProofs({ estado_pago: "pendiente" })).toBe(0);
  });

  it("indicador en singular y plural", () => {
    expect(proofIndicator(0)).toBeNull();
    expect(proofIndicator(1)).toBe("Justificante recibido");
    expect(proofIndicator(3)).toBe("3 justificantes recibidos");
  });

  it("etiqueta cada enlace por tipo", () => {
    expect(proofLinkLabel(0, { tipo_mime: "image/png" })).toBe("Justificante 1 (imagen)");
    expect(proofLinkLabel(1, { tipo_mime: "application/pdf" })).toBe("Justificante 2 (PDF)");
    expect(proofLinkLabel(2, { tipo_mime: "x/y" })).toBe("Justificante 3 (archivo)");
  });

  it("mensajes de error comprensibles", () => {
    expect(describeProofViewError(503, { error: "storage_not_configured" })).toContain(
      "no está configurado",
    );
    expect(describeProofViewError(403, null)).toContain("permiso");
    expect(describeProofViewError(404, null)).toContain("ya no está disponible");
    expect(describeProofViewError(0, null)).toContain("Sin conexión");
  });
});
