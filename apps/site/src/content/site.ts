/**
 * Textos de la landing de konnecTTia.com. Basados en la maqueta «Konnecttia-demo-equipo.html»
 * del promotor. Reglas: sin cifras ni testimonios que no sean reales y autorizados, sin prometer
 * ventas, y la IA siempre como complemento opcional.
 */

export const NAV_LINKS = [
  { href: "#productos", label: "Productos" },
  { href: "#easyorder", label: "EasyOrder" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#nosotros", label: "Nosotros" },
  { href: "#preguntas", label: "Preguntas" },
] as const;

export const HERO = {
  eyebrow: "EasyOrder · Pedidos online para restaurantes",
  titleStart: "Tu carta online.",
  titleEmphasis: "Tus pedidos,",
  titleEnd: "bajo control.",
  copy: "Una forma sencilla de recibir pedidos web para recogida y reparto propio, con la marca de tu restaurante y sin comisión por pedido.",
  primary: { href: "#contacto", label: "Hablemos de tu local" },
  secondary: { href: "#easyorder", label: "Conoce EasyOrder" },
} as const;

export const TRUST_ITEMS = [
  "Tu marca en la carta",
  "Sin comisión por pedido",
  "Recogida y reparto propio",
  "Acompañamiento cercano",
] as const;

export const PRODUCTS = [
  {
    name: "EasyOrder",
    status: "Disponible",
    available: true,
    description:
      "Carta online, pedidos para recoger o con reparto propio y un panel para gestionarlos. Para restaurantes, cafeterías y locales de comida para llevar.",
    href: "#easyorder",
    cta: "Conocer EasyOrder",
  },
  {
    name: "EasyAgenda",
    status: "Próximamente",
    available: false,
    description:
      "Reservas y agenda para peluquerías, centros de estética y bienestar. Si te interesa, cuéntanoslo y te avisamos cuando esté disponible.",
    href: "#contacto",
    cta: "Quiero que me avisen",
  },
] as const;

export const EASYORDER_INTRO = {
  eyebrow: "EasyOrder · el primer producto de Konnecttia",
  title: "Un canal propio para los pedidos de tu restaurante.",
  paragraphs: [
    "Tu cliente consulta la carta online y hace un pedido para recoger o recibirlo con el reparto del propio local. El equipo del restaurante gestiona los pedidos desde un panel.",
    "Sin comisión por pedido. Con la marca de tu restaurante y acompañamiento para preparar la carta.",
  ],
} as const;

export const FEATURES = [
  {
    icon: "▤",
    title: "Tu carta, con tu marca",
    copy: "Carta online con la identidad del restaurante: fotos, tamaños, extras y alérgenos de cada plato.",
  },
  {
    icon: "⌂",
    title: "Recogida o reparto",
    copy: "El cliente elige entre las opciones que ofrece tu negocio, con zonas, mínimos y coste de envío.",
  },
  {
    icon: "▣",
    title: "Pedidos en un panel",
    copy: "Los pedidos llegan ordenados y completos, con aviso sonoro y comanda para cocina.",
  },
  {
    icon: "◷",
    title: "Horarios y zonas",
    copy: "Configura horarios partidos, días de cierre y zonas de reparto según cómo trabaja el local.",
  },
  {
    icon: "◫",
    title: "Mesas y comanda",
    copy: "Si tienes sala, gestiona mesas y pedidos de camareros desde el mismo panel.",
  },
  {
    icon: "▥",
    title: "Clientes y analíticas",
    copy: "Consulta el historial de tus clientes y la actividad de tu negocio.",
  },
] as const;

export const ADDONS = {
  eyebrow: "Complementos opcionales",
  title: "WhatsApp y avisos, solo si tu negocio los necesita.",
  copy: "EasyOrder funciona sin inteligencia artificial. Si quieres ir más allá, puedes activar complementos: avisos de estado por email, SMS o WhatsApp con tu número de siempre, y un agente de IA que atiende pedidos por WhatsApp. En una demo concretamos qué tareas podría cubrir en tu negocio.",
  cta: { href: "#contacto", label: "Consultar complementos" },
} as const;

export const ABOUT = {
  eyebrow: "Tecnología cercana, personas primero",
  title: "Hecho para negocios de aquí.",
  paragraphs: [
    "Konnecttia crea herramientas digitales sencillas para que los negocios locales de Canarias atiendan y vendan por sus propios canales.",
    "EasyOrder empieza con restaurantes que quieren ofrecer pedidos online sin entregar el protagonismo de su marca a una plataforma de reparto. Konnecttia acompaña la carga y configuración de la carta.",
  ],
  motto: "Cercana. Sencilla. Fiable.",
} as const;

export const STEPS = [
  {
    number: "01 / Hablamos",
    title: "Conocemos tu forma de trabajar",
    copy: "Nos cuentas cómo recibes pedidos y qué necesita tu equipo en el día a día.",
  },
  {
    number: "02 / Preparamos",
    title: "Configuramos la carta",
    copy: "Te acompañamos con la carga de la carta, horarios y zonas del local.",
  },
  {
    number: "03 / Te acompañamos",
    title: "Tu equipo aprende a usarlo",
    copy: "Te mostramos cómo consultar y gestionar los pedidos que llegan.",
  },
] as const;

export const FAQS = [
  {
    question: "¿EasyOrder es una app de reparto?",
    answer:
      "No. Es un canal de pedidos online para el restaurante. Konnecttia no ofrece repartidores; el reparto, si el local lo ofrece, lo gestiona el propio negocio.",
  },
  {
    question: "¿Se paga comisión por pedido?",
    answer:
      "La propuesta de EasyOrder es un precio fijo sin comisión por pedido. En la demo puedes consultar las condiciones vigentes.",
  },
  {
    question: "¿Tengo que usar inteligencia artificial?",
    answer:
      "No. EasyOrder está planteado para ser útil sin IA. Cualquier complemento de inteligencia artificial es opcional.",
  },
  {
    question: "¿Puedo seguir usando mi número de WhatsApp?",
    answer:
      "Sí. Si activas el complemento de WhatsApp, se conecta el número que ya usa tu negocio y puedes seguir atendiendo desde la app.",
  },
  {
    question: "¿EasyOrder garantiza más ventas?",
    answer: "No. EasyOrder ofrece un canal propio de pedidos; no garantiza ventas ni tráfico.",
  },
] as const;

export const CONTACT = {
  eyebrow: "Empecemos por conocernos",
  title: "Cuéntanos de tu negocio.",
  copy: "Te enseñamos EasyOrder y vemos si encaja con tu forma de trabajar.",
  assurance: "Una primera conversación para conocer tu local y resolver tus dudas.",
} as const;
