import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const primerosPasos: HelpPage = {
  slug: HELP_SLUG.FirstSteps,
  title: "Primeros pasos",
  summary: "Entra en tu panel, prepara la carta y el horario y recibe tu primer pedido.",
  group: HELP_GROUP.Start,
  keywords: [
    "empezar",
    "comenzar",
    "inicio",
    "entrar",
    "acceso",
    "contraseña",
    "login",
    "configurar",
    "nuevo",
    "invitación",
    "olvidé",
  ],
  purpose: [
    "EasyOrder es el panel desde el que recibes y llevas los pedidos de tu restaurante: los que llegan por la web de tu carta, los de WhatsApp y los que apuntas tú mismo.",
    "Esta guía te lleva desde la primera vez que entras hasta tu primer pedido.",
  ],
  steps: [
    {
      text: "Entra en el panel con el email y la contraseña con los que te dimos de alta. Si no recuerdas la contraseña, pulsa «¿Olvidaste tu contraseña?» y te enviamos un enlace para crear una nueva.",
      tip: "Si te invitaron al equipo de un restaurante, usa el enlace de la invitación: te pide crear tu cuenta o entrar con la que ya tienes.",
      shot: {
        file: "login",
        alt: "Pantalla de entrada al panel con los campos de email y contraseña",
      },
    },
    {
      text: "Si trabajas con más de un restaurante, elige cuál abrir. Después puedes cambiar desde el menú con «Cambiar de restaurante».",
    },
    {
      text: "En «Pedidos» verás la lista «Primeros pasos» con lo que falta por preparar: añadir al menos un producto a la carta, definir tu horario, elegir cómo cobras, crear tus zonas de reparto (si repartes) e invitar a tu equipo. Pulsa cada punto para ir a su pantalla. Se marcan solos cuando los haces, y puedes plegar la lista u ocultarla.",
      shot: {
        file: "pedidos-primeros-pasos",
        alt: "Tablero de pedidos vacío con la lista Primeros pasos y el aviso de la prueba gratuita",
      },
    },
    {
      text: "Prepara tu carta: crea las categorías (hamburguesas, bebidas…) y añade los productos con sus precios. Está explicado en la página de Carta.",
    },
    {
      text: "Define tu horario en «Ajustes → Horario» y, si repartes a domicilio, tus zonas en «Ajustes → Reparto». Elige cómo cobras en «Ajustes → Pedidos y pago».",
    },
    {
      text: "Comparte con tus clientes el enlace de tu carta. Para verlo, pulsa «Ver carta online» en el menú: se abre la carta tal como la ven ellos.",
    },
    {
      text: "Pulsa «Activar sonido» en la pantalla de Pedidos para oír un aviso cada vez que entre un pedido, y deja esa pantalla abierta mientras atiendes.",
    },
    {
      text: "La primera vez que entras en cada sección, una guía te enseña lo principal en pocos pasos. Puedes repetirla cuando quieras con el botón «Guía» de arriba, y abrir esta ayuda con «Ayuda».",
    },
  ],
  faq: [
    {
      question: "No me llega el correo para crear la contraseña",
      answer:
        "Mira en la carpeta de correo no deseado. Si no llega, espera un par de minutos y vuelve a pedirlo; si lo pides muchas veces seguidas, tendrás que esperar un poco. Si sigue sin llegar, escríbenos a hola@konnecttia.com.",
    },
    {
      question: "¿Puedo usar el panel desde el móvil?",
      answer:
        "Sí. El panel se adapta al móvil: abajo aparecen las secciones principales y «Más» guarda el resto.",
    },
    {
      question: "Entro, pero no veo todas las secciones",
      answer:
        "Cada persona ve solo lo que permite su rol. Por ejemplo, un mesero ve Mesas y un repartidor solo «Mis repartos». Pide al propietario que revise tu rol en Equipo.",
    },
    {
      question: "Dice que mi usuario no tiene acceso a este restaurante",
      answer:
        "Tu cuenta no está asignada a ese restaurante. Pide al propietario que te invite desde Equipo, o escríbenos a hola@konnecttia.com.",
    },
    {
      question: "¿Cómo cambio mi nombre?",
      answer: "En el menú, pulsa «Mi nombre y apodo». Así te verá el equipo en lugar de tu email.",
    },
  ],
  related: [HELP_SLUG.Orders, HELP_SLUG.Menu, HELP_SLUG.Settings, HELP_SLUG.Trial],
};
