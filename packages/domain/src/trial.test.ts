import { describe, expect, it } from "vitest";
import {
  isTrialState,
  TRIAL_STATE,
  trialDaysLeft,
  trialEnd,
  trialEndOnApproval,
  trialOrdersLeft,
} from "./trial";

const now = new Date("2026-11-03T12:00:00Z");

describe("prueba gratuita", () => {
  it("reconoce los estados", () => {
    for (const state of Object.values(TRIAL_STATE)) expect(isTrialState(state)).toBe(true);
    expect(isTrialState("vencida")).toBe(false);
  });

  it("los días restantes se redondean hacia arriba y no bajan de 0", () => {
    expect(trialDaysLeft(null, now)).toBeNull();
    expect(trialDaysLeft(new Date("2026-11-10T12:00:00Z"), now)).toBe(7);
    expect(trialDaysLeft(new Date("2026-11-04T00:00:00Z"), now)).toBe(1);
    expect(trialDaysLeft(now, now)).toBe(0);
    expect(trialDaysLeft(new Date("2026-11-01T00:00:00Z"), now)).toBe(0);
  });

  it("los pedidos restantes no son negativos y null es sin límite", () => {
    expect(trialOrdersLeft(null, 50)).toBeNull();
    expect(trialOrdersLeft(30, 12)).toBe(18);
    expect(trialOrdersLeft(30, 30)).toBe(0);
    expect(trialOrdersLeft(30, 31)).toBe(0);
  });

  it("calcula el fin desde el inicio y los días", () => {
    expect(trialEnd(now, null)).toBeNull();
    expect(trialEnd(now, 14)?.toISOString()).toBe("2026-11-17T12:00:00.000Z");
  });

  it("al aprobar, la prueba dura lo mismo desde el momento de la aprobación", () => {
    const start = new Date("2026-11-01T12:00:00Z");
    const end = new Date("2026-11-15T12:00:00Z");
    const approved = new Date("2026-11-05T09:00:00Z");
    expect(trialEndOnApproval(start, end, approved)?.toISOString()).toBe(
      "2026-11-19T09:00:00.000Z",
    );
    expect(trialEndOnApproval(start, null, approved)).toBeNull();
  });
});
