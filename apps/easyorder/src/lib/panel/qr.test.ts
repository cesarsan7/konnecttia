import { describe, expect, it } from "vitest";
import { qrFileName, qrLinks, qrMatrix, qrSvg, safeColor } from "./qr";

describe("QR de enlaces (pieza Y)", () => {
  it("arma la carta y el panel con el origen sin barra final", () => {
    const links = qrLinks("https://pedidos.example.com/", "la-isla");
    expect(links.map((link) => link.url)).toEqual([
      "https://pedidos.example.com/la-isla",
      "https://pedidos.example.com/panel",
    ]);
  });

  it("genera una matriz cuadrada con los tres localizadores en las esquinas", () => {
    const matrix = qrMatrix("https://pedidos.example.com/la-isla");
    const n = matrix.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === n)).toBe(true);
    // Esquina superior izquierda de un localizador: módulo oscuro; esquina de su anillo claro: no.
    expect(matrix[0]?.[0]).toBe(true);
    expect(matrix[0]?.[n - 1]).toBe(true);
    expect(matrix[n - 1]?.[0]).toBe(true);
    expect(matrix[1]?.[1]).toBe(false);
  });

  it("el SVG lleva fondo, trazo y el tamaño pedido, y rechaza colores raros", () => {
    const svg = qrSvg("https://x.test/a", { fg: "#0a5", bg: "red;<script>" }, 300);
    expect(svg).toContain('width="300"');
    expect(svg).toContain('fill="#0a5"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain("script");
  });

  it("el mismo texto da siempre el mismo QR", () => {
    expect(qrSvg("https://x.test/a")).toBe(qrSvg("https://x.test/a"));
    expect(qrSvg("https://x.test/a")).not.toBe(qrSvg("https://x.test/b"));
  });

  it("acepta #rgb y #rrggbb y nada más", () => {
    expect(safeColor("#abc", "#000000")).toBe("#abc");
    expect(safeColor("#aabbcc", "#000000")).toBe("#aabbcc");
    expect(safeColor("javascript:1", "#000000")).toBe("#000000");
  });

  it("nombra el archivo sin caracteres raros", () => {
    expect(qrFileName("La-Isla", "carta", "png", 1024)).toBe("qr-la-isla-carta-1024.png");
    expect(qrFileName("../x", "panel", "svg")).toBe("qr-x-panel.svg");
  });
});
