"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { niceTicks } from "@/lib/panel/stats";

/** Ancho real del contenedor, para dibujar el SVG a escala 1:1 (texto nítido, sin deformar). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export type ColumnDatum = {
  readonly key: string;
  /** Etiqueta del eje X. */
  readonly label: string;
  readonly value: number;
  /** Contenido del tooltip. */
  readonly tooltip: ReactNode;
};

type ColumnChartProps = {
  readonly data: readonly ColumnDatum[];
  readonly formatTick: (value: number) => string;
  /** Resumen para lectores de pantalla. */
  readonly label: string;
  /** Columna destacada con su valor encima (p. ej. la hora punta). */
  readonly highlightKey?: string | null;
  readonly formatHighlight?: (value: number) => string;
  readonly height?: number;
};

const PAD = { top: 24, right: 8, bottom: 28, left: 52 };
const MAX_BAR = 24;
const MIN_LABEL_GAP = 44;

/**
 * Columnas de una sola serie: barras finas con el extremo redondeado, rejilla tenue y tooltip
 * al pasar el ratón o el dedo.
 */
export function ColumnChart({
  data,
  formatTick,
  label,
  highlightKey = null,
  formatHighlight,
  height = 220,
}: ColumnChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((datum) => datum.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const band = data.length > 0 ? plotW / data.length : 0;
  const bar = Math.max(2, Math.min(MAX_BAR, band * 0.62));
  const every = Math.max(1, Math.ceil(MIN_LABEL_GAP / Math.max(band, 1)));
  const y = (value: number) => PAD.top + plotH - (top > 0 ? (value / top) * plotH : 0);
  const hovered = hover === null ? null : data[hover];

  return (
    <div ref={ref} className="k-chart" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="k-grid"
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text className="k-axis" x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {data.map((datum, index) => {
            const cx = PAD.left + band * index + band / 2;
            const h = Math.max(0, PAD.top + plotH - y(datum.value));
            const r = Math.min(4, bar / 2, h);
            const x0 = cx - bar / 2;
            const yTop = PAD.top + plotH - h;
            // Extremo superior redondeado, base recta.
            const path =
              h > 0
                ? `M${x0},${PAD.top + plotH}V${yTop + r}Q${x0},${yTop} ${x0 + r},${yTop}H${x0 + bar - r}Q${x0 + bar},${yTop} ${x0 + bar},${yTop + r}V${PAD.top + plotH}Z`
                : "";
            const isHighlight = datum.key === highlightKey;
            return (
              <g key={datum.key}>
                {path ? (
                  <path
                    d={path}
                    className={`k-bar${hover === index ? " is-hover" : ""}${hover !== null && hover !== index ? " is-dim" : ""}`}
                  />
                ) : null}
                {isHighlight && formatHighlight && h > 0 ? (
                  <text className="k-bar-label" x={cx} y={yTop - 8} textAnchor="middle">
                    {formatHighlight(datum.value)}
                  </text>
                ) : null}
                {index % every === 0 ? (
                  <text className="k-axis" x={cx} y={height - PAD.bottom + 18} textAnchor="middle">
                    {datum.label}
                  </text>
                ) : null}
                {/* Zona sensible: toda la franja, más grande que la barra. */}
                <rect
                  x={PAD.left + band * index}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setHover(index)}
                  onPointerDown={() => setHover(index)}
                />
              </g>
            );
          })}
          <line
            className="k-baseline"
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
          />
        </svg>
      ) : null}
      {hovered && hover !== null ? (
        <div
          className="k-tooltip"
          style={{
            left: Math.min(
              Math.max(PAD.left + band * hover + band / 2, 80),
              Math.max(width - 80, 80),
            ),
            top: Math.max(y(hovered.value) - 12, 8),
          }}
        >
          {hovered.tooltip}
        </div>
      ) : null}
    </div>
  );
}

type BarListProps = {
  readonly rows: readonly {
    readonly label: string;
    readonly value: number;
    readonly detail: string;
  }[];
  readonly formatValue: (value: number) => string;
};

/** Ranking en barras horizontales: una sola serie, valor al final de la barra. */
export function BarList({ rows, formatValue }: BarListProps) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ol className="k-barlist">
      {rows.map((row, index) => (
        <li key={row.label} title={row.detail}>
          <span className="k-barlist-rank">{index + 1}</span>
          <span className="k-barlist-label">{row.label}</span>
          <span className="k-barlist-track" aria-hidden="true">
            <span className="k-barlist-fill" style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="k-barlist-value">
            {formatValue(row.value)}
            <span className="k-muted k-small">{row.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type SegmentedBarProps = {
  readonly label: string;
  readonly parts: readonly {
    readonly name: string;
    readonly value: number;
    readonly slot: 1 | 2 | 3;
  }[];
};

/** Un total dividido en partes (p. ej. recogida frente a reparto), con su porcentaje dentro. */
export function SegmentedBar({ label, parts }: SegmentedBarProps) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const visible = parts.filter((part) => part.value > 0);
  const share = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const summary = parts
    .map((part) => `${part.name}: ${part.value} (${share(part.value)} %)`)
    .join(", ");
  return (
    <figure className="k-seg">
      <figcaption className="k-seg-title">{label}</figcaption>
      {total === 0 ? (
        <p className="k-muted k-small">Sin pedidos en el periodo.</p>
      ) : (
        <>
          <div className="k-seg-bar" role="img" aria-label={`${label}. ${summary}`}>
            {visible.map((part) => (
              <span
                key={part.name}
                className={`k-seg-part k-slot-${part.slot}`}
                style={{ flexGrow: part.value }}
                title={`${part.name}: ${part.value} pedidos (${share(part.value)} %)`}
              >
                {share(part.value) >= 12 ? `${share(part.value)} %` : ""}
              </span>
            ))}
          </div>
          <ul className="k-legend">
            {parts.map((part) => (
              <li key={part.name}>
                <span className={`k-swatch k-slot-${part.slot}`} aria-hidden="true" />
                {part.name} <span className="k-muted">· {part.value}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}
