import type { HelpSlug } from "./slugs";

/**
 * Captura de pantalla de la ayuda. `file` es el nombre sin extensión: las imágenes salen de
 * `scripts/capturas-ayuda.cjs` y viven en `public/ayuda/<file>-escritorio.png` y
 * `public/ayuda/<file>-movil.png`.
 */
export type HelpShot = {
  readonly file: string;
  readonly alt: string;
  readonly caption?: string;
};

export type HelpStep = {
  readonly text: string;
  /** Consejo o aviso corto debajo del paso. */
  readonly tip?: string;
  readonly shot?: HelpShot;
};

export type HelpFaq = {
  readonly question: string;
  readonly answer: string;
};

export const HELP_GROUP = {
  Start: "empezar",
  Daily: "dia-a-dia",
  Business: "negocio",
  Customers: "clientes",
} as const;

export type HelpGroup = (typeof HELP_GROUP)[keyof typeof HELP_GROUP];

export const HELP_GROUP_TITLE: Readonly<Record<HelpGroup, string>> = {
  [HELP_GROUP.Start]: "Para empezar",
  [HELP_GROUP.Daily]: "El día a día",
  [HELP_GROUP.Business]: "Tu negocio",
  [HELP_GROUP.Customers]: "Tus clientes y los cobros",
};

/** Orden en que se enseñan los grupos en el índice. */
export const HELP_GROUP_ORDER: readonly HelpGroup[] = [
  HELP_GROUP.Start,
  HELP_GROUP.Daily,
  HELP_GROUP.Business,
  HELP_GROUP.Customers,
];

export type HelpPage = {
  readonly slug: HelpSlug;
  readonly title: string;
  /** Una frase para el índice y para los buscadores. */
  readonly summary: string;
  readonly group: HelpGroup;
  /** Palabras que usa la gente y que el buscador debe entender aunque no estén en el texto. */
  readonly keywords: readonly string[];
  /** Para qué sirve (uno o dos párrafos cortos). */
  readonly purpose: readonly string[];
  readonly steps: readonly HelpStep[];
  readonly faq: readonly HelpFaq[];
  readonly related: readonly HelpSlug[];
};
