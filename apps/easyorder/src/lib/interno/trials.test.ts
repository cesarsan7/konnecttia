import { describe, expect, it } from "vitest";
import {
  changedSettings,
  filterCounts,
  filterTrials,
  parseDraft,
  parseExtension,
  TRIAL_FILTER,
  toDraft,
  trialLabel,
  trialReasonMessage,
  usageText,
} from "./trials";
import type { SignupSettings, TrialRow } from "./types";

const row = (overrides: Partial<TrialRow> = {}): TrialRow => ({
  restaurante_id: 1,
  nombre: "Bar Uno",
  slug: "bar-uno",
  plan: "prueba",
  email: "uno@test.local",
  estado: "activa",
  inicio: "2026-11-01T10:00:00.000Z",
  fin: "2026-11-15T10:00:00.000Z",
  max_pedidos: 50,
  pedidos_usados: 12,
  dias_restantes: 5,
  pedidos_restantes: 38,
  acepta_pedidos: true,
  ...overrides,
});

const pending = row({ restaurante_id: 2, estado: "pendiente", acepta_pedidos: false });
const expired = row({ restaurante_id: 3, acepta_pedidos: false, dias_restantes: 0 });
const rejected = row({ restaurante_id: 4, estado: "rechazada", acepta_pedidos: false });
const converted = row({ restaurante_id: 5, estado: "convertida" });
const active = row({ restaurante_id: 6 });
const all = [pending, expired, rejected, converted, active];

describe("pruebas: estado y filtros", () => {
  it("etiqueta cada estado; una activa sin pedidos es «vencida»", () => {
    expect(trialLabel(active)).toEqual({ text: "Activa", tone: "ok" });
    expect(trialLabel(expired)).toEqual({ text: "Vencida", tone: "off" });
    expect(trialLabel(pending).tone).toBe("warn");
    expect(trialLabel(rejected).text).toBe("Rechazada");
    expect(trialLabel(converted).text).toBe("Convertida");
  });

  it("filtra y cuenta", () => {
    const ids = (filter: Parameters<typeof filterTrials>[1]) =>
      filterTrials(all, filter).map((r) => r.restaurante_id);
    expect(ids(TRIAL_FILTER.All)).toEqual([2, 3, 4, 5, 6]);
    expect(ids(TRIAL_FILTER.Pending)).toEqual([2]);
    expect(ids(TRIAL_FILTER.Active)).toEqual([6]);
    expect(ids(TRIAL_FILTER.Finished)).toEqual([3, 4]);
    expect(ids(TRIAL_FILTER.Converted)).toEqual([5]);
    expect(filterCounts(all)).toEqual({
      todas: 5,
      pendientes: 1,
      activas: 1,
      terminadas: 2,
      convertidas: 1,
    });
  });
});

describe("pruebas: consumo", () => {
  it("pedidos usados y días restantes", () => {
    expect(usageText(active)).toBe("12 de 50 pedidos · 5 días restantes");
    expect(usageText(row({ dias_restantes: 1, max_pedidos: 1, pedidos_usados: 0 }))).toBe(
      "0 de 1 pedido · 1 día restante",
    );
    expect(usageText(expired)).toBe("12 de 50 pedidos · plazo agotado");
  });

  it("sin límites y pendientes", () => {
    expect(usageText(row({ fin: null, dias_restantes: null, max_pedidos: null }))).toBe(
      "12 pedidos (sin límite)",
    );
    expect(usageText(pending)).toContain("los días empiezan al aprobarla");
    expect(usageText(converted)).toBe("Sin límites de prueba");
  });
});

describe("pruebas: ampliar", () => {
  it("valida enteros y exige al menos un valor", () => {
    expect(parseExtension("", "", active).ok).toBe(false);
    expect(parseExtension("7", "", active)).toEqual({
      ok: true,
      body: { accion: "ampliar", dias: 7 },
    });
    expect(parseExtension("", "20", active)).toEqual({
      ok: true,
      body: { accion: "ampliar", pedidos: 20 },
    });
    expect(parseExtension(" 7 ", " 20 ", active)).toEqual({
      ok: true,
      body: { accion: "ampliar", dias: 7, pedidos: 20 },
    });
    for (const bad of ["0", "-3", "1.5", "abc", "4000"]) {
      expect(parseExtension(bad, "", active).ok, bad).toBe(false);
    }
    expect(parseExtension("", "0", active).ok).toBe(false);
  });

  it("no amplía un límite que la prueba no tiene", () => {
    const noDays = parseExtension("3", "", { fin: null, max_pedidos: 10 });
    expect(noDays).toEqual({ ok: false, error: "Esta prueba no tiene límite de días." });
    const noOrders = parseExtension("", "3", {
      fin: "2026-11-15T10:00:00.000Z",
      max_pedidos: null,
    });
    expect(noOrders.ok).toBe(false);
  });

  it("textos para los motivos de la API", () => {
    expect(trialReasonMessage("invalid_state")).toMatch(/Recarga/);
    expect(trialReasonMessage("otro")).toBeNull();
    expect(trialReasonMessage(undefined)).toBeNull();
  });
});

const saved: SignupSettings = {
  alta_autoservicio_activa: false,
  alta_requiere_aprobacion: false,
  prueba_dias: null,
  prueba_max_pedidos: null,
  alta_contacto_email: null,
};

describe("configuración del alta", () => {
  it("convierte lo guardado en campos y viceversa", () => {
    const draft = toDraft({ ...saved, prueba_dias: 14, alta_contacto_email: "hola@k.test" });
    expect(draft).toEqual({
      activa: false,
      aprobacion: false,
      dias: "14",
      maxPedidos: "",
      contacto: "hola@k.test",
    });
    expect(parseDraft(draft)).toEqual({
      ok: true,
      values: { ...saved, prueba_dias: 14, alta_contacto_email: "hola@k.test" },
    });
  });

  it("vacío es «sin límite» y el email se normaliza", () => {
    const parsed = parseDraft({
      activa: true,
      aprobacion: true,
      dias: " ",
      maxPedidos: "",
      contacto: " Hola@K.Test ",
    });
    expect(parsed).toEqual({
      ok: true,
      values: {
        alta_autoservicio_activa: true,
        alta_requiere_aprobacion: true,
        prueba_dias: null,
        prueba_max_pedidos: null,
        alta_contacto_email: "hola@k.test",
      },
    });
  });

  it("rechaza valores no válidos campo a campo", () => {
    const parsed = parseDraft({
      activa: false,
      aprobacion: false,
      dias: "0",
      maxPedidos: "abc",
      contacto: "no-es-email",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(Object.keys(parsed.errors).sort()).toEqual(["contacto", "dias", "maxPedidos"]);
    expect(parseDraft({ ...toDraft(saved), dias: "3651" }).ok, "más de 3650 días").toBe(false);
  });

  it("solo envía lo que cambió", () => {
    const values = { ...saved, alta_autoservicio_activa: true, prueba_dias: 7 };
    expect(changedSettings(saved, values)).toEqual({
      alta_autoservicio_activa: true,
      prueba_dias: 7,
    });
    expect(changedSettings(saved, saved)).toEqual({});
    // Quitar un límite (null) también es un cambio.
    expect(changedSettings({ ...saved, prueba_dias: 7 }, saved)).toEqual({ prueba_dias: null });
  });
});
