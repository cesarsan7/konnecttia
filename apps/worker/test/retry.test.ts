import { describe, expect, it } from "vitest";
import { backoffSeconds, decideRetry, RETRY_DECISION } from "../src/retry";

const policy = { maxAttempts: 5, backoffBaseSeconds: 30, backoffMaxSeconds: 600 };

describe("reintentos con espera creciente", () => {
  it("la espera se duplica en cada intento", () => {
    expect([1, 2, 3, 4].map((attempt) => backoffSeconds(attempt, policy))).toEqual([
      30, 60, 120, 240,
    ]);
  });

  it("la espera tiene tope", () => {
    expect(backoffSeconds(10, policy)).toBe(600);
  });

  it("reintenta mientras queden intentos", () => {
    expect(decideRetry(1, policy)).toEqual({ kind: RETRY_DECISION.Retry, delaySeconds: 30 });
    expect(decideRetry(4, policy)).toEqual({ kind: RETRY_DECISION.Retry, delaySeconds: 240 });
  });

  it("al llegar al máximo de intentos se da por agotado", () => {
    expect(decideRetry(5, policy)).toEqual({ kind: RETRY_DECISION.Exhausted });
    expect(decideRetry(6, policy)).toEqual({ kind: RETRY_DECISION.Exhausted });
  });
});
