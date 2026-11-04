import { describe, expect, it } from "vitest";
import { ROUTE, sectionHref } from "./links";

describe("sectionHref", () => {
  it("usa un ancla local en la portada", () => {
    expect(sectionHref("contacto", true)).toBe("#contacto");
  });

  it("vuelve a la portada desde otras páginas", () => {
    expect(sectionHref("contacto", false)).toBe("/#contacto");
  });
});

describe("ROUTE", () => {
  it("el acceso al panel pasa siempre por /acceder", () => {
    expect(ROUTE.PanelAccess).toBe("/acceder");
  });
});
