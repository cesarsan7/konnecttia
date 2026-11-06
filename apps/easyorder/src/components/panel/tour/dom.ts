import type { Rect, TourStep } from "@/lib/tour/tour";

/** Atributo con el que los componentes del panel marcan lo que la guía puede señalar. */
export const TOUR_ATTRIBUTE = "data-tour";

/** ¿Se ve el elemento? (con tamaño, no oculto por CSS). */
function isShown(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && window.getComputedStyle(node).visibility !== "hidden";
}

/** El primer elemento visible marcado con `data-tour="<target>"`, o null si no hay ninguno. */
export function findTourTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[${TOUR_ATTRIBUTE}="${target}"]`);
  for (const node of nodes) {
    if (isShown(node)) return node;
  }
  return null;
}

export function stepExists(step: TourStep): boolean {
  return findTourTarget(step.target) !== null;
}

export function rectOf(node: HTMLElement): Rect {
  const box = node.getBoundingClientRect();
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}
