import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const cobros: HelpPage = {
  slug: HELP_SLUG.Payments,
  title: "Cobros: Bizum, transferencia y justificantes",
  summary: "Elige cómo cobras, qué datos ve el cliente y cómo confirmas un pago.",
  group: HELP_GROUP.Customers,
  keywords: [
    "bizum",
    "transferencia",
    "iban",
    "efectivo",
    "tarjeta",
    "justificante",
    "pago",
    "cobrar",
    "esperando cobro",
    "confirmar cobro",
    "concepto",
  ],
  purpose: [
    "EasyOrder no mueve dinero: el cliente te paga como tú decidas y tú confirmas que lo has cobrado. Hay cuatro formas de pago: efectivo, tarjeta, transferencia y Bizum.",
    "Con efectivo y tarjeta se paga al recoger o en la entrega. Con transferencia y Bizum el pedido queda pendiente hasta que confirmes el cobro.",
  ],
  steps: [
    {
      text: "Entra en Ajustes → Pedidos y pago y marca los métodos que aceptas en «Métodos de pago». Debe quedar al menos uno.",
      shot: {
        file: "ajustes-pago",
        alt: "Ajustes de pedidos y pago con los métodos de pago y los datos para transferencia y Bizum",
      },
    },
    {
      text: "Si aceptas transferencia, rellena en «Datos para el pago» el titular y el IBAN (y, si quieres, el banco y el concepto). Si aceptas Bizum, indica tu teléfono de Bizum. El cliente verá estos datos al pedir.",
      tip: "Sin IBAN y titular no se pueden aceptar transferencias.",
    },
    {
      text: "Pulsa «Guardar cambios» al terminar.",
    },
    {
      text: "Cuando un cliente elige transferencia o Bizum, su pedido llega al tablero como «Esperando cobro». Puedes prepararlo, pero no lo des por cobrado hasta ver el dinero.",
      shot: {
        file: "cobros-tablero",
        alt: "Tarjeta de pedido en el tablero con el aviso Esperando cobro y el botón Confirmar cobro",
      },
    },
    {
      text: "El cliente, desde su enlace de seguimiento, ve los datos para pagar, puede copiar el concepto y subir una captura o un PDF del pago (hasta 5 MB). Cuando lo sube, la tarjeta del pedido muestra «Ver justificante».",
      shot: {
        file: "cobros-seguimiento",
        alt: "Seguimiento del pedido con los datos de pago y el botón para subir el justificante",
      },
    },
    {
      text: "Comprueba el dinero en tu banco o en tu Bizum y pulsa «Confirmar cobro» en la tarjeta. El pedido deja de estar pendiente.",
    },
  ],
  faq: [
    {
      question: "¿Por qué el pedido no avanza hasta que confirmo el cobro?",
      answer:
        "Es una protección para ti: con transferencia o Bizum no entregas algo que todavía no has cobrado.",
    },
    {
      question: "El cliente dice que ya pagó y no veo el justificante",
      answer:
        "Pídele que abra su enlace de seguimiento y pulse «Subir justificante». Acepta imágenes (JPG, PNG o WebP) y PDF de hasta 5 MB. Si prefieres, mira tu banco y confirma el cobro sin justificante.",
    },
    {
      question: "¿Qué es el concepto?",
      answer:
        "Es el texto que el cliente escribe en la transferencia para que reconozcas de qué pedido es. Se lo mostramos con un botón para copiarlo.",
    },
    {
      question: "¿Puedo dejar de aceptar Bizum?",
      answer: "Sí. Desmárcalo en Métodos de pago y guarda. Los pedidos nuevos ya no lo ofrecerán.",
    },
  ],
  related: [HELP_SLUG.Orders, HELP_SLUG.WebOrders, HELP_SLUG.Settings],
};
