import { FULFILLMENT } from "@konnecttia/domain";
import { describe, expect, it } from "vitest";
import { type DespachoView, nextStep } from "../src/repositories/agent-cart";

const delivery = (over: Partial<DespachoView> = {}): DespachoView => ({
  tipo: FULFILLMENT.Delivery,
  disponible: true,
  motivo: null,
  local: null,
  direccion: "Calle Mayor 1",
  zona: "Centro",
  minimo: 25,
  alcanza_minimo: true,
  falta_para_minimo: 0,
  tiempo_estimado: null,
  ...over,
});

describe("siguiente paso del carrito del agente", () => {
  it("sigue el orden del pedido", () => {
    expect(nextStep(0, 0, null).siguiente_paso).toBe("anadir_productos");
    expect(nextStep(2, 1, null).siguiente_paso).toBe("resolver_problemas");
    expect(nextStep(2, 0, null).siguiente_paso).toBe("elegir_despacho");
    expect(nextStep(2, 0, delivery({ direccion: null })).siguiente_paso).toBe("pedir_direccion");
    expect(nextStep(2, 0, delivery({ disponible: false })).siguiente_paso).toBe(
      "despacho_no_disponible",
    );
    expect(nextStep(2, 0, delivery({ alcanza_minimo: false })).siguiente_paso).toBe(
      "completar_minimo",
    );
    expect(nextStep(2, 0, delivery()).siguiente_paso).toBe("resumen_pago_y_confirmar");
  });

  it("la recogida nunca pide dirección", () => {
    const pickup = delivery({ tipo: FULFILLMENT.Pickup, direccion: null });
    expect(nextStep(1, 0, pickup).siguiente_paso).toBe("resumen_pago_y_confirmar");
  });

  it("cada paso trae su instrucción", () => {
    expect(nextStep(2, 0, delivery({ direccion: null })).instruccion).toContain("tipo direccion");
  });
});
