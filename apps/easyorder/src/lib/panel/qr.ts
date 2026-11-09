import qrcode from "qrcode-generator";

/** Enlaces del restaurante que se comparten con un QR (pieza Y). */
export type QrLink = {
  readonly id: "carta" | "panel";
  readonly label: string;
  readonly hint: string;
  readonly url: string;
};

/** Tamaños de descarga del PNG (píxeles de lado). */
export const QR_SIZES = [512, 1024, 2048] as const;
export type QrSize = (typeof QR_SIZES)[number];

/** Zona en blanco alrededor, en módulos (el estándar pide 4 para que lo lean todos los móviles). */
export const QR_MARGIN = 4;

export type QrStyle = {
  readonly fg: string;
  readonly bg: string;
};

export const QR_DEFAULT_STYLE: QrStyle = { fg: "#111111", bg: "#ffffff" };

/** Los dos enlaces que tiene un restaurante: su carta pública y la entrada al panel. */
export function qrLinks(origin: string, slug: string): readonly QrLink[] {
  const base = origin.replace(/\/+$/, "");
  return [
    {
      id: "carta",
      label: "Carta pública",
      hint: "Para redes sociales, mesas, bolsas y el escaparate: tus clientes piden desde aquí.",
      url: `${base}/${encodeURIComponent(slug)}`,
    },
    {
      id: "panel",
      label: "Panel del equipo",
      hint: "Entrada al panel para tu equipo (hay que iniciar sesión).",
      url: `${base}/panel`,
    },
  ];
}

/** Matriz de módulos del QR (true = oscuro). Corrección de errores «Q»: aguanta un logo pequeño. */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, "Q");
  code.addData(text);
  code.make();
  const count = code.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => code.isDark(row, col)),
  );
}

/** Color CSS `#rgb` o `#rrggbb`; cualquier otra cosa no se pinta (evita inyectar en el SVG). */
export function safeColor(value: string, fallback: string): string {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : fallback;
}

/**
 * SVG del QR: un solo trazo con todos los módulos oscuros sobre un fondo. Escala sin perder
 * nitidez, por eso es el formato bueno para imprimir.
 */
export function qrSvg(text: string, style: QrStyle = QR_DEFAULT_STYLE, size = 512): string {
  const matrix = qrMatrix(text);
  const total = matrix.length + QR_MARGIN * 2;
  const fg = safeColor(style.fg, QR_DEFAULT_STYLE.fg);
  const bg = safeColor(style.bg, QR_DEFAULT_STYLE.bg);
  let path = "";
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) path += `M${x + QR_MARGIN} ${y + QR_MARGIN}h1v1h-1z`;
    });
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${bg}"/>` +
    `<path d="${path}" fill="${fg}"/></svg>`
  );
}

/** Nombre del archivo descargado: `qr-<slug>-<enlace>-<tamaño>.<ext>`. */
export function qrFileName(slug: string, id: string, ext: "png" | "svg", size?: number): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "restaurante";
  return `qr-${safe}-${id}${size ? `-${size}` : ""}.${ext}`;
}

/** Dibuja el QR en un canvas (PNG). Solo en el navegador. */
export function drawQr(
  canvas: HTMLCanvasElement,
  text: string,
  size: number,
  style: QrStyle = QR_DEFAULT_STYLE,
): void {
  const matrix = qrMatrix(text);
  const total = matrix.length + QR_MARGIN * 2;
  // Módulo entero en píxeles: bordes nítidos; el resto se reparte como margen extra.
  const cell = Math.max(1, Math.floor(size / total));
  const side = cell * total;
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no permite dibujar el QR");
  context.fillStyle = safeColor(style.bg, QR_DEFAULT_STYLE.bg);
  context.fillRect(0, 0, side, side);
  context.fillStyle = safeColor(style.fg, QR_DEFAULT_STYLE.fg);
  matrix.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) context.fillRect((x + QR_MARGIN) * cell, (y + QR_MARGIN) * cell, cell, cell);
    });
  });
}
