import { describe, expect, it } from "vitest";
import {
  BOARD_SOUND,
  DEFAULT_BOARD_SOUNDS,
  parseBoardSounds,
  serializeBoardSounds,
} from "./board-sounds";

describe("sonidos del tablero", () => {
  it("sin configurar solo suena el pedido nuevo", () => {
    expect(parseBoardSounds(null)).toEqual(DEFAULT_BOARD_SOUNDS);
    expect(DEFAULT_BOARD_SOUNDS.nuevo).toBe(BOARD_SOUND.Bell);
    expect(DEFAULT_BOARD_SOUNDS.listo).toBe(BOARD_SOUND.None);
  });

  it("lee el JSON guardado y rellena lo que falta", () => {
    const sounds = parseBoardSounds('{"listo":"arpegio","nuevo":"alerta"}');
    expect(sounds.listo).toBe("arpegio");
    expect(sounds.nuevo).toBe("alerta");
    expect(sounds.cancelado).toBe("ninguno");
  });

  it("ignora JSON roto, claves desconocidas y sonidos que no existen", () => {
    expect(parseBoardSounds("{no es json")).toEqual(DEFAULT_BOARD_SOUNDS);
    expect(parseBoardSounds("[]")).toEqual(DEFAULT_BOARD_SOUNDS);
    expect(parseBoardSounds('{"listo":"explosion","otro":"campana"}')).toEqual(
      DEFAULT_BOARD_SOUNDS,
    );
  });

  it("guarda el conjunto completo, o nada si es el de por defecto", () => {
    expect(serializeBoardSounds({})).toBeNull();
    expect(serializeBoardSounds({ nuevo: "campana" })).toBeNull();
    const saved = serializeBoardSounds({ listo: "suave" });
    expect(JSON.parse(saved ?? "{}")).toMatchObject({ listo: "suave", nuevo: "campana" });
  });
});
