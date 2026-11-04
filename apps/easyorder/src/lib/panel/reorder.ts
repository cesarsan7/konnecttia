import { addLine, buildLine, type CartLine } from "../cart";
import type { Menu, MenuItem } from "../types";

/** Respuesta de GET /panel/:slug/orders/anteriores (apps/api/src/routes/panel-orders.ts). */
export type PreviousOrder = {
  readonly id: number;
  readonly codigo: string | null;
  readonly created_at: string;
  readonly tipo_despacho: string | null;
  readonly direccion: string | null;
  readonly local_nombre: string | null;
  readonly total: number;
  readonly items: unknown;
};

export type PreviousOrders = {
  readonly cliente: {
    readonly nombre: string | null;
    readonly direccion_frecuente: string | null;
  } | null;
  readonly pedidos: readonly PreviousOrder[];
};

const normalize = (value: unknown) =>
  typeof value === "string" ? value.trim().toLocaleLowerCase("es") : "";

const positive = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

/**
 * Convierte las líneas de un pedido anterior en líneas del carrito con la carta de hoy: precios
 * actuales (el total lo vuelve a calcular el servidor) y solo lo que sigue a la venta en el local.
 * Se busca por id y, si no lo hay (pedidos antiguos o de WhatsApp), por nombre de producto y
 * variante. Lo que ya no está en la carta se devuelve en `missing` para avisar al equipo.
 */
export function rebuildLines(menu: Menu, items: unknown): { lines: CartLine[]; missing: string[] } {
  const all: MenuItem[] = menu.categories.flatMap((category) => [...category.items]);
  let lines: CartLine[] = [];
  const missing: string[] = [];
  if (!Array.isArray(items)) return { lines, missing };
  for (const raw of items) {
    const line = (raw ?? {}) as Record<string, unknown>;
    const name = (line.item_name ?? line.nombre ?? line.name) as string | undefined;
    const item =
      all.find((candidate) => candidate.id === Number(line.menu_item_id)) ??
      all.find((candidate) => normalize(candidate.name) === normalize(name));
    const variant =
      item?.variants.find((candidate) => candidate.id === Number(line.menu_variant_id)) ??
      item?.variants.find(
        (candidate) => normalize(candidate.name) === normalize(line.variant_name),
      ) ??
      (item?.variants.length === 1 ? item.variants[0] : undefined);
    if (!item || !variant) {
      missing.push(typeof name === "string" && name.trim() ? name.trim() : "Producto");
      continue;
    }
    const extras = Array.isArray(line.extras) ? (line.extras as Record<string, unknown>[]) : [];
    const extraIds = extras
      .map(
        (extra) =>
          item.extras.find((candidate) => candidate.id === Number(extra.extra_id)) ??
          item.extras.find(
            (candidate) => normalize(candidate.name) === normalize(extra.name ?? extra.nombre),
          ),
      )
      .filter((extra) => extra !== undefined)
      .map((extra) => extra.id);
    if (extraIds.length < extras.length) missing.push(`extras de ${item.name}`);
    const note = typeof line.nota === "string" ? line.nota : "";
    const quantity = positive(line.quantity ?? line.cantidad, 1);
    lines = addLine(lines, buildLine(item, variant.id, extraIds, quantity, note));
  }
  return { lines, missing };
}
