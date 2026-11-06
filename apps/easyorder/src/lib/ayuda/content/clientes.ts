import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const clientes: HelpPage = {
  slug: HELP_SLUG.Customers,
  title: "Clientes",
  summary: "Quién te pide, cuánto y con qué frecuencia; bloquear, exportar y borrar datos.",
  group: HELP_GROUP.Business,
  keywords: [
    "cliente",
    "teléfono",
    "whatsapp",
    "exportar",
    "csv",
    "excel",
    "bloquear",
    "borrar",
    "datos",
    "ficha",
  ],
  purpose: [
    "Cada persona que te hace un pedido queda guardada como cliente. Aquí ves quiénes son, cuánto piden y cuánto gastan, y puedes contactarles.",
  ],
  steps: [
    {
      text: "Busca por nombre o teléfono. Ordena por los más recientes, los que más piden o los que más gastan, y filtra solo los bloqueados.",
      shot: {
        file: "clientes-lista",
        alt: "Lista de clientes con su número de pedidos y lo que han gastado",
      },
    },
    {
      text: "Pulsa un cliente para abrir su ficha: sus pedidos, su teléfono para llamarle y un botón para escribirle por WhatsApp.",
      shot: {
        file: "clientes-ficha",
        alt: "Ficha de un cliente con sus pedidos y las opciones de contacto",
      },
    },
    {
      text: "Con «Exportar CSV» descargas tu lista de clientes en un archivo que se abre con Excel.",
    },
    {
      text: "Si tu rol lo permite, desde la ficha puedes bloquear al cliente o borrar sus datos.",
    },
  ],
  faq: [
    {
      question: "¿Qué pasa si bloqueo a un cliente?",
      answer:
        "Ese teléfono ya no podrá hacer pedidos por la web. Si lo intenta, verá un aviso. Puedes indicar un motivo (opcional) y desbloquearlo cuando quieras.",
    },
    {
      question: "Un cliente me pide que borre sus datos",
      answer:
        "Desde su ficha, «Borrar datos del cliente» anonimiza su perfil y sus pedidos. Si estaba bloqueado, el bloqueo de su teléfono se mantiene, sin el motivo.",
    },
    {
      question: "No veo el botón de exportar o de bloquear",
      answer: "Depende de tu rol. Pide al propietario que revise tus permisos en Equipo.",
    },
  ],
  related: [HELP_SLUG.Privacy, HELP_SLUG.Orders, HELP_SLUG.Team],
};
