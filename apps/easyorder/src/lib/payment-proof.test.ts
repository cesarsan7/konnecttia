import { describe, expect, it } from "vitest";
import {
  describeProofError,
  needsPaymentInfo,
  PROOF_MAX_BYTES,
  paymentConcept,
  paymentDetailRows,
  paymentTitle,
  proofProblem,
  proofProblemMessage,
  proofStatusText,
} from "./payment-proof";

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe("justificante: comprobación previa del archivo", () => {
  it("acepta JPG, PNG, WebP y PDF dentro del tamaño", () => {
    expect(proofProblem(file("a.jpg", 1000, "image/jpeg"))).toBeNull();
    expect(proofProblem(file("a.png", 1000, "image/png"))).toBeNull();
    expect(proofProblem(file("a.webp", 1000, "image/webp"))).toBeNull();
    expect(proofProblem(file("a.pdf", PROOF_MAX_BYTES, "application/pdf"))).toBeNull();
  });

  it("acepta por extensión cuando el navegador no informa del tipo", () => {
    expect(proofProblem(file("captura.PNG", 1000, ""))).toBeNull();
  });

  it("rechaza vacío, demasiado grande y otros tipos", () => {
    expect(proofProblem(file("a.png", 0, "image/png"))).toBe("empty");
    expect(proofProblem(file("a.png", PROOF_MAX_BYTES + 1, "image/png"))).toBe("too_large");
    expect(proofProblem(file("a.svg", 1000, "image/svg+xml"))).toBe("unsupported_type");
    expect(proofProblem(file("a.exe", 1000, ""))).toBe("unsupported_type");
    expect(proofProblemMessage("too_large")).toContain("5 MB");
  });
});

describe("justificante: mensajes de error de la API", () => {
  it.each([
    [503, "storage_not_configured", "aún no tiene activada"],
    [413, "invalid_proof", "5 MB"],
    [415, "invalid_proof", "imagen"],
    [409, "proof_limit_reached", "máximo"],
    [409, "payment_not_pending", "ya no está pendiente"],
    [429, "rate_limited", "Espera"],
  ])("%i %s", (status, error, text) => {
    const reason = status === 413 ? "too_large" : undefined;
    expect(describeProofError(status, { error, ...(reason ? { reason } : {}) })).toContain(text);
  });

  it("sin cuerpo o sin red da un mensaje genérico y nunca el código técnico", () => {
    expect(describeProofError(0, null)).toContain("Sin conexión");
    const generic = describeProofError(500, { error: "service_unavailable" });
    expect(generic).not.toContain("service_unavailable");
  });
});

describe("datos para pagar", () => {
  it("solo con Bizum o transferencia, cobro pendiente y pedido vivo", () => {
    const base = { estado: "pendiente_pago", estadoPago: "pendiente", metodoPago: "bizum" };
    expect(needsPaymentInfo(base)).toBe(true);
    expect(needsPaymentInfo({ ...base, metodoPago: "transferencia" })).toBe(true);
    expect(needsPaymentInfo({ ...base, metodoPago: "efectivo" })).toBe(false);
    expect(needsPaymentInfo({ ...base, metodoPago: null })).toBe(false);
    expect(needsPaymentInfo({ ...base, estadoPago: "pagado" })).toBe(false);
    expect(needsPaymentInfo({ ...base, estado: "cancelado" })).toBe(false);
  });

  it("ordena y etiqueta las filas e ignora lo desconocido o vacío", () => {
    const rows = paymentDetailRows({
      iban: "ES91 2100",
      titular: "Cafetería A SL",
      concepto: "no debe salir",
      banco: " ",
    });
    expect(rows.map((row) => [row.label, row.value])).toEqual([
      ["Titular", "Cafetería A SL"],
      ["IBAN", "ES91 2100"],
    ]);
    expect(paymentDetailRows({ bizum: "600111222" })[0]?.label).toBe("Teléfono de Bizum");
    expect(paymentDetailRows(null)).toEqual([]);
  });

  it("el concepto es el código del pedido", () => {
    expect(paymentConcept("261103-1001")).toBe("261103-1001");
    expect(paymentConcept("  ")).toBeNull();
    expect(paymentConcept(null)).toBeNull();
  });

  it("título según el método y estado de los justificantes enviados", () => {
    expect(paymentTitle("bizum")).toBe("Paga por Bizum");
    expect(paymentTitle("transferencia")).toBe("Datos para la transferencia");
    expect(proofStatusText(0)).toBeNull();
    expect(proofStatusText(1)).toContain("Justificante enviado");
    expect(proofStatusText(2)).toContain("2 justificantes");
  });
});
