import { describe, expect, it } from "vitest";
import { deliveryStep, driversFor, mapsLink } from "./drivers";

describe("repartos", () => {
  it("propone salir desde listo y entregar en camino, salvo con cobro pendiente", () => {
    expect(deliveryStep({ estado: "listo", estado_pago: "no_aplica" })?.action).toBe("salida");
    expect(deliveryStep({ estado: "en_camino", estado_pago: "no_aplica" })?.action).toBe(
      "entregado",
    );
    expect(deliveryStep({ estado: "en_camino", estado_pago: "pendiente" })).toBeNull();
    expect(deliveryStep({ estado: "en_preparacion", estado_pago: "no_aplica" })).toBeNull();
  });

  it("filtra repartidores por local", () => {
    const drivers = [
      { membership_id: 1, email: "a", roles: [], locales: "todos" as const, en_curso: 0 },
      { membership_id: 2, email: "b", roles: [], locales: [7], en_curso: 0 },
    ];
    expect(driversFor(drivers, 7).map((d) => d.membership_id)).toEqual([1, 2]);
    expect(driversFor(drivers, 8).map((d) => d.membership_id)).toEqual([1]);
  });

  it("enlaza al mapa por coordenadas o dirección", () => {
    expect(mapsLink({ lat: "28.9", lng: "-13.5", direccion: "x" })).toContain("28.9,-13.5");
    expect(mapsLink({ lat: null, lng: null, direccion: "Calle Real 1" })).toContain(
      "Calle%20Real%201",
    );
    expect(mapsLink({ lat: null, lng: null, direccion: null })).toBeNull();
  });
});
