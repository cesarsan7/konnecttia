import type { HelpPage } from "./types";

/** Longitud mínima de una palabra de la búsqueda: las de una letra solo meten ruido. */
const MIN_TOKEN_LENGTH = 2;

/** Peso de cada parte de la página: lo que más pesa es lo que mejor identifica la página. */
const WEIGHT = {
  title: 10,
  keywords: 6,
  summary: 4,
  faqQuestion: 3,
  purpose: 2,
  steps: 1,
  faqAnswer: 1,
} as const;

/** Minúsculas y sin tildes, para que «cobrar», «Cobrár» y «COBRAR» sean lo mismo. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length >= MIN_TOKEN_LENGTH);
}

/** Lo que el buscador necesita de una página. */
export type Searchable = Pick<
  HelpPage,
  "title" | "summary" | "keywords" | "purpose" | "steps" | "faq"
>;

type Field = { readonly text: string; readonly weight: number };

function fieldsOf(page: Searchable): Field[] {
  return [
    { text: normalize(page.title), weight: WEIGHT.title },
    { text: normalize(page.keywords.join(" ")), weight: WEIGHT.keywords },
    { text: normalize(page.summary), weight: WEIGHT.summary },
    {
      text: normalize(page.faq.map((item) => item.question).join(" ")),
      weight: WEIGHT.faqQuestion,
    },
    { text: normalize(page.purpose.join(" ")), weight: WEIGHT.purpose },
    {
      text: normalize(page.steps.map((step) => `${step.text} ${step.tip ?? ""}`).join(" ")),
      weight: WEIGHT.steps,
    },
    { text: normalize(page.faq.map((item) => item.answer).join(" ")), weight: WEIGHT.faqAnswer },
  ];
}

/** Puntos de la página para una palabra; 0 si no aparece en ningún sitio. */
function scoreToken(fields: readonly Field[], token: string): number {
  let score = 0;
  for (const field of fields) {
    if (field.text.includes(token)) score += field.weight;
  }
  return score;
}

/**
 * Busca en las páginas de la ayuda. Una página sale solo si contiene TODAS las palabras de la
 * búsqueda (en cualquier parte), y se ordena por la suma de pesos. Sin palabras útiles devuelve
 * todas las páginas en su orden.
 */
export function searchHelp<T extends Searchable>(pages: readonly T[], query: string): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [...pages];

  const scored: { page: T; score: number; order: number }[] = [];
  pages.forEach((page, order) => {
    const fields = fieldsOf(page);
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(fields, token);
      if (score === 0) return;
      total += score;
    }
    scored.push({ page, score: total, order });
  });

  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map((item) => item.page);
}
