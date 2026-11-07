/**
 * Guía paso a paso del panel: lógica pura (sin DOM) para poder probarla. El componente
 * (`components/panel/tour/Tour.tsx`) solo mide elementos y pinta; aquí se decide qué pasos se
 * enseñan, dónde va el globo y qué se recuerda.
 */

/** Secciones del panel que tienen guía. El valor es el que se usa en la memoria del navegador. */
export const TOUR_SECTION = {
  Orders: "pedidos",
  Tables: "mesas",
  Menu: "carta",
  Customers: "clientes",
  Stats: "estadisticas",
  Team: "equipo",
  Settings: "ajustes",
  Deliveries: "repartos",
} as const;

export type TourSection = (typeof TOUR_SECTION)[keyof typeof TOUR_SECTION];

/** Un paso de la guía: apunta a un elemento marcado con `data-tour="<target>"`. */
export type TourStep = {
  /** Valor del atributo `data-tour` del elemento que se resalta. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
  /** Permiso (código de `PERMISSION`) que hace falta para usar lo que enseña el paso. */
  readonly permission?: string;
  /** Módulo del restaurante que hace falta (`access.modulos`). */
  readonly module?: string;
};

export type TourAccess = {
  readonly can: (permission: string) => boolean;
  readonly modules: readonly string[];
};

/** Deja solo los pasos que la persona puede usar: con su permiso y con el módulo activo. */
export function availableSteps(steps: readonly TourStep[], access: TourAccess): TourStep[] {
  return steps.filter(
    (step) =>
      (step.permission === undefined || access.can(step.permission)) &&
      (step.module === undefined || access.modules.includes(step.module)),
  );
}

/**
 * Siguiente paso (o anterior, con `direction` -1) cuyo elemento existe en pantalla. Un paso que
 * apunta a algo que no está (sin permiso, módulo apagado, lista vacía) se salta. null = no queda
 * ninguno en esa dirección.
 */
export function stepIndexFrom(
  steps: readonly TourStep[],
  from: number,
  direction: 1 | -1,
  exists: (step: TourStep) => boolean,
): number | null {
  for (let index = from; index >= 0 && index < steps.length; index += direction) {
    const step = steps[index];
    if (step && exists(step)) return index;
  }
  return null;
}

/** Los pasos cuyo elemento existe ahora mismo, en su orden. */
export function presentSteps(steps: readonly TourStep[], exists: (step: TourStep) => boolean) {
  return steps.filter(exists);
}

/** «Paso 2 de 5». */
export function stepLabel(index: number, total: number): string {
  return `Paso ${index + 1} de ${total}`;
}

/** Sección del panel que corresponde a la ruta, o null si no tiene guía. */
export function sectionFromPath(pathname: string, slug: string): TourSection | null {
  const base = `/panel/${slug}`;
  const path = pathname.replace(/\/+$/, "");
  if (path === base) return TOUR_SECTION.Orders;
  if (!path.startsWith(`${base}/`)) return null;
  const rest = path.slice(base.length + 1);
  const sections: readonly TourSection[] = Object.values(TOUR_SECTION);
  const found = sections.find((section) => section === rest);
  // `pedidos` no es una ruta: los pedidos viven en la raíz del restaurante.
  return found && found !== TOUR_SECTION.Orders ? found : null;
}

// ------------------------------------------------------------------------------ geometría

export type Rect = {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
};
export type Size = { readonly width: number; readonly height: number };

/** Separación mínima entre el globo y el borde de la pantalla. */
export const BALLOON_MARGIN = 12;
/** Separación entre el globo y el elemento que señala. */
export const BALLOON_GAP = 14;
/** Aire alrededor del elemento resaltado. */
export const SPOTLIGHT_PADDING = 6;
/** El globo no pasa de este ancho (px); en móvil se ajusta a la pantalla. */
export const BALLOON_MAX_WIDTH = 352;
/** Mínimo de la flecha respecto a las esquinas del globo, para que no se pegue al borde. */
const ARROW_INSET = 20;

export type BalloonPlacement = "bottom" | "top" | "inside";

