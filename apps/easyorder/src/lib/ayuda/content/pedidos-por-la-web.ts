import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const pedidosPorLaWeb: HelpPage = {
  slug: HELP_SLUG.WebOrders,
  title: "Pedidos por la web y seguimiento",
  summary: "Cómo pide tu cliente desde la carta online y cómo sigue su pedido.",
  group: HELP_GROUP.Customers,
  keywords: [
    "carta online",
    "web",
    "enlace",
    "cliente",
    "carrito",
    "seguimiento",
    "estado",
    "pedir",
    "compartir",
  ],
  purpose: [
    "Tu restaurante tiene una carta online con su propia dirección web. Tus clientes la abren desde el móvil, sin descargar nada ni crear una cuenta, y piden desde ahí.",
    "Después del pedido reciben un enlace para ver en qué estado va. Aquí te contamos qué ven ellos, para que puedas ayudarles.",
  ],
  steps: [
    {
      text: "Abre tu carta con «Ver carta online» en el menú del panel. Es lo que ven tus clientes: los productos por categorías, con sus fotos y precios.",
      shot: { file: "web-carta", alt: "Carta online de un restaurante con categorías y productos" },
    },
    {
      text: "Comparte esa dirección donde te encuentren tus clientes: tus redes, WhatsApp o un cartel.",
    },
    {
      text: "El cliente elige productos, añade los extras que quiera y los ve en su carrito. Para pedir indica su nombre y teléfono, si recoge o quiere reparto (con su dirección) y cómo paga.",
      shot: {
        file: "web-pedido",
        alt: "Formulario del pedido con los datos del cliente y el método de pago",
      },
    },
    {
      text: "El pedido llega al tablero de Pedidos con un aviso sonoro. A partir de ahí lo llevas tú, paso a paso.",
    },
    {
      text: "El cliente tiene un enlace de seguimiento donde ve el estado de su pedido. Si paga por transferencia o Bizum, ahí mismo ve los datos para pagar y puede subir el justificante.",
      shot: {
        file: "web-seguimiento",
        alt: "Pantalla de seguimiento del pedido con el estado y los datos de pago",
      },
    },
  ],
  faq: [
    {
      question: "¿Mis clientes tienen que instalar algo o registrarse?",
      answer: "No. Abren el enlace y piden. Solo necesitan su nombre y su teléfono.",
    },
    {
      question: "La carta dice que el local está cerrado",
      answer:
        "La carta sigue tu horario. Revisa Ajustes → Horario y el estado «Según horario / Abierto ahora / Cerrado ahora» en Ajustes → General.",
    },
    {
      question: "Un producto no aparece en la carta",
      answer:
        "Puede estar oculto. En Carta, mira si el producto o su categoría están marcados como ocultos.",
    },
    {
      question: "Un cliente dice que no puede pedir",
      answer:
        "Puede ser que el local esté cerrado, que su dirección quede fuera de tus zonas de reparto, que no llegue al pedido mínimo o que tenga demasiados pedidos abiertos a la vez. Mira la página de Privacidad y pedidos sospechosos.",
    },
  ],
  related: [HELP_SLUG.Orders, HELP_SLUG.Payments, HELP_SLUG.Menu, HELP_SLUG.Privacy],
};
