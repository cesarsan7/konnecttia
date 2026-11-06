import { plural } from "../alta/logic";
import type { SignupSettings, TrialAction, TrialRow } from "./types";

/** Lógica pura de «Pruebas» y «Configuración del alta» del panel interno. */

export const TRIAL_FILTER = {
  All: "todas",
  Pending: "pendientes",
  Active: "activas",
  Finished: "terminadas",
  Converted: "convertidas",
} as const;
export type TrialFilter = (typeof TRIAL_FILTER)[keyof typeof TRIAL_FILTER];

export const TRIAL_FILTER_LABEL: Record<TrialFilter, string> = {
  todas: "Todas",
  pendientes: "Pendientes",
  activas: "Activas",
  terminadas: "Terminadas",
  convertidas: "Convertidas",
};

/** Una prueba activa que ya no acepta pedidos ha vencido (por días o por pedidos). */
export const isExpired = (row: TrialRow): boolean => row.estado === "activa" && !row.acepta_pedidos;

export type TrialLabel = { readonly text: string; readonly tone: "ok" | "warn" | "off" };

export function trialLabel(row: TrialRow): TrialLabel {
  if (row.estado === "pendiente") return { text: "Pendiente de aprobación", tone: "warn" };
  if (row.estado === "rechazada") return { text: "Rechazada", tone: "off" };
  if (row.estado === "convertida") return { text: "Convertida", tone: "ok" };
  return isExpired(row) ? { text: "Vencida", tone: "off" } : { text: "Activa", tone: "ok" };
}

/** Terminada = vencida o rechazada: ya no acepta pedidos y no se ha convertido. */
export function filterTrials(rows: readonly TrialRow[], filter: TrialFilter): TrialRow[] {
  switch (filter) {
    case TRIAL_FILTER.Pending:
      return rows.filter((row) => row.estado === "pendiente");
    case TRIAL_FILTER.Active:
      return rows.filter((row) => row.estado === "activa" && row.acepta_pedidos);
    case TRIAL_FILTER.Finished:
      return rows.filter((row) => row.estado === "rechazada" || isExpired(row));
    case TRIAL_FILTER.Converted:
      return rows.filter((row) => row.estado === "convertida");
    default:
      return [...rows];
  }
}

/** Cuántas pruebas hay en cada filtro (para el contador de las pestañas). */
export function filterCounts(rows: readonly TrialRow[]): Record<TrialFilter, number> {
  return {
    todas: rows.length,
    pendientes: filterTrials(rows, TRIAL_FILTER.Pending).length,
    activas: filterTrials(rows, TRIAL_FILTER.Active).length,
    terminadas: filterTrials(rows, TRIAL_FILTER.Finished).length,
    convertidas: filterTrials(rows, TRIAL_FILTER.Converted).length,
  };
}

/** Consumo de la prueba: «12 de 50 pedidos · 5 días restantes», o «sin límites». */
export function usageText(row: TrialRow): string {
  if (row.estado === "convertida") return "Sin límites de prueba";
  const parts: string[] = [];
  parts.push(
    row.max_pedidos === null
      ? `${plural(row.pedidos_usados, "pedido", "pedidos")} (sin límite)`
      : `${row.pedidos_usados} de ${plural(row.max_pedidos, "pedido", "pedidos")}`,
  );
  if (row.dias_restantes !== null) {
    parts.push(
      row.estado === "pendiente"
        ? "los días empiezan al aprobarla"
        : row.dias_restantes === 0
          ? "plazo agotado"
          : `${plural(row.dias_restantes, "día restante", "días restantes")}`,
    );
  }
  return parts.join(" · ");
}

export type ExtensionResult =
  | { readonly ok: true; readonly body: Extract<TrialAction, { accion: "ampliar" }> }
  | { readonly ok: false; readonly error: string };

const WHOLE = /^\d+$/;

