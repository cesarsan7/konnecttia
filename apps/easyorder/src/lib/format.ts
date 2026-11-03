import { type Cents, centsFromDecimal, formatEuros } from "@konnecttia/domain";

/** Importe en euros tal como lo devuelve la API (número decimal). */
export function euros(value: number): string {
  return formatEuros(centsFromDecimal(value));
}

export function eurosFromCents(value: Cents): string {
  return formatEuros(value);
}
