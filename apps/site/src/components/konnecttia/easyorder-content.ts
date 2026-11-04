/**
 * Textos de la página de EasyOrder. Los planes reflejan `docs/konnecTTia.md` §3 y
 * `packages/access` (PLAN_MODULES): Básico y Premium, más complementos aparte.
 * `soon: true` marca lo que aún no está disponible en el panel, para no prometer de más.
 * Sin precios: se dan en la demo, según el local (FAQ de la portada).
 */

export type Feature = {
  readonly title: string;
  readonly text: string;
  readonly soon?: boolean;
};

export type PlanItem = { readonly name: string; readonly soon?: boolean };

export type Plan = {
  readonly name: string;
  readonly summary: string;
  readonly intro?: string;
  readonly items: readonly PlanItem[];
  readonly featured?: boolean;
};

export const AUDIENCE: readonly Feature[] = [
  {
    title: "Restaurantes y pizzerías",
    text: "Con recogida en el local o reparto propio, que hoy reciben pedidos por teléfono o WhatsApp.",
  },
  {
    title: "Cafeterías y comida para llevar",
    text: "Cartas con tamaños, extras con precio y suplementos, explicadas sin errores al cliente.",
  },
  {
    title: "De uno a varios locales",
    text: "Una sola carta para la marca y, en cada local, su horario, sus zonas y sus agotados.",
  },
  {
    title: "Quien paga comisión a una app",
    text: "Un canal propio a precio fijo, con tu marca y con los datos de tus clientes en tu mano.",
  },
];

export const CUSTOMER_FEATURES: readonly Feature[] = [
  {
    title: "Carta online con tu marca",
    text: "Una dirección web con el nombre de tu local, tu logotipo y las fotos de tus platos. Sin descargar ninguna app.",
  },
  {
    title: "Variantes, extras y alérgenos",
    text: "Tamaños, extras con precio y los 14 alérgenos de la UE visibles antes de confirmar.",
  },
  {
    title: "Recogida o reparto",
    text: "Comprueba la zona y el pedido mínimo, calcula el envío y da un tiempo estimado.",
  },
  {
    title: "Seguimiento del pedido",
    text: "Tu cliente ve en qué punto está su pedido, de recibido a entregado.",
  },
  {
    title: "Formas de pago de tu local",
    text: "Efectivo, tarjeta, transferencia o Bizum, según lo que aceptes. El cobro online llegará más adelante.",
  },
];

export const TEAM_FEATURES: readonly Feature[] = [
  {
    title: "Pedidos en directo",
    text: "Cada pedido entra en el tablero con aviso y avanza por estados hasta la entrega.",
  },
  {
    title: "Modo ocupado",
    text: "En hora punta, alarga los tiempos de espera con un clic durante el rato que elijas.",
  },
  {
    title: "Carta editable",
    text: "Productos, precios, fotos, orden y alérgenos. Marca agotados en cada local.",
  },
  {
    title: "Horarios, festivos y zonas",
    text: "Horario por local, apertura manual, zonas y tarifas de reparto, horas punta y suplementos.",
  },
  {
    title: "Equipo con roles",
    text: "Invita a tu equipo con un enlace y decide qué puede hacer cada persona y en qué local.",
  },
  {
    title: "En tablet, móvil u ordenador",
    text: "El panel funciona en el navegador: sin instalar nada en el mostrador.",
  },
];

export const PLANS: readonly Plan[] = [
  {
    name: "Básico",
    summary: "Para un local que quiere su canal de pedidos propio.",
    items: [
      { name: "Carta online y pedidos web" },
      { name: "Panel de pedidos en directo" },
      { name: "Configuración del local y horarios" },
      { name: "Equipo y roles" },
      { name: "Reparto con zonas y tarifas" },
      { name: "Clientes e historial", soon: true },
      { name: "Avisos por email", soon: true },
    ],
  },
  {
    name: "Premium",
    summary: "Para negocios con varios locales o más servicio.",
    intro: "Todo lo del plan Básico, y además:",
    featured: true,
    items: [
      { name: "Varios locales con una sola carta" },
      { name: "Estadísticas de pedidos y ventas" },
      { name: "Mesas y comanda", soon: true },
      { name: "Pedidos programados", soon: true },
      { name: "Carta en varios idiomas", soon: true },
      { name: "Novedades y reseñas", soon: true },
    ],
  },
];

export const ADD_ONS: readonly Feature[] = [
  {
    title: "Agente de IA para WhatsApp",
    text: "Atiende en tu número, conoce tu carta y tus horarios y deja el pedido en tu panel. Si hace falta, pasa la conversación a tu equipo.",
  },
  {
    title: "Avisos por WhatsApp o SMS",
    text: "Mensajes al cliente cuando su pedido cambia de estado.",
    soon: true,
  },
];
