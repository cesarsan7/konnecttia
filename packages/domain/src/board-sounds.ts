/**
 * Sonidos del tablero de pedidos: qué suena en cada evento (pedido nuevo o cambio de estado).
 * Los guarda el restaurante en `restaurante_config.sonidos_tablero` (JSON) y los reproduce el
 * navegador con tonos sintetizados, sin archivos de audio.
 */

export const BOARD_SOUND = {
  None: "ninguno",
  Bell: "campana",
  Chime: "timbre",
  Arpeggio: "arpegio",
  Alert: "alerta",
  Soft: "suave",
} as const;
export type BoardSound = (typeof BOARD_SOUND)[keyof typeof BOARD_SOUND];
export const BOARD_SOUNDS: readonly BoardSound[] = Object.values(BOARD_SOUND);

/** Eventos con sonido: el pedido nuevo y los estados que el tablero ve cambiar. */
export const BOARD_SOUND_EVENTS = [
  "nuevo",
  "confirmado",
  "en_preparacion",
  "listo",
  "en_camino",
  "entregado",
  "cancelado",
] as const;
export type BoardSoundEvent = (typeof BOARD_SOUND_EVENTS)[number];

export type BoardSounds = Readonly<Record<BoardSoundEvent, BoardSound>>;

/** Sin configurar suena solo el pedido nuevo, igual que antes de existir esta opción. */
export const DEFAULT_BOARD_SOUNDS: BoardSounds = {
  nuevo: BOARD_SOUND.Bell,
  confirmado: BOARD_SOUND.None,
  en_preparacion: BOARD_SOUND.None,
  listo: BOARD_SOUND.None,
  en_camino: BOARD_SOUND.None,
  entregado: BOARD_SOUND.None,
  cancelado: BOARD_SOUND.None,
};

export const isBoardSound = (value: unknown): value is BoardSound =>
  typeof value === "string" && (BOARD_SOUNDS as readonly string[]).includes(value);

export const isBoardSoundEvent = (value: unknown): value is BoardSoundEvent =>
  typeof value === "string" && (BOARD_SOUND_EVENTS as readonly string[]).includes(value);

/** Lee el JSON guardado. Tolerante: lo que falte o no sea válido usa el valor por defecto. */
export function parseBoardSounds(raw: string | null | undefined): BoardSounds {
  if (!raw) return DEFAULT_BOARD_SOUNDS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_BOARD_SOUNDS;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_BOARD_SOUNDS;
  const source = parsed as Record<string, unknown>;
  const result = { ...DEFAULT_BOARD_SOUNDS } as Record<BoardSoundEvent, BoardSound>;
  for (const event of BOARD_SOUND_EVENTS) {
    const value = source[event];
    if (isBoardSound(value)) result[event] = value;
  }
  return result;
}

/** Lo que se guarda: el conjunto completo, o null si es el de por defecto (se borra la clave). */
export function serializeBoardSounds(
  sounds: Partial<Record<BoardSoundEvent, BoardSound>>,
): string | null {
  const full = { ...DEFAULT_BOARD_SOUNDS, ...sounds };
  const same = BOARD_SOUND_EVENTS.every((event) => full[event] === DEFAULT_BOARD_SOUNDS[event]);
  return same ? null : JSON.stringify(full);
}
