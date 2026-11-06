export type RetryPolicy = {
  readonly maxAttempts: number;
  readonly backoffBaseSeconds: number;
  readonly backoffMaxSeconds: number;
};

export const RETRY_DECISION = {
  Retry: "reintentar",
  Exhausted: "agotado",
} as const;

export type RetryDecision =
  | { readonly kind: typeof RETRY_DECISION.Retry; readonly delaySeconds: number }
  | { readonly kind: typeof RETRY_DECISION.Exhausted };

/** Espera tras el intento `attempt` (1 = el primero): base · 2^(intento-1), con tope. */
export function backoffSeconds(attempt: number, policy: RetryPolicy): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(policy.backoffBaseSeconds * 2 ** exponent, policy.backoffMaxSeconds);
}

/** Tras un fallo en el intento `attempt`: reintentar con espera creciente o darlo por agotado. */
export function decideRetry(attempt: number, policy: RetryPolicy): RetryDecision {
  if (attempt >= policy.maxAttempts) return { kind: RETRY_DECISION.Exhausted };
  return { kind: RETRY_DECISION.Retry, delaySeconds: backoffSeconds(attempt, policy) };
}
