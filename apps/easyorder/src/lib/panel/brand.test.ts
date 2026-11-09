import { describe, expect, it } from "vitest";
import { checkLogoFile, freeNetworks, logoError, rowsFrom, socialPayload } from "./brand";

describe("marca del restaurante (pieza Z)", () => {
  it("ofrece solo las redes que faltan", () => {
    const free = freeNetworks([{ red: "instagram", url: "https://instagram.com/a" }]);
    expect(free).not.toContain("instagram");
    expect(free).toContain("facebook");
  });

  it("ignora las filas vacías y normaliza el resto", () => {
    const result = socialPayload([
      { red: "instagram", url: " instagram.com/laisla " },
      { red: "facebook", url: "" },
    ]);
    expect(result).toEqual({
      ok: true,
      links: [{ red: "instagram", url: "https://instagram.com/laisla" }],
    });
  });

  it("explica qué red falla", () => {
    const bad = socialPayload([{ red: "tiktok", url: "no es un enlace" }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain("TikTok");
    const twice = socialPayload([
      { red: "web", url: "https://a.com" },
      { red: "web", url: "https://b.com" },
    ]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.message).toContain("ya la añadiste");
  });

  it("convierte lo guardado en filas", () => {
    expect(rowsFrom(undefined)).toEqual([]);
    expect(rowsFrom([{ red: "web", url: "https://a.com/" }])).toEqual([
      { red: "web", url: "https://a.com/" },
    ]);
  });

  it("revisa el logo antes de subirlo", () => {
    expect(checkLogoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkLogoFile({ type: "image/svg+xml", size: 1000 })).toContain("PNG");
    expect(checkLogoFile({ type: "image/png", size: 3 * 1024 * 1024 })).toContain("2 MB");
    expect(logoError(503)).toContain("no está activada");
  });
});
