import type { Sql } from "../lib/db";

/** Valor que se guarda en `restaurante_config.config_value` (varchar 500). */
const VALUE_MAX = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_KEY = "agente_derivar_email";
export const AGENT_GROUP = "agente";
export const PARAM_ORIGIN = {
  Own: "propio",
  Template: "plantilla",
  None: "sin_valor",
} as const;
export type ParamOrigin = (typeof PARAM_ORIGIN)[keyof typeof PARAM_ORIGIN];

export type ParamDef = {
  readonly clave: string;
  readonly etiqueta: string;
  readonly descripcion: string;
  readonly tipo: string;
  readonly unidad: string | null;
  readonly minimo: number | null;
  readonly maximo: number | null;
  readonly opciones: readonly string[] | null;
  /** Módulo que lo habilita (premium); null: el del agente básico. */
  readonly moduloCode: string | null;
  readonly editablePor: "restaurante" | "interno";
};

type DefRow = {
  clave: string;
  etiqueta: string | null;
  descripcion: string;
  tipo: string;
  unidad: string | null;
  minimo: string | null;
  maximo: string | null;
  opciones: string[] | null;
  modulo_code: string | null;
  editable_por: "restaurante" | "interno";
};

const toDef = (row: DefRow): ParamDef => ({
  clave: row.clave,
  etiqueta: row.etiqueta ?? row.clave,
  descripcion: row.descripcion,
  tipo: row.tipo,
  unidad: row.unidad,
  minimo: row.minimo === null ? null : Number(row.minimo),
  maximo: row.maximo === null ? null : Number(row.maximo),
  opciones: row.opciones,
  moduloCode: row.modulo_code,
  editablePor: row.editable_por,
});

/** Parámetros del agente, en el orden de la pantalla. */
export async function loadParamDefs(sql: Sql): Promise<ParamDef[]> {
  const rows = await sql<DefRow[]>`
    SELECT clave, etiqueta, descripcion, tipo, unidad, minimo::text, maximo::text, opciones,
           modulo_code, editable_por
    FROM   public.config_clave
    WHERE  grupo = ${AGENT_GROUP} AND estado = 'activa'
    ORDER  BY orden NULLS LAST, clave
  `;
  return rows.map(toDef);
}

export type ParamView = ParamDef & {
  /** Valor efectivo (el propio o, si no hay, el de la plantilla). */
  readonly valor: string | null;
  readonly valorPlantilla: string | null;
  readonly origen: ParamOrigin;
  /** Premium sin el módulo contratado: se ve pero no se edita. */
  readonly bloqueado: boolean;
};

export async function loadParamViews(
  sql: Sql,
  restauranteId: number,
  activeModules: ReadonlySet<string>,
  template: string,
): Promise<ParamView[]> {
  const [defs, own, standard] = await Promise.all([
    loadParamDefs(sql),
    sql<{ config_key: string; config_value: string }[]>`
      SELECT config_key, config_value FROM public.restaurante_config
      WHERE  restaurante_id = ${restauranteId}
    `,
    sql<{ clave: string; valor: string }[]>`
      SELECT clave, valor FROM public.config_plantilla WHERE plantilla_code = ${template}
    `,
  ]);
  const ownValues = new Map(own.map((row) => [row.config_key, row.config_value]));
  const templateValues = new Map(standard.map((row) => [row.clave, row.valor]));
  return defs.map((def) => {
    const mine = ownValues.get(def.clave);
    const shared = templateValues.get(def.clave) ?? null;
    return {
      ...def,
      valor: mine ?? shared,
      valorPlantilla: shared,
      origen:
        mine !== undefined
          ? PARAM_ORIGIN.Own
          : shared !== null
            ? PARAM_ORIGIN.Template
            : PARAM_ORIGIN.None,
      bloqueado: def.moduloCode !== null && !activeModules.has(def.moduloCode),
    };
  });
}

export type Normalized =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: string };

const bad = (reason: string): Normalized => ({ ok: false, reason });

/** Valida un valor recibido según el tipo y los límites del diccionario y lo deja como texto. */
export function normalizeParamValue(def: ParamDef, raw: unknown): Normalized {
  switch (def.tipo) {
    case "booleano": {
      if (raw === true || raw === "true") return { ok: true, value: "true" };
      if (raw === false || raw === "false") return { ok: true, value: "false" };
      return bad("invalid_value");
    }
    case "entero": {
      const number = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof number !== "number" || !Number.isInteger(number)) return bad("invalid_value");
      if (def.minimo !== null && number < def.minimo) return bad("out_of_range");
      if (def.maximo !== null && number > def.maximo) return bad("out_of_range");
      return { ok: true, value: String(number) };
    }
    case "json": {
      if (!Array.isArray(raw) || !def.opciones) return bad("invalid_value");
      const allowed = def.opciones;
      if (!raw.every((item) => typeof item === "string" && allowed.includes(item))) {
        return bad("invalid_value");
      }
      // En el orden del diccionario y sin repetidos.
      const chosen = allowed.filter((option) => (raw as string[]).includes(option));
      return { ok: true, value: JSON.stringify(chosen) };
    }
    default: {
      if (typeof raw !== "string") return bad("invalid_value");
      const text = raw.trim();
      const max = Math.min(def.maximo ?? VALUE_MAX, VALUE_MAX);
      if (text.length > max) return bad("too_long");
      if (def.opciones && !def.opciones.includes(text)) return bad("invalid_value");
      if (def.clave === EMAIL_KEY && text !== "" && !EMAIL_PATTERN.test(text)) {
        return bad("invalid_email");
      }
      return { ok: true, value: text };
    }
  }
}

/** Guarda (o, con `null`, borra y vuelve a heredar) los valores propios de un restaurante. */
export async function saveParamValues(
  sql: Sql,
  restauranteId: number,
  changes: ReadonlyMap<string, string | null>,
): Promise<void> {
  await sql.begin(async (tx) => {
    for (const [key, value] of changes) {
      if (value === null) {
        await tx`
          DELETE FROM public.restaurante_config
          WHERE  restaurante_id = ${restauranteId} AND config_key = ${key}
        `;
      } else {
        await tx`
          INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
          VALUES (${restauranteId}, ${key}, ${value})
          ON CONFLICT (config_key, restaurante_id)
          DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now()
        `;
      }
    }
  });
}
