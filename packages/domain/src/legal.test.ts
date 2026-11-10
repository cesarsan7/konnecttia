import { describe, expect, it } from "vitest";
import {
  isDraftVersion,
  isLegalDocument,
  LEGAL_DOCUMENT,
  LEGAL_VERSION,
  SIGNUP_LEGAL_DOCUMENTS,
} from "./legal";

describe("documentos legales", () => {
  it("cada documento tiene versión y el alta exige términos y encargado", () => {
    for (const code of Object.values(LEGAL_DOCUMENT)) expect(LEGAL_VERSION[code]).toBeTruthy();
    expect(SIGNUP_LEGAL_DOCUMENTS).toEqual([LEGAL_DOCUMENT.Terms, LEGAL_DOCUMENT.Processor]);
  });

  it("reconoce documentos y borradores", () => {
    expect(isLegalDocument("terminos")).toBe(true);
    expect(isLegalDocument("otro")).toBe(false);
    expect(isDraftVersion("2026-11-borrador")).toBe(true);
    expect(isDraftVersion("2027-01")).toBe(false);
  });
});