/** Valida «Ampliar»: enteros ≥ 1, al menos uno, y solo sobre un límite que la prueba tiene. */
export function parseExtension(
  daysText: string,
  ordersText: string,
  row: Pick<TrialRow, "fin" | "max_pedidos">,
): ExtensionResult {
  const days = daysText.trim();
  const orders = ordersText.trim();
  if (!days && !orders) return { ok: false, error: "Escribe cuántos días o pedidos añadir." };
  const body: { accion: "ampliar"; dias?: number; pedidos?: number } = { accion: "ampliar" };
  if (days) {
    if (!WHOLE.test(days) || Number(days) < 1 || Number(days) > 3650) {
      return { ok: false, error: "Los días deben ser un número entero entre 1 y 3650." };
    }
    if (row.fin === null) return { ok: false, error: "Esta prueba no tiene límite de días." };
    body.dias = Number(days);
  }
  if (orders) {
    if (!WHOLE.test(orders) || Number(orders) < 1 || Number(orders) > 1_000_000) {
      return { ok: false, error: "Los pedidos deben ser un número entero mayor que 0." };
    }
    if (row.max_pedidos === null) {
      return { ok: false, error: "Esta prueba no tiene límite de pedidos." };
    }
    body.pedidos = Number(orders);
  }
  return { ok: true, body };
}

const TRIAL_REASONS: Record<string, string> = {
  invalid_state: "La prueba ya no está en un estado que permita esa acción. Recarga la lista.",
  no_day_limit: "Esta prueba no tiene límite de días.",
  no_order_limit: "Esta prueba no tiene límite de pedidos.",
};

/** Mensaje para un error de las acciones sobre pruebas; null si no es uno de ellos. */
export function trialReasonMessage(reason: string | undefined): string | null {
  return (reason && TRIAL_REASONS[reason]) || null;
}

// ------------------------------------------------------------------ configuración del alta

/** Valores de los campos del formulario (texto, como los escribe la persona). */
export type SettingsDraft = {
  readonly activa: boolean;
  readonly aprobacion: boolean;
  readonly dias: string;
  readonly maxPedidos: string;
  readonly contacto: string;
};

export function toDraft(settings: SignupSettings): SettingsDraft {
  return {
    activa: settings.alta_autoservicio_activa,
    aprobacion: settings.alta_requiere_aprobacion,
    dias: settings.prueba_dias === null ? "" : String(settings.prueba_dias),
    maxPedidos: settings.prueba_max_pedidos === null ? "" : String(settings.prueba_max_pedidos),
    contacto: settings.alta_contacto_email ?? "",
  };
}

export type SettingsErrors = Partial<Record<"dias" | "maxPedidos" | "contacto", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Vacío = sin límite (null). Devuelve el número, null, o undefined si no es válido. */
function limit(text: string, max: number): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!WHOLE.test(value)) return undefined;
  const number = Number(value);
  return number >= 1 && number <= max ? number : undefined;
}

export type SettingsParsed =
  | { readonly ok: true; readonly values: SignupSettings }
  | { readonly ok: false; readonly errors: SettingsErrors };

/** Valida el formulario y lo convierte en los valores de `plataforma_config`. */
export function parseDraft(draft: SettingsDraft): SettingsParsed {
  const errors: { -readonly [K in keyof SettingsErrors]: string } = {};
  const dias = limit(draft.dias, 3650);
  const maxPedidos = limit(draft.maxPedidos, 1_000_000);
  if (dias === undefined) errors.dias = "Un número entero entre 1 y 3650, o vacío para no limitar.";
  if (maxPedidos === undefined) {
    errors.maxPedidos = "Un número entero mayor que 0, o vacío para no limitar.";
  }
  const contacto = draft.contacto.trim().toLowerCase();
  if (contacto && (!EMAIL.test(contacto) || contacto.length > 255)) {
    errors.contacto = "Escribe un email válido, o déjalo vacío.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      alta_autoservicio_activa: draft.activa,
      alta_requiere_aprobacion: draft.aprobacion,
      prueba_dias: dias ?? null,
      prueba_max_pedidos: maxPedidos ?? null,
      alta_contacto_email: contacto || null,
    },
  };
}

/** Solo lo que cambió respecto a lo guardado (la API admite cambios parciales). */
export function changedSettings(
  saved: SignupSettings,
  values: SignupSettings,
): Partial<SignupSettings> {
  const changes: { -readonly [K in keyof SignupSettings]?: SignupSettings[K] } = {};
  for (const key of Object.keys(values) as (keyof SignupSettings)[]) {
    if (saved[key] !== values[key]) Object.assign(changes, { [key]: values[key] });
  }
  return changes;
}
