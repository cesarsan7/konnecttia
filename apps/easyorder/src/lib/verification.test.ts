import { describe, expect, it } from "vitest";
import { describeApiError } from "./checkout";
import {
  codeComplete,
  codeRequestBody,
  countdownLabel,
  describeCodeRequestError,
  describeConfirmError,
  normalizeCode,
  totalForCode,
} from "./verification";

describe("código de verificación", () => {
  it("deja solo dígitos, hasta 6, aunque se pegue con espacios o guiones", () => {
    expect(normalizeCode(" 123 - 456 ")).toBe("123456");
    expect(normalizeCode("12345678")).toBe("123456");
    expect(normalizeCode("abc")).toBe("");
    expect(codeComplete("12345")).toBe(false);
    expect(codeComplete("123 456")).toBe(true);
  });

  it("el cuerpo de la petición describe el pedido y lleva el captcha si lo hay", () => {
    expect(
      codeRequestBody({
        phone: "+34600111222",
        fulfillment: "retiro",
        payment: "efectivo",
        totalEuros: 12.345,
        captchaToken: null,
      }),
    ).toEqual({
      telefono: "+34600111222",
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      importe: 12.35,
    });
    expect(
      codeRequestBody({
        phone: "+34600111222",
        fulfillment: "delivery",
        payment: "efectivo",
        totalEuros: 40,
        captchaToken: "tok",
      }),
    ).toMatchObject({ captcha_token: "tok", importe: 40 });
  });

  it("usa el total del servidor y, si no lo da, la estimación del carrito", () => {
    expect(totalForCode({ error: "verification_required", importe: 31.5 }, 20)).toBe(31.5);
    expect(totalForCode({ error: "verification_required" }, 20)).toBe(20);
    expect(totalForCode(null, 20)).toBe(20);
  });

  it("explica por qué no se pudo enviar el código", () => {
    expect(
      describeCodeRequestError(422, { error: "verification_unavailable", reason: "monthly_cap" }),
    ).toMatch(/tarjeta o llama al local/);
    expect(
      describeCodeRequestError(429, { error: "rate_limited", reason: "too_many_codes" }),
    ).toMatch(/demasiados códigos/);
    expect(describeCodeRequestError(422, { error: "order_not_accepted" })).toMatch(
      /llama directamente/,
    );
    expect(describeCodeRequestError(502, { error: "code_send_failed" })).toMatch(/WhatsApp/);
    expect(describeCodeRequestError(0, null)).toMatch(/Inténtalo de nuevo/);
  });

  it("explica por qué no se acepta el código, sin mostrar códigos técnicos", () => {
    expect(
      describeConfirmError(422, { error: "code_invalid", reason: "wrong", intentos_restantes: 4 }),
    ).toBe("Código incorrecto. Te quedan 4 intentos.");
    expect(
      describeConfirmError(422, { error: "code_invalid", reason: "wrong", intentos_restantes: 1 }),
    ).toBe("Código incorrecto. Te queda 1 intento.");
    expect(describeConfirmError(422, { error: "code_invalid", reason: "locked" })).toMatch(
      /Pide un código nuevo/,
    );
    expect(describeConfirmError(422, { error: "code_invalid", reason: "expired" })).toMatch(
      /caducó/,
    );
    expect(describeConfirmError(429, null)).toMatch(/Espera/);
  });

  it("formatea la cuenta atrás del reenvío", () => {
    expect(countdownLabel(60)).toBe("1:00");
    expect(countdownLabel(45)).toBe("0:45");
    expect(countdownLabel(0.2)).toBe("0:01");
    expect(countdownLabel(-3)).toBe("0:00");
  });

  it("el pedido avisa cuando no se puede verificar el teléfono", () => {
    expect(
      describeApiError(422, { error: "verification_unavailable", reason: "monthly_cap" }),
    ).toMatch(/tarjeta o llama al local/);
  });
});
