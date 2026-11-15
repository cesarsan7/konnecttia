import { DEFAULT_BOARD_SOUNDS } from "@konnecttia/domain";
import { describe, expect, it } from "vitest";
import { incidentEvents, SOUND_TONES, soundToPlay, statusChanges } from "./sounds";
import type { PanelOrder } from "./types";

const order = (id: number, estado: string) => ({ id, estado }) as PanelOrder;

describe("sonidos del tablero (navegador)", () => {
  it("la primera carga no suena", () => {
    expect(statusChanges(null, [order(1, "listo")], new Map())).toEqual([]);
  });

  it("detecta cambios de estado y no los propios", () => {
    const before = new Map([
      [1, "confirmado"],
      [2, "confirmado"],
      [3, "listo"],
    ]);
    const now = [
      order(1, "listo"),
      order(2, "en_preparacion"),
      order(3, "listo"),
      order(4, "listo"),
    ];
    expect(statusChanges(before, now, new Map())).toEqual(["listo", "en_preparacion"]);
    expect(statusChanges(before, now, new Map([[1, "listo"]]))).toEqual(["en_preparacion"]);
  });

  it("el pedido nuevo manda; si no, el primer cambio con sonido", () => {
    const sounds = { ...DEFAULT_BOARD_SOUNDS, listo: "arpegio", cancelado: "alerta" } as const;
    expect(soundToPlay(true, ["listo"], sounds)).toBe("campana");
    expect(soundToPlay(false, ["confirmado", "listo"], sounds)).toBe("arpegio");
    expect(soundToPlay(false, ["confirmado"], sounds)).toBeNull();
    expect(soundToPlay(false, [], sounds)).toBeNull();
  });

  it("«sin sonido» no suena aunque sea el evento", () => {
    const sounds = { ...DEFAULT_BOARD_SOUNDS, nuevo: "ninguno" } as const;
    expect(soundToPlay(true, [], sounds)).toBeNull();
    expect(SOUND_TONES.ninguno).toHaveLength(0);
  });
});

describe("incidentEvents", () => {
  const base = { incidencias: 1, derivaciones: 1 };
  it("no suena en la primera lectura", () => {
    expect(incidentEvents(null, base)).toEqual([]);
  });
  it("suena el evento cuyo contador sube; la derivación manda sobre la incidencia", () => {
    expect(incidentEvents(base, { incidencias: 2, derivaciones: 1 })).toEqual(["incidencia"]);
    expect(incidentEvents(base, { incidencias: 2, derivaciones: 2 })).toEqual([
      "derivacion",
      "incidencia",
    ]);
  });
  it("no suena si bajan o se mantienen", () => {
    expect(incidentEvents(base, { incidencias: 0, derivaciones: 1 })).toEqual([]);
    expect(incidentEvents(base, base)).toEqual([]);
  });
});
