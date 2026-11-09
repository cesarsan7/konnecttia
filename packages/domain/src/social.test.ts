import { describe, expect, it } from "vitest";
import { normalizeSocialUrl, parseSocialLinks, readSocialLinks } from "./social";

describe("normalizeSocialUrl", () => {
  it("añade https, sube http y deja la ruta", () => {
    expect(normalizeSocialUrl("instagram", "instagram.com/laisla")).toBe(
      "https://instagram.com/laisla",
    );
    expect(normalizeSocialUrl("web", "http://laisla.es")).toBe("https://laisla.es/");
  });

  it("rechaza esquemas peligrosos, usuarios, dominios sin punto y textos vacíos", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hola",
      "https://user:pass@x.com",
      "https://localhost",
      "https://.com",
      "",
      "   ",
      `https://x.com/${"a".repeat(300)}`,
    ]) {
      expect(normalizeSocialUrl("web", bad)).toBeNull();
    }
  });

  it("WhatsApp admite un teléfono y lo convierte en wa.me", () => {
    expect(normalizeSocialUrl("whatsapp", "+34 600 000 000")).toBe("https://wa.me/34600000000");
    expect(normalizeSocialUrl("whatsapp", "123")).toBeNull();
    expect(normalizeSocialUrl("web", "+34600000000")).toBeNull();
  });
});

describe("parseSocialLinks", () => {
  it("devuelve la lista normalizada", () => {
    expect(
      parseSocialLinks([
        { red: "instagram", url: "instagram.com/laisla" },
        { red: "whatsapp", url: "600 000 000" },
      ]),
    ).toEqual({
      ok: true,
      links: [
        { red: "instagram", url: "https://instagram.com/laisla" },
        { red: "whatsapp", url: "https://wa.me/600000000" },
      ],
    });
  });

  it("señala la fila con el problema", () => {
    expect(parseSocialLinks([{ red: "myspace", url: "https://x.com" }])).toEqual({
      ok: false,
      error: "unknown_network",
      index: 0,
    });
    expect(
      parseSocialLinks([
        { red: "web", url: "https://a.com" },
        { red: "web", url: "https://b.com" },
      ]),
    ).toEqual({ ok: false, error: "duplicate_network", index: 1 });
    expect(parseSocialLinks([{ red: "web", url: "no es url" }])).toEqual({
      ok: false,
      error: "invalid_url",
      index: 0,
    });
  });
});

describe("readSocialLinks", () => {
  it("ignora lo que no tiene la forma esperada", () => {
    expect(
      readSocialLinks([
        { red: "instagram", url: "https://instagram.com/a" },
        { red: "instagram", url: "https://instagram.com/b" },
        { red: "twitter", url: "javascript:1" },
        { red: 5, url: "x" },
        null,
        "texto",
      ]),
    ).toEqual([{ red: "instagram", url: "https://instagram.com/a" }]);
    expect(readSocialLinks(null)).toEqual([]);
    expect(readSocialLinks({ a: 1 })).toEqual([]);
  });
});
