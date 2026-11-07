import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const equipo: HelpPage = {
  slug: HELP_SLUG.Team,
  title: "Equipo",
  summary: "Invita a tu gente y decide qué puede ver y hacer cada persona.",
  group: HELP_GROUP.Business,
  keywords: [
    "invitar",
    "invitación",
    "rol",
    "permisos",
    "empleado",
    "personal",
    "encargado",
    "mesero",
    "repartidor",
    "enlace",
  ],
  purpose: [
    "En Equipo das acceso al panel a quien trabaja contigo. Cada persona tiene un rol que decide qué ve y qué puede hacer.",
    "Los roles ya vienen preparados: Propietario, Encargado, Personal, Consulta, Mesero y Repartidor.",
  ],
  steps: [
    {
      text: "Pulsa «Invitar al equipo». Elige el rol y, mejor, escribe el email de la persona.",
      shot: {
        file: "equipo-invitar",
        alt: "Ventana para invitar a una persona al equipo eligiendo su rol",
      },
    },
    {
      text: "Se crea un enlace de un solo uso. Cópialo y mándaselo por WhatsApp: al abrirlo, la persona crea su cuenta o entra con la que ya tiene. El enlace caduca pasados unos días.",
      shot: { file: "equipo-miembros", alt: "Lista del equipo con el rol de cada persona" },
    },
    {
      text: "En «Invitaciones pendientes» puedes volver a copiar el enlace o anularlo si te equivocaste.",
    },
    {
      text: "Consulta los roles para ver qué permite cada uno. Si quien gestiona el equipo necesita algo distinto, puede crear roles propios, por ejemplo uno que solo tome pedidos.",
      shot: { file: "equipo-roles", alt: "Roles del equipo con lo que puede hacer cada uno" },
    },
  ],
  faq: [
    {
      question: "La invitación no funciona",
      answer:
        "Cada enlace sirve una sola vez y caduca. Anula la invitación y crea otra. Si pusiste el email, la persona debe entrar con ese mismo email.",
    },
    {
      question: "¿Qué rol le doy a un repartidor?",
      answer: "El rol Repartidor. Solo verá «Mis repartos», con los pedidos que le asignes.",
    },
    {
      question: "No veo la sección Equipo",
      answer: "Solo la ven quienes tienen permiso para ello, normalmente el propietario.",
    },
  ],
  related: [HELP_SLUG.Drivers, HELP_SLUG.Tables, HELP_SLUG.FirstSteps],
};
