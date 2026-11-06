import { describe, expect, it } from "vitest";
import { type Trial, trialBanner } from "./trial";

const trial = (overrides: Partial<Trial> = {}): Trial => ({
  estado: "activa",
  dias_restantes: 10,
  pedidos_restantes: 40,
  acepta_pedidos: true,
  contacto: "hola@konnecttia.test",
  ...overrides,
});

describe("banner de la prueba", () => {
  it("sin prueba o ya convertida no hay banner", () => {
    expect(trialBanner(null)).toBeNull();
    expect(trialBanner(trial({ estado: "convertida" }))).toBeNull();
  });

  it("prueba vigente: días y pedidos que quedan", () => {
    expect(trialBanner(trial())).toEqual({
      tone: "info",
      text: "Prueba: te quedan 10 días y 40 pedidos.",
      contact: null,
    });
    expect(trialBanner(trial({ pedidos_restantes: null }))?.text).toBe(
      "Prueba: te quedan 10 días.",
    );
    expect(trialBanner(trial({ dias_restantes: null }))?.text).toBe(
      "Prueba: te quedan 40 pedidos.",
    );
    expect(trialBanner(trial({ dias_restantes: 1, pedidos_restantes: 1 }))?.text).toBe(
      "Prueba: te quedan 1 día y 1 pedido.",
    );
  });

  it("sin límites lo dice sin cifras", () => {
    const banner = trialBanner(trial({ dias_restantes: null, pedidos_restantes: null }));
    expect(banner?.text).toBe("Estás en la prueba gratuita de EasyOrder.");
    expect(banner?.tone).toBe("info");
  });

  it("avisa con otro tono cuando queda poco", () => {
    expect(trialBanner(trial({ dias_restantes: 3 }))?.tone).toBe("warn");
    expect(trialBanner(trial({ pedidos_restantes: 5 }))?.tone).toBe("warn");
    expect(trialBanner(trial({ dias_restantes: 4, pedidos_restantes: 6 }))?.tone).toBe("info");
  });

  it("pendiente de aprobación", () => {
    const banner = trialBanner(trial({ estado: "pendiente", acepta_pedidos: false }));
    expect(banner?.tone).toBe("warn");
    expect(banner?.text).toMatch(/Pendiente de aprobación/);
  });

  it("prueba terminada: los datos se conservan y se invita a activar el plan", () => {
    const banner = trialBanner(trial({ acepta_pedidos: false, dias_restantes: 0 }));
    expect(banner).toEqual({
      tone: "danger",
      text: "Tu prueba terminó: tus datos se conservan. Activa tu plan escribiendo a",
      contact: "hola@konnecttia.test",
    });
    const noContact = trialBanner(trial({ acepta_pedidos: false, contacto: null }));
    expect(noContact?.contact).toBeNull();
    expect(noContact?.text).toMatch(/Activa tu plan hablando con Konnecttia/);
  });

  it("solicitud rechazada", () => {
    const banner = trialBanner(trial({ estado: "rechazada", acepta_pedidos: false }));
    expect(banner?.tone).toBe("danger");
    expect(banner?.contact).toBe("hola@konnecttia.test");
    expect(banner?.text).toMatch(/no se ha aprobado/);
  });
});
