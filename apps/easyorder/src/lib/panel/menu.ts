import { ALLERGEN_LABEL, ALLERGENS, type Allergen, formatEuros } from "@konnecttia/domain";

/** Respuestas de GET /panel/:slug/carta (apps/api/src/routes/panel-menu.ts). */

export type AdminCategory = {
  readonly id: number;
  readonly nombre: string;
  readonly activa: boolean;
  readonly orden: number;
};

export type AdminVariant = {
  readonly id: number;
  readonly nombre: string;
  readonly precio_centimos: number;
  readonly predeterminada: boolean;
  readonly activa: boolean;
  readonly orden: number;
};

export type AdminItem = {
  readonly id: number;
  readonly categoria_id: number;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly imagen_url: string | null;
  readonly activo: boolean;
  readonly orden: number;
  readonly alergenos: readonly Allergen[] | null;
  readonly variantes: readonly AdminVariant[];
  readonly no_disponible_en: readonly number[];
};

export type AdminExtra = {
  readonly id: number;
  readonly nombre: string;
  readonly precio_centimos: number;
  readonly activo: boolean;
  readonly orden: number;
  readonly alergenos: readonly Allergen[] | null;
  readonly categorias: readonly number[];
};

export type AdminMenu = {
  readonly categorias: readonly AdminCategory[];
  readonly productos: readonly AdminItem[];
  readonly extras: readonly AdminExtra[];
  readonly locales: readonly {
    readonly id: number;
    readonly nombre: string;
    readonly activo: boolean;
  }[];
  readonly subida_fotos: boolean;
  readonly edicion_completa: boolean;
};

export { ALLERGEN_LABEL, ALLERGENS, type Allergen };

const PRICE_PATTERN = /^\d{1,4}([.,]\d{1,2})?$/;

/** «12,5» → 1250 céntimos. null si no es un precio válido (sin negativos ni más de 2 decimales). */
export function parsePrice(text: string): number | null {
  const value = text.trim().replace(/\s|€/g, "");
  if (!PRICE_PATTERN.test(value)) return null;
  const [whole = "0", fraction = ""] = value.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** 1250 → «12,50» (para rellenar un campo de precio). */
export function priceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatPrice(cents: number): string {
  return formatEuros(cents as Parameters<typeof formatEuros>[0]);
}

/** Precio de un producto en la lista: «9,00 €» o «desde 9,00 €» si hay varias variantes activas. */
export function priceLabel(variants: readonly AdminVariant[]): string {
  const active = variants.filter((variant) => variant.activa);
  if (active.length === 0) return "Sin precio";
  const min = Math.min(...active.map((variant) => variant.precio_centimos));
  const max = Math.max(...active.map((variant) => variant.precio_centimos));
  return min === max ? formatPrice(min) : `desde ${formatPrice(min)}`;
}

export function allergenSummary(value: readonly Allergen[] | null): string {
  if (value === null) return "Alérgenos no informados";
  if (value.length === 0) return "Sin alérgenos declarados";
  return value.map((allergen) => ALLERGEN_LABEL[allergen]).join(", ");
}

/** Mueve un id una posición arriba (-1) o abajo (+1). Devuelve la lista sin cambios si no puede. */
export function moveId(ids: readonly number[], id: number, step: -1 | 1): number[] {
  const list = [...ids];
  const from = list.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= list.length) return list;
  [list[from], list[to]] = [list[to] as number, list[from] as number];
  return list;
}

/** Variante en edición: sin id si es nueva. */
export type VariantDraft = {
  readonly key: string;
  readonly id: number | null;
  readonly nombre: string;
  readonly precio: string;
  readonly predeterminada: boolean;
  readonly activa: boolean;
};

export type VariantPlan = {
  readonly create: readonly {
    nombre: string;
    precio_centimos: number;
    predeterminada: boolean;
    activa: boolean;
  }[];
  readonly update: readonly {
    id: number;
    changes: Partial<{
      nombre: string;
      precio_centimos: number;
      predeterminada: boolean;
      activa: boolean;
    }>;
  }[];
  readonly remove: readonly number[];
  /** Orden final de las existentes (las nuevas se añaden al final), o null si no cambia. */
  readonly order: readonly number[] | null;
};

