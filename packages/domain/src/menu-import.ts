/**
 * Importación de una carta desde texto tabulado (pegado desde una hoja de cálculo o transcrito
 * de una foto). Lógica pura: no toca la base de datos. Formato, una fila por variante:
 *
 *   categoria ; producto ; descripcion ; variante ; precio ; por_defecto
 *
 * - Separador: tabulador o punto y coma (se detecta en la primera fila con datos).
 * - La fila de cabecera es opcional. `descripcion`, `variante` y `por_defecto` pueden ir vacíos.
 * - Sin variante: «Única». Sin `por_defecto`: la primera fila del producto es la de por defecto.
 * - El precio admite «4,90» o «4.90»; se guarda en euros con dos decimales.
 * - La descripción de un producto es la de su primera fila que la traiga.
 */
import { type Cents, centsFromDecimal } from "./money";

export const MENU_IMPORT_LIMITS = {
  maxRows: 1000,
  maxCategories: 60,
  maxCategoryName: 100,
  maxItemName: 150,
  maxDescription: 500,
  maxVariantName: 80,
} as const;

export const MENU_IMPORT_ERROR = {
  Empty: "empty",
  TooManyRows: "too_many_rows",
  MissingColumns: "missing_columns",
  MissingCategory: "missing_category",
  MissingProduct: "missing_product",
  InvalidPrice: "invalid_price",
  TooLong: "too_long",
  TooManyCategories: "too_many_categories",
  DuplicateVariant: "duplicate_variant",
  InvalidDefault: "invalid_default",
} as const;

export type MenuImportErrorCode = (typeof MENU_IMPORT_ERROR)[keyof typeof MENU_IMPORT_ERROR];

export type MenuImportError = {
  /** Número de línea del texto original (empieza en 1). 0 si el error no es de una línea. */
  readonly line: number;
  readonly code: MenuImportErrorCode;
  readonly detail?: string;
};

export type ImportedVariant = {
  readonly nombre: string;
  readonly precio: Cents;
  readonly porDefecto: boolean;
};

export type ImportedItem = {
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly variantes: readonly ImportedVariant[];
};

export type ImportedCategory = {
  readonly nombre: string;
  readonly productos: readonly ImportedItem[];
};

export type MenuImportResult =
  | { readonly ok: true; readonly categorias: readonly ImportedCategory[] }
  | { readonly ok: false; readonly errors: readonly MenuImportError[] };

const HEADER_WORDS = new Set(["categoria", "categoría", "category"]);
const TRUE_WORDS = new Set(["1", "si", "sí", "s", "true", "x", "yes", "y"]);
const FALSE_WORDS = new Set(["0", "no", "n", "false"]);
const DEFAULT_VARIANT = "Única";
const MAX_ERRORS = 50;

function splitLine(line: string, separator: string): string[] {
  return line.split(separator).map((cell) => cell.trim());
}

function detectSeparator(lines: readonly string[]): string {
  const first = lines.find((line) => line.trim() !== "") ?? "";
  return first.includes("\t") ? "\t" : ";";
}

type Draft = {
  nombre: string;
  descripcion: string | null;
  variantes: { nombre: string; precio: Cents; porDefecto: boolean | null }[];
};

