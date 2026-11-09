import { describe, expect, it } from "vitest";
import { canReportIncident, INCIDENT_TYPES } from "./incident";
import { ORDER_STATUS } from "./order-status";

describe("incidencias", () => {
  it("los tipos son los cuatro del seguimiento", () => {
    expect(INCIDENT_TYPES).toEqual(["falta_algo", "llego_mal", "retraso", "otro"]);
  });

  it("se abre desde recibido hasta después de entregado, no en cancelados ni carritos", () => {
    for (const estado of [
      ORDER_STATUS.Received,
      ORDER_STATUS.Confirmed,
      ORDER_STATUS.Preparing,
      ORDER_STATUS.OnTheWay,
      ORDER_STATUS.Delivered,
    ]) {
      expect(canReportIncident(estado)).toBe(true);
    }
    for (const estado of [ORDER_STATUS.InCart, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired]) {
      expect(canReportIncident(estado)).toBe(false);
    }
  });
});
