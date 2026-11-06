import { HELP_SLUG } from "../slugs";
import { HELP_GROUP, type HelpPage } from "../types";

export const ajustes: HelpPage = {
  slug: HELP_SLUG.Settings,
  title: "Ajustes",
  summary: "Datos del restaurante, pagos, horario, reparto y locales.",
  group: HELP_GROUP.Business,
  keywords: [
    "horario",
    "festivos",
    "horas punta",
    "reparto",
    "zonas",
    "envío",
    "pedido mínimo",
    "abierto",
    "cerrado",
    "locales",
    "tiempos",
    "recogida",
  ],
  purpose: [
    "Ajustes es donde dejas el restaurante a tu manera. Está ordenado en pestañas: General, Pedidos y pago, Privacidad y antifraude, Horario, Reparto y Local (o Locales).",
    "Cada pestaña se guarda por separado: lo que cambies no se aplica hasta que pulses el botón de guardar.",
  ],
  steps: [
    {
      text: "En General cambias el nombre, el teléfono, la dirección, el eslogan y la descripción, que se muestran en la carta online.",
      shot: {
        file: "ajustes-general",
        alt: "Ajustes generales con los datos del restaurante y su estado",
      },
    },
    {
      text: "En el bloque «Apertura» elige el estado: «Según horario» sigue tu horario, «Cerrado ahora» deja de aceptar pedidos hasta que lo cambies y «Abierto ahora» los acepta aunque el horario diga cerrado.",
    },
    {
      text: "En Pedidos y pago activas la recogida en el local y el reparto a domicilio, eliges cómo cobras, fijas los tiempos de preparación y configuras el modo ocupado.",
    },
    {
      text: "En Horario marcas los días y las horas en que abres, y añades tus festivos. También puedes definir tus horas punta.",
      shot: { file: "ajustes-horario", alt: "Horario semanal del restaurante con los festivos" },
    },
    {
      text: "En Reparto (si repartes) defines tus zonas: cobertura por radio desde el local, por código postal o toda la ciudad. Para cada zona eliges tarifa fija o por distancia, el pedido mínimo y, si quieres, el envío gratis desde cierto importe.",
      shot: {
        file: "ajustes-reparto",
        alt: "Zonas de reparto con la tarifa de envío y el pedido mínimo",
      },
    },
    {
      text: "En Local (o Locales) ves el estado de cada local: nombre, teléfono, dirección, si está activo y si admite recogida y reparto.",
    },
  ],
  faq: [
    {
      question: "Cambié algo y no se aplica",
      answer:
        "Cada pestaña tiene su propio botón de guardar. Pulsa «Guardar cambios» (o «Guardar horario») antes de salir.",
    },
    {
      question: "Quiero cerrar hoy sin tocar el horario",
      answer:
        "En General, bloque Apertura, elige «Cerrado ahora». Cuando quieras volver, elige «Según horario».",
    },
    {
      question: "No veo la pestaña Reparto",
      answer: "Aparece si activas el reparto a domicilio en Pedidos y pago.",
    },
    {
      question: "No veo Ajustes",
      answer: "Depende de tu rol. Pide al propietario que revise tus permisos en Equipo.",
    },
  ],
  related: [HELP_SLUG.Payments, HELP_SLUG.Drivers, HELP_SLUG.Privacy, HELP_SLUG.Orders],
};
