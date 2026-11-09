import { describe, expect, it } from "vitest";
import { brandStyle, publicLogo, publicSocialLinks } from "./brand";

describe("marca en la carta pública", () => {
  it("solo deja pasar redes con una URL https válida y acorta Google", () => {
    expect(
      publicSocialLinks([
        { red: "instagram", url: "https://instagram.com/laisla" },
        { red: "google", url: "https://g.page/laisla" },
        { red: "web", url: "javascript:alert(1)" },
        { red: "inventada", url: "https://x.com" },
      ]),
    ).toEqual([
      { red: "instagram", label: "Instagram", url: "https://instagram.com/laisla" },
      { red: "google", label: "Google", url: "https://g.page/laisla" },
    ]);
    expect(publicSocialLinks(undefined)).toEqual([]);
  });

  it("el logo debe ser https", () => {
    expect(publicLogo("https://cdn.test/logo.png")).toBe("https://cdn.test/logo.png");
    expect(publicLogo("http://cdn.test/logo.png")).toBeNull();
    expect(publicLogo("javascript:alert(1)")).toBeNull();
    expect(publicLogo(null)).toBeNull();
  });

  it("el color de marca cambia el acento y el texto de los botones", () => {
    expect(brandStyle("#0e2a33")).toEqual({ "--accent": "#0e2a33", "--accent-ink": "#ffffff" });
    expect(brandStyle("#ffe600")).toEqual({ "--accent": "#ffe600", "--accent-ink": "#000000" });
  });

  it("sin color propio, o con uno inválido o el rojo antiguo, no se toca nada", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle("rojo")).toBeUndefined();
    expect(brandStyle("#E63946")).toBeUndefined();
  });
});
