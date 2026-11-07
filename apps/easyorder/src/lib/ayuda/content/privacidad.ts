import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const privacidad: HelpPage = {
  slug: HELP_SLUG.Privacy,
  title: "Privacidad y pedidos sospechosos",
  summary: "Tu política de privacidad, límites contra pedidos falsos y cómo bloquear a un cliente.",
  group: HELP_GROUP.Customers,
  keywords: [
    "privacidad",
    "política",
    "rgpd",
    "datos",
    "antifraude",
    "falsos",
    "bloquear",
    "límite",
    "spam",
    "borrar datos",
  ],
  purpose: [
    "Tus clientes te dan su nombre y su teléfono al pedir. Aquí indicas dónde está tu política de privacidad y pones límites para que nadie llene tu tablero de pedidos falsos.",
  ],
  steps: [
    {
      text: "En Ajustes → Privacidad y antifraude, indica la dirección web (URL) de tu política de privacidad. Si la dejas vacía, se usa la página de privacidad de plantilla de tu carta.",
      shot: {
        file: "ajustes-privacidad",
        alt: "Ajustes de privacidad con la política y los límites de pedidos sospechosos",
      },
    },
    {
      text: "Cuando actualices el texto de la política, cambia también la «Versión de la política»: los pedidos nuevos guardan esa versión.",
    },
    {
      text: "En «Pedidos sospechosos» fija cuántos pedidos abiertos puede tener a la vez un mismo teléfono y cuántos puede hacer en una hora. Si los supera, no podrá pedir más por ahora.",
    },
    {
      text: "Para un caso concreto, abre la ficha del cliente en Clientes y pulsa «Bloquear cliente». Ese teléfono ya no podrá pedir por la web.",
      shot: {
        file: "clientes-bloquear",
        alt: "Ventana para bloquear a un cliente con un motivo opcional",
      },
    },
    {
      text: "Si alguien te pide que borres sus datos, usa «Borrar datos del cliente» en su ficha.",
    },
  ],
  faq: [
    {
      question: "Un cliente legítimo no puede pedir",
      answer:
        "Puede haber superado los límites de pedidos abiertos o por hora, o estar bloqueado. Revisa los límites en Ajustes y su ficha en Clientes.",
    },
    {
      question: "¿Se puede deshacer un bloqueo?",
      answer: "Sí. Abre su ficha y desbloquéalo cuando quieras.",
    },
    {
      question: "¿Qué pasa con los pedidos cancelados?",
      answer: "El límite por hora cuenta también los pedidos cancelados de ese teléfono.",
    },
  ],
  related: [HELP_SLUG.Customers, HELP_SLUG.Settings, HELP_SLUG.WebOrders],
};
