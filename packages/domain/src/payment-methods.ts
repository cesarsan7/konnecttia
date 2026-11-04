/**
 * Métodos de pago que un restaurante puede aceptar (`restaurante.payment_methods`).
 * «online» queda fuera hasta que exista la pasarela (fase de cobro online).
 */
export const PAYMENT_METHOD = {
  Cash: "efectivo",
  Card: "tarjeta",
  Transfer: "transferencia",
  Bizum: "bizum",
} as const;

export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const PAYMENT_METHODS: readonly PaymentMethod[] = Object.values(PAYMENT_METHOD);

/** Pago posterior al pedido: el pedido queda pendiente de cobro hasta que el local lo confirma. */
export const DEFERRED_PAYMENT_METHODS: ReadonlySet<string> = new Set([
  PAYMENT_METHOD.Transfer,
  PAYMENT_METHOD.Bizum,
]);

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Datos que el cliente necesita para pagar por transferencia o Bizum. */
export type BankDetails = {
  readonly titular?: string;
  readonly banco?: string;
  readonly iban?: string;
  readonly concepto?: string;
  readonly bizum?: string;
};

export const PAYMENT_SETUP_ERROR = {
  NoMethod: "no_payment_method",
  TransferWithoutIban: "transfer_without_iban",
  BizumWithoutPhone: "bizum_without_phone",
} as const;

export type PaymentSetupError = (typeof PAYMENT_SETUP_ERROR)[keyof typeof PAYMENT_SETUP_ERROR];

/** Comprueba que el cliente podrá pagar con lo que el restaurante acepta. */
export function checkPaymentSetup(
  methods: readonly PaymentMethod[],
  bank: BankDetails | null,
): PaymentSetupError | null {
  if (methods.length === 0) return PAYMENT_SETUP_ERROR.NoMethod;
  if (methods.includes(PAYMENT_METHOD.Transfer) && !(bank?.iban?.trim() && bank.titular?.trim())) {
    return PAYMENT_SETUP_ERROR.TransferWithoutIban;
  }
  if (methods.includes(PAYMENT_METHOD.Bizum) && !bank?.bizum?.trim()) {
    return PAYMENT_SETUP_ERROR.BizumWithoutPhone;
  }
  return null;
}

/** IBAN español o europeo con su dígito de control (ISO 13616, mod 97). */
export function isValidIban(value: string): boolean {
  const iban = value.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
