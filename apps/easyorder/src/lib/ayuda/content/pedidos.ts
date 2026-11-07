import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const pedidos: HelpPage = {
  slug: HELP_SLUG.Orders,
  title: "Pedidos",
  summary: "El tablero donde llegan, se preparan y se entregan los pedidos del día.",
  group: HELP_GROUP.Daily,
  keywords: [
    "tablero",
    "tabla",
    "nuevo pedido",
    "comanda",
    "imprimir",
    "ocupado",
    "sonido",
    "aviso",
    "cocina",
    "estado",
    "teléfono",
    "mostrador",
  ],
  purpose: [
    "Pedidos es la pantalla que dejas abierta mientras atiendes. Los pedidos de la web y de WhatsApp aparecen solos, con un aviso sonoro, y desde aquí los llevas de uno en uno hasta la entrega.",
    "Cada columna es un momento del pedido: Nuevos, En preparación, Listos y en reparto, y Terminados.",
  ],
  steps: [
    {
      text: "Mira el tablero. Cada tarjeta es un pedido, con el cliente, los productos, cómo lo recibe y cómo paga.",
      shot: {
        file: "pedidos-tablero",
        alt: "Tablero de pedidos con las columnas Nuevos, En preparación, Listos y Terminados",
      },
    },
    {
      text: "Avanza el pedido con el botón grande de la tarjeta («Aceptar pedido», «Marcar como listo»…). Al pulsarlo, el pedido pasa a la siguiente columna.",
    },
    {
      text: "Cambia a la vista de tabla cuando quieras buscar pedidos de otros días y filtrarlos por estado, canal o cobro.",
      shot: {
        file: "pedidos-tabla",
        alt: "Pedidos en vista de tabla con los filtros de estado, canal y cobro",
      },
    },
    {
      text: "Apunta un pedido tú con «Nuevo pedido»: para los que llegan por teléfono, en el mostrador o en mesa. Elige los productos, los datos del cliente y cómo paga; el pedido entra en el tablero como cualquier otro.",
      shot: {
        file: "pedidos-nuevo",
        alt: "Formulario para apuntar un pedido a mano con productos y datos del cliente",
      },
    },
    {
      text: "Si te desbordas, usa el modo ocupado: suma unos minutos al tiempo de espera que ven los clientes nuevos. No deja de aceptar pedidos y se quita solo pasado un rato.",
      tip: "Las opciones de minutos y su duración se cambian en Ajustes → Pedidos y pago.",
      shot: {
        file: "pedidos-ocupado",
        alt: "Menú del modo ocupado con las opciones de minutos",
      },
    },
    {
      text: "Para imprimir la comanda, elige el papel (58 u 80 mm) y si quieres la copia de cocina o la del cliente. Puedes imprimir cada pedido al llegar o al aceptarlo. Se recuerda en este navegador.",
      shot: {
        file: "pedidos-comanda",
        alt: "Opciones de impresión de la comanda con el tamaño del papel",
      },
    },
    {
      text: "Pulsa «Activar sonido» una vez para oír un aviso con cada pedido nuevo. Los navegadores lo piden por seguridad.",
    },
  ],
  faq: [
    {
      question: "¿Qué hago con un pedido de transferencia o Bizum?",
      answer:
        "Queda «Esperando cobro». Cuando veas el dinero en tu cuenta, pulsa «Confirmar cobro» y el pedido sigue su camino. Más detalle en la página de Cobros.",
    },
    {
      question: "No suena el aviso de pedido nuevo",
      answer:
        "Pulsa «Activar sonido» en esta pantalla y comprueba el volumen del dispositivo. El aviso suena mientras Pedidos está abierto.",
    },
    {
      question: "No veo el botón «Nuevo pedido»",
      answer: "Depende de tu rol. Pide al propietario que revise tus permisos en Equipo.",
    },
    {
      question: "¿Puedo ver los pedidos de otro día?",
      answer: "Sí. Cambia a la vista de tabla y busca o filtra.",
    },
  ],
  related: [HELP_SLUG.Payments, HELP_SLUG.WebOrders, HELP_SLUG.Tables, HELP_SLUG.Drivers],
};
