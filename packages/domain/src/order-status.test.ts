import { describe, expect, it } from "vitest";
import { FULFILLMENT } from "./delivery";
import { checkTransition, ORDER_STATUS, PAYMENT_STATUS, TRANSITION_ERROR } from "./order-status";

const base = { fulfillment: FULFILLMENT.Pickup, paymentStatus: PAYMENT_STATUS.NotApplicable };

describe("checkTransition", () => {
  it("permite el flujo normal de un pedido para recoger", () => {
    const path = [
      ORDER_STATUS.Received,
      ORDER_STATUS.Confirmed,
      ORDER_STATUS.Preparing,
      ORDER_STATUS.Ready,
      ORDER_STATUS.Delivered,
    ];
    for (let i = 1; i < path.length; i++) {
      expect(checkTransition({ ...base, from: path[i - 1] ?? "", to: path[i] ?? "" })).toEqual({
        ok: true,
      });
    }
  });

  it("no permite saltarse pasos ni salir de un estado final", () => {
    expect(
      checkTransition({ ...base, from: ORDER_STATUS.Received, to: ORDER_STATUS.Ready }),
    ).toEqual({ ok: false, error: TRANSITION_ERROR.NotAllowed });
    expect(
      checkTransition({ ...base, from: ORDER_STATUS.Delivered, to: ORDER_STATUS.Cancelled }),
    ).toEqual({ ok: false, error: TRANSITION_ERROR.NotAllowed });
  });

  it("«en camino» solo existe para reparto y la recogida pasa directamente a entregado", () => {
    expect(
      checkTransition({ ...base, from: ORDER_STATUS.Ready, to: ORDER_STATUS.OnTheWay }),
    ).toEqual({ ok: false, error: TRANSITION_ERROR.OnTheWayRequiresDelivery });
    expect(
      checkTransition({
        ...base,
        fulfillment: FULFILLMENT.Delivery,
        from: ORDER_STATUS.Ready,
        to: ORDER_STATUS.Delivered,
      }),
    ).toEqual({ ok: false, error: TRANSITION_ERROR.PickupGoesStraightToDelivered });
  });

  it("no se entrega un pedido con el pago pendiente (transferencia sin confirmar)", () => {
    expect(
      checkTransition({
        fulfillment: FULFILLMENT.Delivery,
        paymentStatus: PAYMENT_STATUS.Pending,
        from: ORDER_STATUS.OnTheWay,
        to: ORDER_STATUS.Delivered,
      }),
    ).toEqual({ ok: false, error: TRANSITION_ERROR.PaymentPending });
  });

  it("rechaza estados desconocidos", () => {
    expect(checkTransition({ ...base, from: "inventado", to: ORDER_STATUS.Confirmed })).toEqual({
      ok: false,
      error: TRANSITION_ERROR.UnknownStatus,
    });
  });
});

describe("pedidos en mesa", () => {
  it("van de listo a entregado (servido) y nunca «en camino»", () => {
    const base = { fulfillment: "mesa" as const, paymentStatus: "no_aplica" };
    expect(checkTransition({ ...base, from: "listo", to: "entregado" })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: "listo", to: "en_camino" }).ok).toBe(false);
  });
});
