import { escapeHtml } from "../mailer";

/** Cómo recibe el pedido el cliente (texto de los emails). */
export const ORDER_DELIVERY_KIND = {
  Pickup: "recogida",
  Delivery: "reparto",
  DineIn: "mesa",
} as const;
export type OrderDeliveryKind = (typeof ORDER_DELIVERY_KIND)[keyof typeof ORDER_DELIVERY_KIND];

/** Avisos al cliente: confirmación de la recepción y cambios importantes de estado. */
export const ORDER_NOTICE = {
  Received: "recibido",
  Accepted: "aceptado",
  Ready: "listo",
  OnTheWay: "en_camino",
  Cancelled: "cancelado",
} as const;
export type OrderNotice = (typeof ORDER_NOTICE)[keyof typeof ORDER_NOTICE];

const DELIVERY_LABEL: Record<OrderDeliveryKind, string> = {
  [ORDER_DELIVERY_KIND.Pickup]: "Recogida en el local",
  [ORDER_DELIVERY_KIND.Delivery]: "Reparto a domicilio",
  [ORDER_DELIVERY_KIND.DineIn]: "Consumo en el local",
};

const MONEY = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** Importe en céntimos enteros → «12,50 €». */
export const formatCents = (cents: number) => MONEY.format(cents / 100);

/** Una sola línea: quita saltos para que un dato del cliente no rompa el asunto del email. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

type Layout = {
  readonly restaurante: string;
  readonly title: string;
  readonly intro: string;
  readonly details: readonly (readonly [label: string, value: string])[];
  readonly action: { readonly label: string; readonly url: string } | null;
  readonly footer: string;
};

function renderHtml(layout: Layout): string {
  const rows = layout.details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:14px;color:#4e6168">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px;font-weight:700">${escapeHtml(value)}</td></tr>`,
    )
    .join("\n            ");
  const action = layout.action
    ? `<p style="margin:0 0 20px">
            <a href="${escapeHtml(layout.action.url)}" style="display:inline-block;background:#ff6a4d;color:#0e2a33;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">${escapeHtml(layout.action.label)}</a>
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#4e6168">
            Si el botón no funciona, copia esta dirección: <span style="word-break:break-all">${escapeHtml(layout.action.url)}</span>
          </p>`
    : "";
  return `<!doctype html>
<html lang="es">
<body style="margin:0;padding:0;background:#fbf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0e2a33">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
        <tr><td style="background:#0e2a33;padding:20px 28px;color:#fbf7f1;font-size:20px;font-weight:800">${escapeHtml(layout.restaurante)}</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(layout.title)}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4e6168">${escapeHtml(layout.intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
            ${rows}
          </table>
          ${action}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e6dccf;font-size:12px;color:#4e6168">
          ${escapeHtml(layout.footer)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function renderText(layout: Layout): string {
  return [
    layout.title,
    "",
    layout.intro,
    "",
    ...layout.details.map(([label, value]) => `${label}: ${value}`),
    ...(layout.action ? ["", `${layout.action.label}: ${layout.action.url}`] : []),
    "",
    layout.footer,
  ].join("\n");
}

export type NewOrderEmailInput = {
  readonly restaurante: string;
  readonly codigo: string;
  readonly delivery: OrderDeliveryKind;
  readonly totalCents: number;
  /** Nombre con el que se hizo el pedido, si lo hay. */
  readonly nombre: string | null;
  /** Enlace al panel del restaurante; sin él, el email no lleva botón. */
  readonly panelUrl: string | null;
};

/** Aviso al local: ha entrado un pedido nuevo (para cuando nadie mira el panel). */
export function newOrderEmail(input: NewOrderEmailInput) {
  const layout: Layout = {
    restaurante: oneLine(input.restaurante),
    title: `Nuevo pedido ${oneLine(input.codigo)}`,
    intro: "Ha entrado un pedido nuevo. Ábrelo en el panel para aceptarlo y prepararlo.",
    details: [
      ["Pedido", oneLine(input.codigo)],
      ...(input.nombre ? ([["Cliente", oneLine(input.nombre)]] as const) : []),
      ["Entrega", DELIVERY_LABEL[input.delivery]],
      ["Total", formatCents(input.totalCents)],
    ],
    action: input.panelUrl ? { label: "Abrir el panel", url: input.panelUrl } : null,
    footer: "Recibes este aviso porque tu local tiene activados los avisos de pedidos nuevos.",
  };
  return {
    subject: `Nuevo pedido ${oneLine(input.codigo)} · ${oneLine(input.restaurante)}`,
    html: renderHtml(layout),
    text: renderText(layout),
  };
}

export type OrderNoticeEmailInput = {
  readonly restaurante: string;
  readonly codigo: string;
  readonly notice: OrderNotice;
  readonly delivery: OrderDeliveryKind;
  readonly totalCents: number;
  readonly trackingUrl: string;
};

function noticeCopy(notice: OrderNotice, delivery: OrderDeliveryKind) {
  switch (notice) {
    case ORDER_NOTICE.Received:
      return {
        title: "Hemos recibido tu pedido",
        intro: "El local lo revisará enseguida. Te avisaremos cuando lo acepte.",
        subject: "Hemos recibido tu pedido",
      };
    case ORDER_NOTICE.Accepted:
      return {
        title: "Tu pedido ha sido aceptado",
        intro: "El local ya está con él.",
        subject: "Tu pedido ha sido aceptado",
      };
    case ORDER_NOTICE.Ready:
      return {
        title:
          delivery === ORDER_DELIVERY_KIND.Pickup
            ? "Tu pedido está listo para recoger"
            : "Tu pedido está listo",
        intro:
          delivery === ORDER_DELIVERY_KIND.Pickup
            ? "Ya puedes pasar a recogerlo."
            : "Está preparado y saldrá en breve.",
        subject: "Tu pedido está listo",
      };
    case ORDER_NOTICE.OnTheWay:
      return {
        title: "Tu pedido va en camino",
        intro: "El repartidor ya ha salido hacia tu dirección.",
        subject: "Tu pedido va en camino",
      };
    case ORDER_NOTICE.Cancelled:
      return {
        title: "Tu pedido ha sido cancelado",
        intro: "El local ha cancelado el pedido. Si tienes dudas, contacta con el local.",
        subject: "Tu pedido ha sido cancelado",
      };
  }
}

/** Aviso al cliente: confirmación del pedido o cambio importante de estado, con enlace de seguimiento. */
export function orderNoticeEmail(input: OrderNoticeEmailInput) {
  const copy = noticeCopy(input.notice, input.delivery);
  const layout: Layout = {
    restaurante: oneLine(input.restaurante),
    title: copy.title,
    intro: copy.intro,
    details: [
      ["Pedido", oneLine(input.codigo)],
      ["Entrega", DELIVERY_LABEL[input.delivery]],
      ["Total", formatCents(input.totalCents)],
    ],
    action: { label: "Seguir mi pedido", url: input.trackingUrl },
    footer: `Recibes este email porque hiciste un pedido en ${oneLine(input.restaurante)}.`,
  };
  return {
    subject: `${copy.subject} (${oneLine(input.codigo)}) · ${oneLine(input.restaurante)}`,
    html: renderHtml(layout),
    text: renderText(layout),
  };
}
