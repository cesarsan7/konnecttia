import { describe, expect, it } from "vitest";
import { publicLogo, publicSocialLinks } from "./brand";

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
});
