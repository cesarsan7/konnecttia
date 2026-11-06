import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const mesas: HelpPage = {
  slug: HELP_SLUG.Tables,
  title: "Mesas",
  summary: "El plano de tu sala: qué mesas están libres, ocupadas y cuánto llevan.",
  group: HELP_GROUP.Daily,
  keywords: [
    "sala",
    "terraza",
    "mesero",
    "camarero",
    "zona",
    "cuenta",
    "ocupar",
    "liberar",
    "plano",
  ],
  purpose: [
    "Si sirves en sala, Mesas te enseña de un vistazo cuáles están libres y cuáles ocupadas, y te deja tomar pedidos y llevar la cuenta de cada una.",
    "Esta sección está disponible si tu plan incluye el módulo de mesas.",
  ],
  steps: [
    {
      text: "Elige el local arriba si tienes más de uno: cada local tiene sus propias mesas.",
    },
    {
      text: "Mira el plano. Cada cuadro es una mesa, agrupadas por zonas (sala, terraza…). Una etiqueta avisa cuando la espera o la estancia se alargan.",
      shot: {
        file: "mesas-plano",
        alt: "Plano de mesas con la sala y la terraza, libres y ocupadas",
      },
    },
    {
      text: "Filtra para ver solo las libres o solo las ocupadas.",
    },
    {
      text: "Toca una mesa para abrirla: ves su cuenta, puedes tomar o añadir un pedido, ocuparla o liberarla.",
      shot: { file: "mesas-mesa", alt: "Detalle de una mesa ocupada con su cuenta y los pedidos" },
    },
    {
      text: "Para crear tus mesas, activa «Editar mesas»: ahí creas las zonas, añades mesas, das de alta a los meseros y ajustas los avisos de tiempo.",
      shot: { file: "mesas-editar", alt: "Modo de edición de mesas con zonas, mesas y meseros" },
    },
  ],
  faq: [
    {
      question: "No veo la sección Mesas",
      answer:
        "Tu plan puede no incluir mesas, o tu rol no tiene permiso para verlas. Escríbenos a hola@konnecttia.com o pide al propietario que revise tu rol.",
    },
    {
      question: "¿Qué rol necesita un mesero?",
      answer:
        "El rol Mesero. Se asigna desde Equipo, y quien lo tenga ve las mesas para atenderlas.",
    },
  ],
  related: [HELP_SLUG.Orders, HELP_SLUG.Team],
};