export function parseMenuImport(text: string): MenuImportResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const separator = detectSeparator(lines);
  const errors: MenuImportError[] = [];
  const fail = (line: number, code: MenuImportErrorCode, detail?: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push(detail === undefined ? { line, code } : { line, code, detail });
    }
  };

  const categories = new Map<string, Map<string, Draft>>();
  let dataRows = 0;
  let seenHeader = false;

  for (const [index, raw] of lines.entries()) {
    const lineNumber = index + 1;
    if (raw.trim() === "") continue;
    const cells = splitLine(raw, separator);
    if (!seenHeader && dataRows === 0 && HEADER_WORDS.has((cells[0] ?? "").toLowerCase())) {
      seenHeader = true;
      continue;
    }
    dataRows += 1;
    if (dataRows > MENU_IMPORT_LIMITS.maxRows) {
      if (dataRows === MENU_IMPORT_LIMITS.maxRows + 1) fail(0, MENU_IMPORT_ERROR.TooManyRows);
      continue;
    }
    if (cells.length < 5) {
      fail(lineNumber, MENU_IMPORT_ERROR.MissingColumns, String(cells.length));
      continue;
    }
    const [
      category = "",
      product = "",
      description = "",
      variantCell = "",
      priceCell = "",
      defaultCell = "",
    ] = cells;
    if (category === "") {
      fail(lineNumber, MENU_IMPORT_ERROR.MissingCategory);
      continue;
    }
    if (product === "") {
      fail(lineNumber, MENU_IMPORT_ERROR.MissingProduct);
      continue;
    }
    const variant = variantCell === "" ? DEFAULT_VARIANT : variantCell;
    if (
      category.length > MENU_IMPORT_LIMITS.maxCategoryName ||
      product.length > MENU_IMPORT_LIMITS.maxItemName ||
      description.length > MENU_IMPORT_LIMITS.maxDescription ||
      variant.length > MENU_IMPORT_LIMITS.maxVariantName
    ) {
      fail(lineNumber, MENU_IMPORT_ERROR.TooLong);
      continue;
    }
    let price: Cents;
    try {
      price = centsFromDecimal(priceCell);
    } catch {
      fail(lineNumber, MENU_IMPORT_ERROR.InvalidPrice, priceCell);
      continue;
    }
    if (price <= 0) {
      fail(lineNumber, MENU_IMPORT_ERROR.InvalidPrice, priceCell);
      continue;
    }
    let isDefault: boolean | null = null;
    if (defaultCell !== "") {
      const word = defaultCell.toLowerCase();
      if (TRUE_WORDS.has(word)) {
        isDefault = true;
      } else if (FALSE_WORDS.has(word)) {
        isDefault = false;
      } else {
        fail(lineNumber, MENU_IMPORT_ERROR.InvalidDefault, defaultCell);
        continue;
      }
    }

    let products = categories.get(category);
    if (!products) {
      products = new Map();
      categories.set(category, products);
    }
    let draft = products.get(product);
    if (!draft) {
      draft = { nombre: product, descripcion: null, variantes: [] };
      products.set(product, draft);
    }
    if (draft.descripcion === null && description !== "") draft.descripcion = description;
    if (
      draft.variantes.some((existing) => existing.nombre.toLowerCase() === variant.toLowerCase())
    ) {
      fail(lineNumber, MENU_IMPORT_ERROR.DuplicateVariant, `${product} / ${variant}`);
      continue;
    }
    draft.variantes.push({ nombre: variant, precio: price, porDefecto: isDefault });
  }

  if (dataRows === 0) return { ok: false, errors: [{ line: 0, code: MENU_IMPORT_ERROR.Empty }] };
  if (categories.size > MENU_IMPORT_LIMITS.maxCategories) {
    fail(0, MENU_IMPORT_ERROR.TooManyCategories);
  }
  if (errors.length > 0) return { ok: false, errors };

  const result: ImportedCategory[] = [];
  for (const [categoryName, products] of categories) {
    const items: ImportedItem[] = [];
    for (const draft of products.values()) {
      // Una sola variante por defecto: la marcada (la primera si hay varias) o, si ninguna, la primera.
      const marked = draft.variantes.findIndex((variant) => variant.porDefecto === true);
      const defaultIndex = Math.max(marked, 0);
      items.push({
        nombre: draft.nombre,
        descripcion: draft.descripcion,
        variantes: draft.variantes.map((variant, index) => ({
          nombre: variant.nombre,
          precio: variant.precio,
          porDefecto: index === defaultIndex,
        })),
      });
    }
    result.push({ nombre: categoryName, productos: items });
  }
  return { ok: true, categorias: result };
}