export type DraftError = { readonly key: string; readonly message: string };

/** Valida las variantes de un producto: al menos una, nombres únicos y precios correctos. */
export function validateVariants(drafts: readonly VariantDraft[]): DraftError[] {
  const errors: DraftError[] = [];
  if (drafts.length === 0) errors.push({ key: "", message: "Añade al menos un precio." });
  const seen = new Set<string>();
  for (const draft of drafts) {
    const name = draft.nombre.trim().toLocaleLowerCase("es");
    if (!name) errors.push({ key: draft.key, message: "Ponle nombre (por ejemplo, «Normal»)." });
    else if (seen.has(name)) errors.push({ key: draft.key, message: "Ese nombre ya está." });
    seen.add(name);
    if (parsePrice(draft.precio) === null) {
      errors.push({ key: draft.key, message: "Precio no válido. Ejemplo: 9,50" });
    }
  }
  return errors;
}

/**
 * Qué llamadas hacen falta para pasar de las variantes guardadas al borrador. Las nuevas se
 * crean después de borrar, para que un nombre reutilizado no choque con uno que se elimina.
 */
export function planVariants(
  original: readonly AdminVariant[],
  drafts: readonly VariantDraft[],
): VariantPlan {
  const kept = drafts.filter((draft) => draft.id !== null);
  const keptIds = new Set(kept.map((draft) => draft.id));
  const remove = original.filter((variant) => !keptIds.has(variant.id)).map((v) => v.id);
  const update: VariantPlan["update"][number][] = [];
  for (const draft of kept) {
    const before = original.find((variant) => variant.id === draft.id);
    if (!before || draft.id === null) continue;
    const changes: VariantPlan["update"][number]["changes"] = {};
    const nombre = draft.nombre.trim();
    const precio = parsePrice(draft.precio);
    if (nombre !== before.nombre) changes.nombre = nombre;
    if (precio !== null && precio !== before.precio_centimos) changes.precio_centimos = precio;
    if (draft.activa !== before.activa) changes.activa = draft.activa;
    // Solo se marca la nueva predeterminada: la API desmarca las demás.
    if (draft.predeterminada && !before.predeterminada) changes.predeterminada = true;
    if (Object.keys(changes).length > 0) update.push({ id: draft.id, changes });
  }
  const create = drafts
    .filter((draft) => draft.id === null)
    .map((draft) => ({
      nombre: draft.nombre.trim(),
      precio_centimos: parsePrice(draft.precio) ?? 0,
      predeterminada: draft.predeterminada,
      activa: draft.activa,
    }));
  const finalOrder = kept.map((draft) => draft.id as number);
  const originalOrder = original
    .filter((variant) => keptIds.has(variant.id))
    .map((variant) => variant.id);
  const changedOrder = finalOrder.some((id, index) => originalOrder[index] !== id);
  return { create, update, remove, order: changedOrder ? finalOrder : null };
}

export function draftsFrom(variants: readonly AdminVariant[]): VariantDraft[] {
  return variants.map((variant) => ({
    key: `v${variant.id}`,
    id: variant.id,
    nombre: variant.nombre,
    precio: priceInput(variant.precio_centimos),
    predeterminada: variant.predeterminada,
    activa: variant.activa,
  }));
}

/** Productos de una categoría en su orden. */
export function itemsOf(menu: AdminMenu, categoryId: number): AdminItem[] {
  return menu.productos
    .filter((item) => item.categoria_id === categoryId)
    .sort((a, b) => a.orden - b.orden || a.id - b.id);
}

/** Mensaje para el equipo a partir del motivo de un 409 de la carta. */
export function menuConflictMessage(reason: string | undefined): string {
  switch (reason) {
    case "duplicate_name":
      return "Ya existe uno con ese nombre.";
    case "duplicate_variant_name":
      return "Dos precios tienen el mismo nombre.";
    case "category_has_items":
      return "La categoría tiene productos. Muévelos o bórralos antes.";
    case "last_variant":
      return "Un producto necesita al menos un precio. Ocúltalo si no quieres venderlo.";
    case "order_mismatch":
      return "La carta cambió mientras tanto. La recargamos.";
    default:
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}
