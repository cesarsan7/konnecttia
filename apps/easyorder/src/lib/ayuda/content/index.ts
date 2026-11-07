import type { HelpSlug } from "../slugs";
import type { HelpPage } from "../types";
import { ajustes } from "./ajustes";
import { carta } from "./carta";
import { clientes } from "./clientes";
import { cobros } from "./cobros";
import { equipo } from "./equipo";
import { estadisticas } from "./estadisticas";
import { mesas } from "./mesas";
import { misRepartos } from "./mis-repartos";
import { pedidos } from "./pedidos";
import { pedidosPorLaWeb } from "./pedidos-por-la-web";
import { primerosPasos } from "./primeros-pasos";
import { privacidad } from "./privacidad";
import { pruebaGratuita } from "./prueba-gratuita";
import { repartidoresYFoto } from "./repartidores-y-foto";

/** Todas las páginas de la ayuda, en el orden en que se enseñan dentro de cada grupo. */
export const HELP_PAGES: readonly HelpPage[] = [
  primerosPasos,
  pruebaGratuita,
  pedidos,
  mesas,
  misRepartos,
  carta,
  clientes,
  estadisticas,
  equipo,
  ajustes,
  pedidosPorLaWeb,
  cobros,
  repartidoresYFoto,
  privacidad,
];

export function helpPageBySlug(slug: string): HelpPage | undefined {
  return HELP_PAGES.find((page) => page.slug === slug);
}

export function isHelpSlug(slug: string): slug is HelpSlug {
  return HELP_PAGES.some((page) => page.slug === slug);
}
