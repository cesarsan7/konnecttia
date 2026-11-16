import { describe, expect, it } from "vitest";
import { type AgentParam, draftChanges, toDraft } from "./agent-params";

const base: AgentParam = {
  clave: "cart_expiry_minutes",
  etiqueta: "Caducidad",
  descripcion: "",
  tipo: "entero",
  unidad: "min",
  minimo: 5,
  maximo: 240,
  opciones: null,
  nivel: "basico",
  valor: "30",
};
const states: AgentParam = {
  ...base,
  clave: "agente_notif_estados",
  tipo: "json",
  opciones: ["listo", "entregado"],
  valor: '["listo"]',
};

describe("parámetros del agente", () => {
  it("lee cada tipo a su borrador", () => {
    expect(toDraft(base)).toBe("30");
    expect(toDraft(states)).toEqual(["listo"]);
    expect(toDraft({ ...base, tipo: "booleano", valor: "true" })).toBe(true);
    expect(toDraft({ ...states, valor: "no es json" })).toEqual([]);
  });

  it("solo envía lo que cambió y con el tipo de la API", () => {
    const result = draftChanges([base, states], {
      cart_expiry_minutes: "45",
      agente_notif_estados: ["listo"],
    });
    expect(result).toEqual({ ok: true, changes: { cart_expiry_minutes: 45 } });
  });

  it("valida enteros y rango antes de enviar", () => {
    expect(draftChanges([base], { cart_expiry_minutes: "" })).toMatchObject({ ok: false });
    expect(draftChanges([base], { cart_expiry_minutes: "12.5" })).toMatchObject({ ok: false });
    expect(draftChanges([base], { cart_expiry_minutes: "1" })).toMatchObject({ ok: false });
    expect(draftChanges([base], { cart_expiry_minutes: "999" })).toMatchObject({ ok: false });
  });
});
