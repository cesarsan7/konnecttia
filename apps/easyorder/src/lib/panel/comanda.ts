import { orderLines, orderNotes, paymentLabel } from "./orders";
import type { PanelOrder } from "./types";

/** Ancho del papel de la impresora de tickets (térmica). Se elige en cada navegador. */
export type PaperWidth = 58 | 80;

export type ComandaOptions = {
  readonly restaurante: string;
  readonly timeZone: string;
  readonly paper: PaperWidth;
  /** «cocina»: sin precios, letra grande. «cliente»: con precios y total. */
  readonly copia: "cocina" | "cliente";
};

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (value: number | string | null | undefined) =>
  `${Number(value ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function fulfillmentLine(order: PanelOrder): string {
  if (order.tipo_despacho === "delivery") return "REPARTO";
  if (order.tipo_despacho === "mesa") return (order.mesa_nombre ?? "MESA").toUpperCase();
  return "RECOGIDA";
}

/**
 * HTML de la comanda para imprimir en una impresora de tickets (58 u 80 mm) o en papel normal.
 * Todo el texto del pedido se escapa: puede venir de la web o de WhatsApp.
 */
export function comandaHtml(order: PanelOrder, options: ComandaOptions): string {
  const kitchen = options.copia === "cocina";
  const lines = orderLines(order.items);
  const notes = orderNotes(order.notas);
  const created = new Date(order.created_at);
  const date = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: options.timeZone,
  }).format(created);
  const width = options.paper === 58 ? 48 : 72;
  const pending = order.estado_pago === "pendiente";
  const delivery = order.tipo_despacho === "delivery";

  const items = lines
    .map(
      (line) => `
      <div class="line">
        <div class="row"><span class="qty">${line.quantity}×</span><span class="name">${esc(line.name)}${
          line.variant ? ` <span class="variant">(${esc(line.variant)})</span>` : ""
        }</span></div>
        ${line.extras.length > 0 ? `<div class="extra">+ ${line.extras.map(esc).join(", ")}</div>` : ""}
        ${line.note ? `<div class="note">» ${esc(line.note)}</div>` : ""}
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Comanda ${esc(order.pedido_codigo ?? order.id)}</title>
<style>
  @page { size: ${options.paper}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: ${width}mm; margin: 0 auto; padding: 3mm 2mm; font: ${kitchen ? "11pt" : "9.5pt"}/1.3 ui-monospace, "Courier New", monospace; color: #000; background: #fff; }
  .center { text-align: center; }
  .shop { font-weight: 700; font-size: 1em; }
  .code { font-size: 1.9em; font-weight: 800; letter-spacing: .02em; margin: 1mm 0; }
  .type { font-size: 1.25em; font-weight: 800; border: 1.5pt solid #000; padding: .5mm 2mm; display: inline-block; }
  .sep { border: 0; border-top: 1pt dashed #000; margin: 2mm 0; }
  .row { display: flex; gap: 2mm; justify-content: space-between; }
  .qty { font-weight: 800; min-width: 7mm; }
  .name { flex: 1; font-weight: 700; word-break: break-word; }
  .variant { font-weight: 400; }
  .line { margin: 1.2mm 0; }
  .extra, .note { padding-left: 9mm; font-size: .92em; }
  .note { font-weight: 700; }
  .box { border: 1pt solid #000; padding: 1mm 2mm; margin: 2mm 0; font-weight: 700; }
  .small { font-size: .85em; }
  .total { font-size: 1.2em; font-weight: 800; }
  .warn { font-weight: 800; text-align: center; border: 1.5pt solid #000; padding: 1mm; margin-top: 2mm; }
</style></head>
<body>
  <div class="center shop">${esc(options.restaurante)}${order.local_nombre ? ` · ${esc(order.local_nombre)}` : ""}</div>
  <div class="center code">${esc(order.pedido_codigo ?? `#${order.id}`)}</div>
  <div class="center"><span class="type">${esc(fulfillmentLine(order))}</span></div>
  <div class="center small">${esc(date)}${order.tiempo_estimado ? ` · ${esc(order.tiempo_estimado)}` : ""}</div>
  <hr class="sep">
  <div class="row"><strong>${esc(order.nombre_pedido ?? "Cliente")}</strong><span>${esc(order.telefono)}</span></div>
  ${order.mesero_nombre ? `<div class="small">Atiende: ${esc(order.mesero_nombre)}</div>` : ""}
  ${delivery && order.direccion ? `<div>${esc(order.direccion)}</div>` : ""}
  ${delivery && order.repartidor_email ? `<div class="small">Reparte: ${esc(order.repartidor_email)}</div>` : ""}
  <hr class="sep">
  ${items || '<div class="center small">(sin detalle de productos)</div>'}
  ${notes.length > 0 ? `<div class="box">NOTA: ${notes.map(esc).join(" · ")}</div>` : ""}
  <hr class="sep">
  ${
    kitchen
      ? `<div class="small">${esc(paymentLabel(order.metodo_pago))}</div>`
      : `${Number(order.costo_envio) > 0 ? `<div class="row"><span>Envío</span><span>${money(order.costo_envio)}</span></div>` : ""}
  <div class="row total"><span>TOTAL</span><span>${money(order.total)}</span></div>
  <div class="small">${esc(paymentLabel(order.metodo_pago))}</div>`
  }
  ${pending ? '<div class="warn">PENDIENTE DE COBRO</div>' : ""}
</body></html>`;
}

/**
 * Imprime en un iframe oculto: no abre ventanas (los bloqueadores no lo impiden) y el panel
 * sigue en pantalla. Para imprimir sin el cuadro de diálogo, abrir Chrome con --kiosk-printing.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.right = "0";
  frame.style.bottom = "0";
  document.body.appendChild(frame);
  const remove = () => setTimeout(() => frame.remove(), 1000);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.addEventListener("afterprint", remove);
  // Da tiempo a que el documento se pinte antes de abrir el diálogo.
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(remove, 60_000);
  }, 50);
}

/** Preferencias de impresión de este navegador (cada local tiene su impresora). */
export type PrintSettings = {
  readonly paper: PaperWidth;
  readonly copia: "cocina" | "cliente";
  /** Imprimir solo los pedidos nuevos al llegar. */
  readonly alLlegar: boolean;
  /** Imprimir al pulsar «Aceptar pedido». */
  readonly alAceptar: boolean;
};

export const DEFAULT_PRINT: PrintSettings = {
  paper: 80,
  copia: "cocina",
  alLlegar: false,
  alAceptar: false,
};

const KEY = "easyorder.panel.comanda";

export function readPrintSettings(): PrintSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PrintSettings> | null;
    if (!raw) return DEFAULT_PRINT;
    return {
      paper: raw.paper === 58 ? 58 : 80,
      copia: raw.copia === "cliente" ? "cliente" : "cocina",
      alLlegar: raw.alLlegar === true,
      alAceptar: raw.alAceptar === true,
    };
  } catch {
    return DEFAULT_PRINT;
  }
}

export function savePrintSettings(settings: PrintSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Sin almacenamiento: dura esta visita.
  }
}
