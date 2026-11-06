import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const repartidoresYFoto: HelpPage = {
  slug: HELP_SLUG.Drivers,
  title: "Repartidores y foto de entrega",
  summary: "Da acceso a tus repartidores y decide si piden una foto al entregar.",
  group: HELP_GROUP.Customers,
  keywords: [
    "repartidor",
    "foto",
    "entrega",
    "prueba de entrega",
    "asignar",
    "reparto",
    "obligatoria",
  ],
  purpose: [
    "Si repartes a domicilio, puedes dar acceso a tus repartidores para que vean solo sus pedidos y los marquen como entregados. Si quieres, también pueden dejar una foto de la entrega como prueba.",
  ],
  steps: [
    {
      text: "En Equipo, invita a la persona con el rol Repartidor. Solo verá «Mis repartos».",
    },
    {
      text: "En Ajustes → Reparto, elige el ajuste de la foto de entrega: «No» (el repartidor no sube foto), «Opcional» (puede subirla) u «Obligatoria» (no puede marcar «Entregado» sin la foto). Guarda los cambios.",
      shot: {
        file: "ajustes-foto-entrega",
        alt: "Ajuste de la foto de entrega con las opciones No, Opcional y Obligatoria",
      },
    },
    {
      text: "Asigna el pedido al repartidor. Le aparecerá en Mis repartos.",
    },
    {
      text: "Cuando se entrega, la tarjeta del pedido en Pedidos muestra las fotos subidas, para que puedas consultarlas.",
    },
  ],
  faq: [
    {
      question: "¿Qué tipo de foto se admite?",
      answer: "JPG, PNG o WebP, de hasta 5 MB.",
    },
    {
      question: "¿Quién ve las fotos de entrega?",
      answer: "El personal del local con permiso sobre los pedidos.",
    },
    {
      question: "El repartidor no puede marcar «Entregado»",
      answer:
        "Si la foto es obligatoria, necesita subirla primero. Puedes cambiar el ajuste a «Opcional» en Ajustes → Reparto.",
    },
  ],
  related: [HELP_SLUG.MyDeliveries, HELP_SLUG.Team, HELP_SLUG.Settings],
};
