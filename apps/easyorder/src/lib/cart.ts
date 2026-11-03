import { addCents, type Cents, cents, centsFromDecimal, multiplyCents } from "@konnecttia/domain";
import type { MenuItem } from "./types";

/**
 * Carrito del cliente. Los importes aquí son solo una estimación para mostrar: el total que vale
 * es el que calcula la API al crear el pedido.
 */
export type CartLine = {
  /** Identifica la combinación producto + variante + extras + nota. */
  readonly key: string;
  readonly itemId: number;
  readonly variantId: number;
  readonly name: string;
  readonly variantName: string;
  readonly unitCents: Cents;
  readonly extras: readonly { readonly id: number; readonly name: string; readonly cents: Cents }[];
  readonly quantity: number;
  readonly note: string;
};

export const MAX_QUANTITY = 20;

export function buildLine(
  item: MenuItem,
  variantId: number,
  extraIds: readonly number[],
  quantity: number,
  note: string,
): CartLine {
  const variant = item.variants.find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw new Error(`Variante ${variantId} no pertenece a ${item.name}`);
  }
  const extras = [...new Set(extraIds)]
    .sort((a, b) => a - b)
    .map((id) => {
      const extra = item.extras.find((candidate) => candidate.id === id);
      if (!extra) throw new Error(`Extra ${id} no pertenece a ${item.name}`);
      return { id: extra.id, name: extra.name, cents: centsFromDecimal(extra.price) };
    });
  const cleanNote = note.trim().slice(0, 200);
  return {
    key: [item.id, variant.id, extras.map((extra) => extra.id).join("."), cleanNote].join("|"),
    itemId: item.id,
    variantId: variant.id,
    name: item.name,
    variantName: variant.name,
    unitCents: centsFromDecimal(variant.price),
    extras,
    quantity: clampQuantity(quantity),
    note: cleanNote,
  };
}

function clampQuantity(quantity: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

/** Añade una línea; si ya existe la misma combinación, suma cantidades. */
export function addLine(lines: readonly CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((candidate) => candidate.key === line.key);
  if (!existing) return [...lines, line];
  return lines.map((candidate) =>
    candidate.key === line.key
      ? { ...candidate, quantity: clampQuantity(candidate.quantity + line.quantity) }
      : candidate,
  );
}

/** Cambia la cantidad; 0 o menos elimina la línea. */
export function setQuantity(lines: readonly CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.key !== key);
  return lines.map((line) =>
    line.key === key ? { ...line, quantity: clampQuantity(quantity) } : line,
  );
}

export function lineCents(line: CartLine): Cents {
  const unit = addCents(line.unitCents, ...line.extras.map((extra) => extra.cents));
  return multiplyCents(unit, line.quantity);
}

export function subtotalCents(lines: readonly CartLine[]): Cents {
  return lines.reduce<Cents>((total, line) => addCents(total, lineCents(line)), cents(0));
}

export function itemCount(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

/** Cuerpo `items` del POST /orders: solo ids y cantidades, nunca precios. */
export function toOrderItems(lines: readonly CartLine[]) {
  return lines.map((line) => ({
    menu_item_id: line.itemId,
    menu_variant_id: line.variantId,
    quantity: line.quantity,
    ...(line.extras.length > 0
      ? { extras: line.extras.map((extra) => ({ extra_id: extra.id, quantity: 1 })) }
      : {}),
    ...(line.note ? { nota: line.note } : {}),
  }));
}

/** Lee un carrito guardado, descartando lo que no tenga la forma esperada. */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (line): line is CartLine =>
        typeof line === "object" &&
        line !== null &&
        typeof line.key === "string" &&
        Number.isSafeInteger(line.itemId) &&
        Number.isSafeInteger(line.variantId) &&
        Number.isSafeInteger(line.unitCents) &&
        Number.isSafeInteger(line.quantity) &&
        Array.isArray(line.extras),
    );
  } catch {
    return [];
  }
}
