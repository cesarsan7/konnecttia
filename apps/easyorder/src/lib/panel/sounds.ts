import {
  BOARD_SOUND,
  BOARD_SOUND_EVENTS,
  type BoardSound,
  type BoardSoundEvent,
  type BoardSounds,
  isBoardSoundEvent,
} from "@konnecttia/domain";
import type { PanelOrder } from "./types";

export const SOUND_LABEL: Readonly<Record<BoardSound, string>> = {
  ninguno: "Sin sonido",
  campana: "Campana (dos notas, dos veces)",
  timbre: "Timbre (una nota)",
  arpegio: "Arpegio (tres notas ascendentes)",
  alerta: "Alerta (pitido rápido)",
  suave: "Suave (una nota grave)",
};

export const EVENT_LABEL: Readonly<Record<BoardSoundEvent, string>> = {
  nuevo: "Pedido nuevo",
  confirmado: "Aceptado",
  en_preparacion: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const EVENT_HINT: Readonly<Record<BoardSoundEvent, string>> = {
  nuevo: "Llega un pedido que espera aceptación (web, WhatsApp o mesa).",
  confirmado: "Otra persona acepta un pedido.",
  en_preparacion: "Otra persona lo pasa a preparación.",
  listo: "Otra persona lo marca como listo.",
  en_camino: "Un repartidor sale con el pedido.",
  entregado: "Se entrega el pedido.",
  cancelado: "Se cancela un pedido (por el cliente o por otra persona).",
};

export type Tone = {
  readonly freq: number;
  /** Segundos desde el inicio. */
  readonly at: number;
  readonly dur: number;
  readonly gain: number;
  readonly type: OscillatorType;
};

/** Cada sonido son notas sintetizadas: no hay archivos de audio que cargar. */
export const SOUND_TONES: Readonly<Record<BoardSound, readonly Tone[]>> = {
  ninguno: [],
  // El de siempre: dos tonos ascendentes, dos veces.
  campana: [0, 0.18, 0.6, 0.78].map((at, index) => ({
    freq: index % 2 === 0 ? 880 : 1320,
    at,
    dur: 0.32,
    gain: 0.35,
    type: "sine" as const,
  })),
  timbre: [{ freq: 1046, at: 0, dur: 0.6, gain: 0.35, type: "sine" }],
  arpegio: [
    { freq: 523, at: 0, dur: 0.25, gain: 0.3, type: "triangle" },
    { freq: 659, at: 0.15, dur: 0.25, gain: 0.3, type: "triangle" },
    { freq: 784, at: 0.3, dur: 0.45, gain: 0.3, type: "triangle" },
  ],
  alerta: [0, 0.14, 0.28].map((at) => ({
    freq: 1760,
    at,
    dur: 0.09,
    gain: 0.3,
    type: "square" as const,
  })),
  suave: [{ freq: 440, at: 0, dur: 0.7, gain: 0.3, type: "sine" }],
};

/**
 * Cambios de estado respecto a la carga anterior (pedidos que ya estaban y ahora están en otro
 * estado). `own` son los cambios que acaba de hacer esta misma persona: no suenan.
 */
export function statusChanges(
  previous: ReadonlyMap<number, string> | null,
  orders: readonly PanelOrder[],
  own: ReadonlyMap<number, string>,
): BoardSoundEvent[] {
  if (previous === null) return [];
  const events: BoardSoundEvent[] = [];
  for (const order of orders) {
    const before = previous.get(order.id);
    if (before === undefined || before === order.estado) continue;
    if (own.get(order.id) === order.estado) continue;
    if (isBoardSoundEvent(order.estado) && order.estado !== "nuevo") events.push(order.estado);
  }
  return events;
}

/**
 * Qué suena en una carga: el pedido nuevo manda sobre los cambios de estado; si no hay, el
 * primer cambio con sonido configurado. Uno solo por carga, para no montar un ruido.
 */
export function soundToPlay(
  hasArrival: boolean,
  changes: readonly BoardSoundEvent[],
  sounds: BoardSounds,
): BoardSound | null {
  const events: BoardSoundEvent[] = [...(hasArrival ? (["nuevo"] as const) : []), ...changes];
  for (const event of events) {
    if (sounds[event] !== BOARD_SOUND.None) return sounds[event];
  }
  return null;
}

export const SOUND_EVENTS = BOARD_SOUND_EVENTS;
