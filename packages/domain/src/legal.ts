/**
 * Documentos legales que acepta un restaurante al darse de alta. La versión identifica el texto
 * vigente: al cambiar un texto se sube su versión y se guarda qué versión aceptó cada persona.
 * Mientras un texto sea borrador (sin revisión legal) su versión termina en «-borrador».
 */
export const LEGAL_DOCUMENT = {
  Terms: "terminos",
  Processor: "encargado",
  Cookies: "cookies",
} as const;

export type LegalDocument = (typeof LEGAL_DOCUMENT)[keyof typeof LEGAL_DOCUMENT];

export const LEGAL_VERSION: Readonly<Record<LegalDocument, string>> = {
  [LEGAL_DOCUMENT.Terms]: "2026-11-borrador",
  [LEGAL_DOCUMENT.Processor]: "2026-11-borrador",
  [LEGAL_DOCUMENT.Cookies]: "2026-11-borrador",
};

/** Lo que hay que aceptar para crear un restaurante (las cookies solo se informan). */
export const SIGNUP_LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  LEGAL_DOCUMENT.Terms,
  LEGAL_DOCUMENT.Processor,
];

export const isLegalDocument = (value: string): value is LegalDocument =>
  (Object.values(LEGAL_DOCUMENT) as string[]).includes(value);

/** Un texto es borrador mientras su versión lo diga: se avisa en la página. */
export const isDraftVersion = (version: string): boolean => version.endsWith("-borrador");
