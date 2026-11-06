import { describe, expect, it } from "vitest";
import { ROUTE, sectionHref, signupUrl } from "./links";

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

describe("signupUrl", () => {
  it("apunta a /alta en el dominio del panel, venga o no con ruta", () => {
    expect(signupUrl("https://app.konnecttia.test/panel")).toBe("https://app.konnecttia.test/alta");
    expect(signupUrl("https://app.konnecttia.test/")).toBe("https://app.konnecttia.test/alta");
    expect(signupUrl(" https://app.konnecttia.test ")).toBe("https://app.konnecttia.test/alta");
  });

  it("sin variable o con un valor roto no hay enlace (el botón se oculta)", () => {
    expect(signupUrl(undefined)).toBeNull();
    expect(signupUrl("")).toBeNull();
    expect(signupUrl("   ")).toBeNull();
    expect(signupUrl("no es una url")).toBeNull();
  });

  it("el botón pasa siempre por /prueba-gratis", () => {
    expect(ROUTE.FreeTrial).toBe("/prueba-gratis");
  });
});
