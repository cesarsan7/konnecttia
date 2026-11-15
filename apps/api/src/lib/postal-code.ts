/**
 * Código postal dentro de una dirección escrita («Calle Mayor 12, 35500 Arrecife»): el último grupo
 * de 4 a 6 cifras suelto. Prefiere los de 5 cifras (el formato más habitual) para no confundirlo
 * con un número de portal largo. `null` si no hay (p. ej. códigos con letras: el agente los pasa
 * aparte en `codigo_postal`).
 */
export function findPostalCode(address: string): string | null {
  const groups = address.match(/(?<![\d-])\d{4,6}(?![\d-])/g) ?? [];
  const five = groups.filter((group) => group.length === 5);
  return (five.length > 0 ? five : groups).at(-1) ?? null;
}
