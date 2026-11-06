"use client";

import "./tour.css";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  placeBalloon,
  type Rect,
  type Size,
  spotlightRect,
  stepIndexFrom,
  stepLabel,
  type TourStep,
} from "@/lib/tour/tour";
import { findTourTarget, rectOf, stepExists } from "./dom";

type Props = {
  /** Pasos cuyo elemento existe al arrancar, en su orden. */
  readonly steps: readonly TourStep[];
  /** Nombre de la pantalla, para el enlace a la ayuda. */
  readonly label: string;
  readonly helpHref: string;
  readonly onClose: () => void;
};

const FOCUSABLE = "button:not(:disabled), a[href]";
/** Un elemento más alto que esta parte de la pantalla se muestra desde su principio. */
const TALL_SHARE = 0.6;

/**
 * Guía paso a paso: oscurece la pantalla salvo el elemento señalado y enseña un globo con título,
 * texto corto y «Anterior / Siguiente / Saltar». Accesible: el foco queda dentro del globo, Esc lo
 * cierra, las flechas avanzan y cada paso se anuncia con `aria-live`. Un paso cuyo elemento ya no
 * existe se salta.
 */
export function Tour({ steps, label, helpHref, onClose }: Props) {
  const ids = useId();
  const titleId = `${ids}-titulo`;
  const bodyId = `${ids}-texto`;
  const balloon = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const direction = useRef<1 | -1>(1);
  const [index, setIndex] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [recheck, setRecheck] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [announcement, setAnnouncement] = useState("");

  const step = steps[index];
  const total = steps.length;
  const last = stepIndexFrom(steps, index + 1, 1, stepExists) === null;
  const first = stepIndexFrom(steps, index - 1, -1, stepExists) === null;

  // El foco vuelve a donde estaba al cerrar la guía.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  // Localiza el elemento del paso; si no existe, salta al siguiente en la dirección que se lleva.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `recheck` fuerza una nueva búsqueda
  useEffect(() => {
    if (!step) return;
    const found = findTourTarget(step.target);
    if (!found) {
      const way = direction.current;
      const next =
        stepIndexFrom(steps, index + way, way, stepExists) ??
        stepIndexFrom(steps, index - way, way === 1 ? -1 : 1, stepExists);
      if (next === null) onClose();
      else setIndex(next);
      return;
    }
    const box = found.getBoundingClientRect();
    found.scrollIntoView({
      block: box.height > window.innerHeight * TALL_SHARE ? "start" : "center",
      inline: "nearest",
    });
    setElement(found);
  }, [step, index, steps, onClose, recheck]);

  // Mantiene el foco sobre el elemento aunque cambie el scroll, el tamaño o la pantalla.
  useEffect(() => {
    if (!element) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!element.isConnected) {
        setElement(null);
        setRecheck((count) => count + 1);
        return;
      }
      setRect(rectOf(element));
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(element);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer?.disconnect();
    };
  }, [element]);

  // Mide el globo para colocarlo (su alto cambia con el texto de cada paso).
  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve a medir al cambiar de paso o de pantalla
  useLayoutEffect(() => {
    const node = balloon.current;
    if (node) setSize({ width: node.offsetWidth, height: node.offsetHeight });
  }, [index, viewport.width, viewport.height, rect !== null]);

  const go = useCallback(
    (way: 1 | -1) => {
      direction.current = way;
      const next = stepIndexFrom(steps, index + way, way, stepExists);
      if (next === null) {
        if (way === 1) onClose();
        return;
      }
      setRect(null);
      setIndex(next);
    },
    [steps, index, onClose],
  );

  // Anuncia el paso nuevo a los lectores de pantalla (el primero lo lee el propio diálogo).
  const announced = useRef(false);
  useEffect(() => {
    if (!step) return;
    if (!announced.current) {
      announced.current = true;
      return;
    }
    setAnnouncement(`${stepLabel(index, total)}. ${step.title}. ${step.body}`);
  }, [step, index, total]);

  // El foco empieza en el botón principal, sin mover la página.
  const positioned = rect !== null && size.width > 0;
  useEffect(() => {
    if (positioned && !balloon.current?.contains(document.activeElement)) {
      primary.current?.focus({ preventScroll: true });
    }
  }, [positioned]);

  // Teclado: Esc cierra, las flechas avanzan y Tab no sale del globo.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key !== "Tab" || !balloon.current) return;
      const items = Array.from(balloon.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const inside = balloon.current.contains(active);
      if (event.shiftKey && (active === firstItem || !inside)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !inside)) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  if (!step) return null;

  const spot = rect ? spotlightRect(rect, viewport) : null;
  const place = rect && size.width > 0 ? placeBalloon(rect, size, viewport) : null;
  const style: CSSProperties = place
    ? ({
        top: place.top,
        left: place.left,
        "--tour-arrow": place.arrow === null ? undefined : `${place.arrow}px`,
      } as CSSProperties)
    : { visibility: "hidden" };

  return (
    <div className="k-tour">
      <div className="k-tour-backdrop" aria-hidden="true" />
      {spot && spot.width > 0 && spot.height > 0 ? (
        <div
          className="k-tour-spot"
          aria-hidden="true"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      ) : null}
      <div
        ref={balloon}
        className={`k-tour-balloon${place ? ` is-${place.placement}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={style}
      >
        <div className="k-tour-card" style={place ? { maxHeight: place.maxHeight } : undefined}>
          <div className="k-tour-meta">
            <p className="k-tour-count">{stepLabel(index, total)}</p>
            <span className="k-tour-dots" aria-hidden="true">
              {steps.map((item, position) => (
                <i
                  key={item.target}
                  className={position === index ? "is-current" : position < index ? "is-done" : ""}
                />
              ))}
            </span>
          </div>
          <h2 id={titleId} className="k-tour-title">
            {step.title}
          </h2>
          <p id={bodyId} className="k-tour-body">
            {step.body}
          </p>
          <a className="k-tour-help" href={helpHref} target="_blank" rel="noreferrer">
            Más sobre {label} en la ayuda
          </a>
          <div className="k-tour-actions">
            {last ? (
              <span />
            ) : (
              <button type="button" className="k-link k-small k-tour-skip" onClick={onClose}>
                Saltar
              </button>
            )}
            <span className="k-tour-nav">
              <button
                type="button"
                className="k-btn k-btn-secondary k-btn-sm"
                disabled={first}
                onClick={() => go(-1)}
              >
                Anterior
              </button>
              <button
                ref={primary}
                type="button"
                className="k-btn k-btn-primary k-btn-sm"
                onClick={() => go(1)}
              >
                {last ? "Entendido" : "Siguiente"}
              </button>
            </span>
          </div>
        </div>
        <p className="k-sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>
  );
}
