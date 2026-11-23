import { describe, expect, it } from "vitest";
import { bankDetailsToSend } from "./settings";

describe("datos de pago al guardar «Pedidos y pago»", () => {
  const details = { iban: "ES00 MAL", titular: "Ana" };

  it("sin transferencia ni Bizum no los envía (se conservan los guardados)", () => {
    expect(bankDetailsToSend(["efectivo", "tarjeta"], details)).toBeUndefined();
  });

  it("con transferencia o Bizum los envía", () => {
    expect(bankDetailsToSend(["transferencia"], details)).toEqual(details);
    expect(bankDetailsToSend(["bizum"], { bizum: "600000000" })).toEqual({ bizum: "600000000" });
  });

  it("con transferencia y todo vacío envía null para que el API pida los datos", () => {
    expect(bankDetailsToSend(["transferencia"], {})).toBeNull();
  });
});
