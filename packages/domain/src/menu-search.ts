/**
 * Búsqueda genérica en la carta de UN restaurante a partir de texto libre del cliente
 * (por ejemplo, «dos pizzas peperoni medianas»). Pura y determinista: sin I/O ni azar.
 * No contiene nombres de producto, sinónimos ni tamaños: todo sale de la carta recibida.
 */

export type SearchableItem = {
  readonly id: number;
  readonly name: string;
  readonly category: string;
  readonly description: string | null;
  readonly variants: readonly { readonly id: number; readonly name: string }[];
  readonly extras: readonly { readonly id: number; readonly name: string }[];
};

export type MenuMatch = {
  readonly itemId: number;
  /** De 0 a 1. Solo vale 1 si el texto coincide exactamente con el nombre del producto. */
  readonly score: number;
  /** Variante claramente nombrada en el texto, o la única variante del producto. */
  readonly variantId: number | null;
  /** Extras del producto nombrados en el texto. */
  readonly extraIds: readonly number[];
};

export const DEFAULT_SEARCH_LIMIT = 5;

/** Palabras vacías del español que no aportan al emparejamiento. */
export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  "un",
  "una",
  "uno",
  "unos",
  "unas",
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "con",
  "y",
  "e",
  "para",
  "por",
  "al",
  "a",
  "favor",
  "quiero",
  "me",
  "pon",
  "ponme",
  "dame",
  // Palabras con las que el cliente pregunta por un grupo de productos («qué variedades de
  // papas tienes»): piden el listado, no forman parte del nombre de ningún producto.
  "variedad",
  "variedades",
  "tipo",
  "tipos",
  "clase",
  "clases",
  "opcion",
  "opciones",
  "sabor",
  "sabores",
  "que",
  "hay",
  "tienes",
  "tienen",
  "teneis",
  "tenemos",
  "cual",
  "cuales",
  "dime",
  "lista",
]);

/** Números en palabras (0-10) y su forma en cifras, para comparar «cuatro» con «4». */
const NUMBER_WORDS: Readonly<Record<string, string>> = {
  cero: "0",
  uno: "1",
  un: "1",
  una: "1",
  dos: "2",
  tres: "3",
  cuatro: "4",
  cinco: "5",
  seis: "6",
  siete: "7",
  ocho: "8",
  nueve: "9",
  diez: "10",
};

/** Pesos de la puntuación (suman 1). */
const WEIGHT = {
  name: 0.7,
  category: 0.15,
  description: 0.05,
  variant: 0.1,
} as const;

/** Un resultado que no es coincidencia exacta nunca llega a 1. */
const MAX_NON_EXACT_SCORE = 0.99;
const EXACT_SCORE = 1;

