/** Parámetros del agente de WhatsApp (ADR 0013): forma que devuelve la API y su edición. */

export type AgentParam = {
  readonly clave: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly tipo: string;
  readonly unidad: string | null;
  readonly minimo: number | null;
  readonly maximo: number | null;
  readonly opciones: readonly string[] | null;
  readonly nivel: "basico" | "premium";
  readonly editable_por?: "restaurante" | "interno";
  readonly bloqueado?: boolean;
  /** Valor efectivo (en la plantilla: el de la plantilla). */
  readonly valor: string | null;
  readonly valor_plantilla?: string | null;
  readonly origen?: "propio" | "plantilla" | "sin_valor";
  /** Solo en la plantilla: cuántos restaurantes lo personalizan. */
  readonly personalizan?: number;
};

export type ParamDraft = string | boolean | string[];

const OPTION_LABEL: Readonly<Record<string, string>> = {
  cercano: "Cercano",
  formal: "Formal",
  confirmado: "Pedido aceptado",
  en_preparacion: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export const optionLabel = (option: string) => OPTION_LABEL[option] ?? option;

/** Texto largo (área de texto) en vez de una línea. */
export function isLongText(param: AgentParam): boolean {
  return param.tipo !== "entero" && (param.maximo === null || param.maximo > 100);
}

export function toDraft(param: AgentParam): ParamDraft {
  const raw = param.valor ?? "";
  if (param.tipo === "booleano") return raw === "true";
  if (param.tipo === "json") {
    try {
      const parsed: unknown = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return raw;
}

const sameDraft = (a: ParamDraft, b: ParamDraft) => JSON.stringify(a) === JSON.stringify(b);

export type DraftResult =
  | { readonly ok: true; readonly changes: Record<string, unknown> }
  | { readonly ok: false; readonly clave: string; readonly message: string };

/** Cambios respecto a lo cargado, ya con el tipo que espera la API; o el primer error. */
export function draftChanges(
  params: readonly AgentParam[],
  drafts: Readonly<Record<string, ParamDraft>>,
): DraftResult {
  const changes: Record<string, unknown> = {};
  for (const param of params) {
    const draft = drafts[param.clave];
    if (draft === undefined || sameDraft(draft, toDraft(param))) continue;
    if (param.tipo === "entero") {
      const text = String(draft).trim();
      const number = Number(text);
      if (text === "" || !Number.isInteger(number)) {
        return { ok: false, clave: param.clave, message: "Escribe un número entero." };
      }
      if (param.minimo !== null && number < param.minimo) {
        return { ok: false, clave: param.clave, message: `El mínimo es ${param.minimo}.` };
      }
      if (param.maximo !== null && number > param.maximo) {
        return { ok: false, clave: param.clave, message: `El máximo es ${param.maximo}.` };
      }
      changes[param.clave] = number;
    } else {
      changes[param.clave] = draft;
    }
  }
  return { ok: true, changes };
}

const REASON: Readonly<Record<string, string>> = {
  invalid_value: "Valor no válido.",
  out_of_range: "Fuera del rango permitido.",
  invalid_email: "Correo no válido.",
  too_long: "Demasiado largo.",
  unknown_param: "Parámetro no editable.",
  module_required: "Requiere el módulo Agente Pro.",
};

export function agentParamError(body: { reason?: string; field?: string } | null): string {
  const reason = body?.reason
    ? (REASON[body.reason] ?? "No se pudo guardar.")
    : "No se pudo guardar.";
  return body?.field ? `${body.field}: ${reason}` : reason;
}