export type BalloonPosition = {
  readonly top: number;
  readonly left: number;
  /** Ancho que debe tener el globo (nunca más que la pantalla menos los márgenes). */
  readonly width: number;
  /** Alto máximo; si el texto es más largo, el globo hace scroll por dentro. */
  readonly maxHeight: number;
  readonly placement: BalloonPlacement;
  /** Posición horizontal de la flecha dentro del globo; null cuando no se dibuja. */
  readonly arrow: number | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** La parte del rectángulo que cae dentro de la pantalla. */
export function visibleRect(rect: Rect, viewport: Size): Rect {
  const left = clamp(rect.left, 0, viewport.width);
  const top = clamp(rect.top, 0, viewport.height);
  const right = clamp(rect.left + rect.width, 0, viewport.width);
  const bottom = clamp(rect.top + rect.height, 0, viewport.height);
  return { left, top, width: right - left, height: bottom - top };
}

/** Rectángulo resaltado: el del elemento con un poco de aire, recortado a la pantalla. */
export function spotlightRect(target: Rect, viewport: Size, padding = SPOTLIGHT_PADDING): Rect {
  return visibleRect(
    {
      top: target.top - padding,
      left: target.left - padding,
      width: target.width + padding * 2,
      height: target.height + padding * 2,
    },
    viewport,
  );
}

/**
 * Dónde poner el globo: debajo del elemento si cabe, si no encima y, si el elemento ocupa casi
 * toda la pantalla, dentro de ella (abajo o arriba, donde tape menos). Siempre queda entero a la
 * vista, también en un móvil estrecho.
 */
export function placeBalloon(
  target: Rect,
  balloon: Size,
  viewport: Size,
  options: { readonly margin?: number; readonly gap?: number } = {},
): BalloonPosition {
  const margin = options.margin ?? BALLOON_MARGIN;
  const gap = options.gap ?? BALLOON_GAP;
  const width = Math.min(balloon.width, Math.max(viewport.width - margin * 2, 0));
  const maxHeight = Math.max(viewport.height - margin * 2, 0);
  const height = Math.min(balloon.height, maxHeight);
  const seen = visibleRect(target, viewport);

  const spaceBelow = viewport.height - (seen.top + seen.height) - gap - margin;
  const spaceAbove = seen.top - gap - margin;
  const centre = seen.left + seen.width / 2;
  const left = clamp(centre - width / 2, margin, Math.max(viewport.width - width - margin, margin));
  const arrow = clamp(centre - left, ARROW_INSET, Math.max(width - ARROW_INSET, ARROW_INSET));

  if (seen.width > 0 && seen.height > 0 && height <= spaceBelow) {
    return {
      top: seen.top + seen.height + gap,
      left,
      width,
      maxHeight,
      placement: "bottom",
      arrow,
    };
  }
  if (seen.width > 0 && seen.height > 0 && height <= spaceAbove) {
    return { top: seen.top - gap - height, left, width, maxHeight, placement: "top", arrow };
  }
  // No cabe junto al elemento: se coloca en la mitad de la pantalla que el elemento deja libre.
  const targetInUpperHalf = seen.top + seen.height / 2 < viewport.height / 2;
  const top = targetInUpperHalf ? viewport.height - height - margin : margin;
  return { top: Math.max(top, margin), left, width, maxHeight, placement: "inside", arrow: null };
}

// ------------------------------------------------------------------------------ recordado

/** Lo único que se usa de `localStorage`; permite probar la lógica con una memoria falsa. */
export type TourStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const TOUR_STORAGE_PREFIX = "easyorder.guia.v1";

/** Clave por navegador (el propio `localStorage`), usuario y sección. */
export function tourKey(userId: string, section: TourSection): string {
  return `${TOUR_STORAGE_PREFIX}:${userId}:${section}`;
}

/**
 * ¿Ya vio esta persona la guía de la sección en este navegador? Si el navegador no deja guardar
 * (navegación privada), se da por vista: mejor no insistir en cada visita, y el botón «?» sigue
 * disponible.
 */
export function hasSeenTour(
  storage: TourStorage | null,
  userId: string,
  section: TourSection,
): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(tourKey(userId, section)) !== null;
  } catch {
    return true;
  }
}

export function markTourSeen(
  storage: TourStorage | null,
  userId: string,
  section: TourSection,
  now: Date = new Date(),
): void {
  if (!storage) return;
  try {
    storage.setItem(tourKey(userId, section), now.toISOString());
  } catch {
    // Sin almacenamiento: la guía no se vuelve a lanzar sola en esta visita (lo controla el panel).
  }
}

/** El `localStorage` del navegador, o null si no se puede usar. */
export function browserStorage(): TourStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Cuándo la pantalla ha terminado de cargar lo suficiente para arrancar sola la guía: hay pasos
 * visibles y el número no ha cambiado en las últimas `stable` lecturas.
 */
export function isSettled(samples: readonly number[], stable = 3): boolean {
  if (samples.length < stable) return false;
  const last = samples.slice(-stable);
  const first = last[0];
  return first !== undefined && first > 0 && last.every((value) => value === first);
}
