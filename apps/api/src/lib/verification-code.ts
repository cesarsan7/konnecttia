import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Código de verificación de 6 cifras (con ceros a la izquierda), de un generador criptográfico. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * HMAC-SHA256 del código atado a restaurante y teléfono. Así un código de un restaurante o de un
 * teléfono no sirve en otro, y un volcado de la base no permite verificar nada sin el secreto.
 */
export function hashCode(
  secret: string,
  restaurantId: number,
  phone: string,
  code: string,
): string {
  return createHmac("sha256", secret).update(`${restaurantId}:${phone}:${code}`).digest("hex");
}

/** Comparación en tiempo constante de dos hashes en hexadecimal. */
export function hashesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(received, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/** Solo dígitos: descarta espacios y guiones que el cliente pueda escribir. */
export function cleanCode(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}
