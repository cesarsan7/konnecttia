/**
 * Dinero en céntimos enteros. Nunca usar decimales de coma flotante para importes.
 */
export type Cents = number & { readonly __brand: "Cents" };

export const CURRENCY = "EUR" as const;
export const LOCALE = "es-ES" as const;

const DECIMAL_AMOUNT = /^(\d+)(?:[.,](\d{1,2}))?$/;

export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Importe no válido: ${String(value)}`);
    this.name = "InvalidAmountError";
  }
}

export function cents(value: number): Cents {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InvalidAmountError(value);
  }
  return value as Cents;
}

/** Convierte "4.80", "4,8" o "12" en céntimos sin pasar por coma flotante. */
export function centsFromDecimal(value: string | number): Cents {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = DECIMAL_AMOUNT.exec(text);
  if (!match) {
    throw new InvalidAmountError(value);
  }
  const euros = Number(match[1]);
  const fraction = (match[2] ?? "").padEnd(2, "0");
  return cents(euros * 100 + Number(fraction));
}

export function addCents(...values: readonly Cents[]): Cents {
  return cents(values.reduce<number>((total, value) => total + value, 0));
}

export function multiplyCents(value: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new InvalidAmountError(quantity);
  }
  return cents(value * quantity);
}

export function formatEuros(value: Cents): string {
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY }).format(
    value / 100,
  );
}
