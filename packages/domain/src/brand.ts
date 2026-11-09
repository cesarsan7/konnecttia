/**
 * Color de marca del restaurante (pieza AA): `restaurante.brand_color`. La carta pública y el
 * seguimiento lo usan como color de acento (botones, bordes y selección); el panel mantiene los
 * colores de EasyOrder. Aquí está lo que decide si un color se lee bien.
 */

/**
 * Valor que la columna traía por defecto en la versión anterior (rojo). Muchos restaurantes lo
 * tienen sin haberlo elegido, así que cuenta como «sin color propio»: la carta sigue con el
 * acento de EasyOrder y nada cambia hasta que alguien elige otro color en Ajustes.
 */
export const LEGACY_BRAND_COLOR = "#e63946";

/** Acento con el que se ve la carta sin color propio (el de `globals.css`). */
export const DEFAULT_ACCENT = "#e8553a";

const INK_LIGHT = "#ffffff";
const INK_DARK = "#000000";

/** Contraste mínimo del texto sobre el color (WCAG AA) y de bordes e iconos contra el fondo. */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_EDGE_CONTRAST = 3;

/** `#rgb` o `#rrggbb` (con o sin `#`) → `#rrggbb` en minúsculas; `null` si no es un color. */
export function normalizeHex(value: string | null | undefined): string | null {
  const text = (value ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(text)) {
    return `#${text
      .split("")
      .map((char) => char + char)
      .join("")
      .toLowerCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toLowerCase()}` : null;
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (WCAG 2.x) de un `#rrggbb`. */
export function luminance(hex: string): number {
  const color = normalizeHex(hex);
  if (!color) return 0;
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** Razón de contraste (1 a 21) entre dos colores. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Color del texto sobre el color de marca: blanco o negro, el que más contraste dé. */
export function readableInk(color: string): string {
  return contrastRatio(color, INK_LIGHT) >= contrastRatio(color, INK_DARK) ? INK_LIGHT : INK_DARK;
}

export const BRAND_WARNING = { LowEdgeContrast: "low_edge_contrast" } as const;

export type BrandWarning = (typeof BRAND_WARNING)[keyof typeof BRAND_WARNING];

export type BrandReport = {
  readonly color: string;
  /** Texto sobre el color (el que se usará en los botones). */
  readonly ink: string;
  readonly inkContrast: number;
  /** Contraste del color contra el fondo blanco de la carta (bordes, selección, enfoque). */
  readonly edgeContrast: number;
  readonly warnings: readonly BrandWarning[];
};

/**
 * Informe de un color elegido. El texto siempre se lee (se elige blanco o negro según el color:
 * el mejor de los dos nunca baja de 4,5). Lo que puede fallar es el color como borde o enfoque
 * sobre el fondo claro: un amarillo muy pálido apenas se vería, y se avisa.
 */
export function brandReport(value: string): BrandReport | null {
  const color = normalizeHex(value);
  if (!color) return null;
  const ink = readableInk(color);
  const edgeContrast = contrastRatio(color, "#ffffff");
  return {
    color,
    ink,
    inkContrast: contrastRatio(color, ink),
    edgeContrast,
    warnings: edgeContrast < MIN_EDGE_CONTRAST ? [BRAND_WARNING.LowEdgeContrast] : [],
  };
}

/** Color propio efectivo: el guardado si es válido y no es el valor por defecto antiguo. */
export function effectiveBrandColor(stored: string | null | undefined): string | null {
  const color = normalizeHex(stored);
  return color && color !== LEGACY_BRAND_COLOR ? color : null;
}
