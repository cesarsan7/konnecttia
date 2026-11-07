import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const estadisticas: HelpPage = {
  slug: HELP_SLUG.Stats,
  title: "Estadísticas",
  summary: "Ventas, pedidos, ticket medio y tus horas punta, comparado con el periodo anterior.",
  group: HELP_GROUP.Business,
  keywords: [
    "ventas",
    "ticket medio",
    "horas punta",
    "resumen",
    "periodo",
    "números",
    "cancelados",
  ],
  purpose: [
    "Estadísticas te cuenta cómo va el negocio sin que tengas que hacer cuentas. Esta sección está disponible si tu plan incluye el módulo de estadísticas.",
  ],
  steps: [
    {
      text: "Elige el periodo: hoy, 7 días, 30 días, este mes o las fechas que quieras. Todo se compara con el periodo anterior.",
      shot: {
        file: "estadisticas",
        alt: "Estadísticas con las ventas, los pedidos, el ticket medio y las horas punta",
      },
    },
    {
      text: "Mira los números clave: ventas, pedidos, ticket medio (lo que gasta un cliente por pedido), clientes distintos y pedidos cancelados.",
    },
    {
      text: "Consulta tus horas punta para saber a qué hora entran más pedidos. Te sirve para planificar al personal y para decidir cuándo usar el modo ocupado.",
    },
  ],
  faq: [
    {
      question: "No veo la sección Estadísticas",
      answer:
        "Tu plan puede no incluir estadísticas, o tu rol no tiene permiso. Escríbenos a hola@konnecttia.com o pide al propietario que revise tu rol.",
    },
    {
      question: "¿Qué es el ticket medio?",
      answer: "Lo que gasta de media un cliente en cada pedido.",
    },
  ],
  related: [HELP_SLUG.Orders, HELP_SLUG.Settings],
};