/** Similitud mínima (coeficiente de Dice sobre bigramas) para tolerar erratas. */
const MIN_TYPO_SIMILARITY = 0.8;
/** Longitud mínima para aplicar la tolerancia a erratas. */
const MIN_FUZZY_LENGTH = 4;
/** Longitud mínima para recortar plurales («es» / «s»). */
const MIN_STEM_LENGTH = 4;
const PLURAL_ES = "es";
const PLURAL_S = "s";
const NUMERIC_TOKEN = /^\d+$/;
const COMBINING_MARKS = /\p{M}/gu;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/** Minúsculas, sin tildes, puntuación como espacio y espacios colapsados. */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(NON_ALPHANUMERIC, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stem(token: string): string {
  if (token.length <= MIN_STEM_LENGTH - 1 || NUMERIC_TOKEN.test(token)) {
    return token;
  }
  if (token.endsWith(PLURAL_ES)) {
    return token.slice(0, -PLURAL_ES.length);
  }
  if (token.endsWith(PLURAL_S)) {
    return token.slice(0, -PLURAL_S.length);
  }
  return token;
}

/** Tokens normalizados, sin palabras vacías, con números en cifras y sin plurales. */
function tokenize(text: string): string[] {
  const normalized = normalizeSearchText(text);
  if (normalized === "") {
    return [];
  }
  const tokens: string[] = [];
  for (const raw of normalized.split(" ")) {
    const numeric = NUMBER_WORDS[raw];
    // «un/una/uno» son palabras vacías: solo cuentan como número si no se filtran antes.
    if (SEARCH_STOPWORDS.has(raw)) {
      continue;
    }
    tokens.push(numeric ?? stem(raw));
  }
  return tokens;
}

function bigrams(token: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < token.length - 1; i++) {
    const pair = token.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

function diceCoefficient(a: string, b: string): number {
  const first = bigrams(a);
  const second = bigrams(b);
  let common = 0;
  let total = 0;
  for (const count of first.values()) {
    total += count;
  }
  for (const count of second.values()) {
    total += count;
  }
  for (const [pair, count] of first) {
    common += Math.min(count, second.get(pair) ?? 0);
  }
  return total === 0 ? 0 : (2 * common) / total;
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  if (
    a.length < MIN_FUZZY_LENGTH ||
    b.length < MIN_FUZZY_LENGTH ||
    NUMERIC_TOKEN.test(a) ||
    NUMERIC_TOKEN.test(b)
  ) {
    return false;
  }
  return diceCoefficient(a, b) >= MIN_TYPO_SIMILARITY;
}

function isCovered(token: string, queryTokens: readonly string[]): boolean {
  return queryTokens.some((queryToken) => tokensMatch(token, queryToken));
}

/** Tokens de `target` presentes en la consulta. */
function coveredTokens(target: readonly string[], queryTokens: readonly string[]): string[] {
  return target.filter((token) => isCovered(token, queryTokens));
}

function coverage(target: readonly string[], queryTokens: readonly string[]): number {
  return target.length === 0 ? 0 : coveredTokens(target, queryTokens).length / target.length;
}

function hasWordMatch(tokens: readonly string[]): boolean {
  return tokens.some((token) => !NUMERIC_TOKEN.test(token));
}

/** Variante cuyo nombre completo aparece en la consulta; la más específica gana, el empate no elige. */
function detectVariant(item: SearchableItem, queryTokens: readonly string[]): number | null {
  if (item.variants.length === 1) {
    return item.variants[0]?.id ?? null;
  }
  let bestId: number | null = null;
  let bestSize = 0;
  let tied = false;
  for (const variant of item.variants) {
    const tokens = tokenize(variant.name);
    if (tokens.length === 0 || coverage(tokens, queryTokens) < 1) {
      continue;
    }
    if (tokens.length > bestSize) {
      bestId = variant.id;
      bestSize = tokens.length;
      tied = false;
    } else if (tokens.length === bestSize) {
      tied = true;
    }
  }
  return tied ? null : bestId;
}

/**
 * Extras nombrados en la consulta. Los tokens que comparten varios extras del producto
 * (un prefijo genérico del propio local) no son imprescindibles para identificar uno.
 */
function detectExtras(item: SearchableItem, queryTokens: readonly string[]): number[] {
  const extraTokens = item.extras.map((extra) => ({ id: extra.id, tokens: tokenize(extra.name) }));
  const frequency = new Map<string, number>();
  for (const extra of extraTokens) {
    for (const token of new Set(extra.tokens)) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  const selected = extraTokens.filter((extra) => {
    if (extra.tokens.length === 0) {
      return false;
    }
    const distinctive = extra.tokens.filter((token) => (frequency.get(token) ?? 0) < 2);
    const required = distinctive.length > 0 ? distinctive : extra.tokens;
    return coverage(required, queryTokens) === 1;
  });
  // Si un extra está contenido en otro también elegido («queso» y «queso cheddar»), gana el más específico.
  return selected
    .filter(
      (extra) =>
        !selected.some(
          (other) =>
            other.id !== extra.id &&
            other.tokens.length > extra.tokens.length &&
            extra.tokens.every((token) => other.tokens.includes(token)),
        ),
    )
    .map((extra) => extra.id);
}

function scoreItem(
  item: SearchableItem,
  query: string,
  queryTokens: readonly string[],
): MenuMatch | null {
  const nameTokens = tokenize(item.name);
  const categoryTokens = tokenize(item.category);
  const nameMatched = coveredTokens(nameTokens, queryTokens);
  const categoryMatched = coveredTokens(categoryTokens, queryTokens);
  // Un producto solo entra si coincide con su nombre o su categoría (palabras, no solo cifras).
  if (!hasWordMatch(nameMatched) && !hasWordMatch(categoryMatched)) {
    return null;
  }

  const variantId = detectVariant(item, queryTokens);
  const hasNamedVariant = variantId !== null && item.variants.length > 1;
  const raw =
    WEIGHT.name * coverage(nameTokens, queryTokens) +
    WEIGHT.category * coverage(categoryTokens, queryTokens) +
    WEIGHT.description * coverage(tokenize(item.description ?? ""), queryTokens) +
    (hasNamedVariant ? WEIGHT.variant : 0);

  const isExact =
    nameTokens.length > 0 && normalizeSearchText(query) === normalizeSearchText(item.name);
  const score = isExact ? EXACT_SCORE : Math.min(raw, MAX_NON_EXACT_SCORE);
  if (score <= 0) {
    return null;
  }
  return { itemId: item.id, score, variantId, extraIds: detectExtras(item, queryTokens) };
}

/**
 * Busca en la carta los productos que mejor encajan con el texto del cliente.
 * Devuelve como máximo `limit` coincidencias con puntuación > 0, de mayor a menor
 * (a igualdad, respeta el orden original de la carta).
 */
export function searchMenu(
  query: string,
  items: readonly SearchableItem[],
  limit: number = DEFAULT_SEARCH_LIMIT,
): MenuMatch[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || limit <= 0) {
    return [];
  }
  const scored: { match: MenuMatch; index: number }[] = [];
  items.forEach((item, index) => {
    const match = scoreItem(item, query, queryTokens);
    if (match) {
      scored.push({ match, index });
    }
  });
  scored.sort((a, b) => b.match.score - a.match.score || a.index - b.index);
  return scored.slice(0, limit).map(({ match }) => match);
}
