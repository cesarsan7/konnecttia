import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const misRepartos: HelpPage = {
  slug: HELP_SLUG.MyDeliveries,
  title: "Mis repartos",
  summary: "Para quien reparte: los pedidos que te asignan, y cómo marcarlos hasta la entrega.",
  group: HELP_GROUP.Daily,
  keywords: [
    "repartidor",
    "entrega",
    "reparto",
    "salgo a repartir",
    "entregado",
    "dirección",
    "cobrar",
  ],
  purpose: [
    "Si tu rol es Repartidor, Mis repartos es tu pantalla de trabajo. Solo ves los pedidos que el local te ha asignado, con la dirección, el teléfono del cliente y cuánto cobrar.",
  ],
  steps: [
    {
      text: "Abre Mis repartos. Verás tus pedidos en orden, con todo lo que necesitas para llegar y cobrar.",
      shot: {
        file: "repartos-lista",
        alt: "Lista de repartos asignados con la dirección, el teléfono y el importe a cobrar",
      },
    },
    {
      text: "Cuando el pedido esté listo, pulsa «Salgo a repartir».",
    },
    {
      text: "Al dejarlo en su destino, pulsa «Entregado». Si el local pide foto, hazla y súbela antes.",
      shot: {
        file: "repartos-foto",
        alt: "Pedido en reparto con el botón para hacer la foto de la entrega",
      },
    },
    {
      text: "La lista se actualiza sola cada pocos segundos. Si quieres comprobarlo ya, pulsa «Actualizar».",
    },
  ],
  faq: [
    {
      question: "No me aparece ningún pedido",
      answer:
        "Solo ves los que el local te ha asignado. Pregunta a quien lleva los pedidos si te ha asignado alguno.",
    },
    {
      question: "El pedido está pendiente de cobro",
      answer:
        "Con transferencia o Bizum, espera a que el local confirme el cobro antes de entregarlo.",
    },
    {
      question: "No me deja marcar «Entregado»",
      answer:
        "Si el local ha puesto la foto obligatoria, tienes que subirla primero. Mira la página de Repartidores y foto de entrega.",
    },
  ],
  related: [HELP_SLUG.Drivers, HELP_SLUG.Team, HELP_SLUG.Payments],
};
