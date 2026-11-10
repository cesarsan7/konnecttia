import { describe, expect, it } from "vitest";
import { type Billing, billingNotice, periodEnd, planLabel } from "./billing";

const base: Billing = {
  disponible: true,
  plan_actual: "basico",
  planes_de_pago: [],
  suscripcion: null,
};
const sub = (over: Partial<NonNullable<Billing["suscripcion"]>>): Billing => ({
  ...base,
  suscripcion: {
    plan: "premium",
    estado: "activa",
    periodo_fin: null,
    cancelar_al_final: false,
    tiene_portal: true,
    ...over,
  },
});

describe("facturación (panel)", () => {
  it("nombra los planes y tolera uno desconocido", () => {
    expect(planLabel("premium")).toBe("Premium");
    expect(planLabel("raro")).toBe("raro");
    expect(planLabel(null)).toBe("Sin plan");
  });

  it("formatea el fin del periodo y tolera fechas inválidas", () => {
    expect(periodEnd("2026-12-15T10:00:00Z")).toBe("15 de diciembre de 2026");
    expect(periodEnd("no es fecha")).toBeNull();
    expect(periodEnd(null)).toBeNull();
  });

  it("avisa del impago, la cancelación y la baja programada", () => {
    expect(billingNotice(base)).toBeNull();
    expect(billingNotice(sub({}))).toBeNull();
    expect(billingNotice(sub({ estado: "impago" }))).toContain("No pudimos cobrar");
    expect(billingNotice(sub({ estado: "cancelada" }))).toContain("cancelada");
    expect(
      billingNotice(sub({ cancelar_al_final: true, periodo_fin: "2026-12-15T10:00:00Z" })),
    ).toContain("15 de diciembre de 2026");
  });
});
