import { describe, expect, it, vi } from "vitest";
import { copyText, isClosed } from "./tracking";

describe("seguimiento", () => {
  it.each(["entregado", "cancelado", "expirado"])("%s está cerrado", (estado) => {
    expect(isClosed(estado)).toBe(true);
  });

  it.each(["recibido", "pendiente_pago", "confirmado", "en_preparacion", "en_camino", "listo"])(
    "%s sigue abierto",
    (estado) => {
      expect(isClosed(estado)).toBe(false);
    },
  );

  it("copia el enlace y avisa de si pudo", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyText("https://x.test/a/pedido/t", { writeText })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://x.test/a/pedido/t");
  });

  it("si el portapapeles falla o no existe, devuelve false sin lanzar", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denegado"));
    expect(await copyText("https://x.test", { writeText })).toBe(false);
    expect(await copyText("https://x.test", undefined)).toBe(false);
  });
});
