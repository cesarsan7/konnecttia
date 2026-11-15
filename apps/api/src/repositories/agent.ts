import { MODULE, type ModuleCode, resolveActiveModules } from "@konnecttia/access";
import type { Sql } from "../lib/db";
import { CONFIG_KEY } from "./restaurants";

/**
 * Agente de WhatsApp (ADR 0012). n8n solo conoce el canal por el que entra el mensaje; el
 * restaurante y el local salen de `canal_whatsapp` en el servidor.
 */

const ACTIVE_CHANNEL_STATE = "activo";
const ACTIVE_MODULE_STATE = "activo";
const TRUE_VALUE = "true";

/** Tonos admitidos para el agente (`agente_tono`). */
export const AGENT_TONE = { Close: "cercano", Formal: "formal" } as const;
export type AgentTone = (typeof AGENT_TONE)[keyof typeof AGENT_TONE];

export type AgentChannel = {
  readonly id: number;
  readonly restauranteId: number;
  /** Local del número; null = número general del restaurante. */
  readonly sucursalId: number | null;
};

/** Canal activo por id, o null si no existe o no está activo. */
export async function loadActiveChannel(sql: Sql, canalId: number): Promise<AgentChannel | null> {
  const rows = await sql<{ id: string; restaurante_id: number; sucursal_id: string | null }[]>`
    SELECT id, restaurante_id, sucursal_id
    FROM   public.canal_whatsapp
    WHERE  id = ${canalId} AND estado = ${ACTIVE_CHANNEL_STATE}
    LIMIT  1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    restauranteId: row.restaurante_id,
    sucursalId: row.sucursal_id === null ? null : Number(row.sucursal_id),
  };
}

/** El restaurante tiene operativo el módulo del agente (con sus dependencias). */
export async function agentModuleActive(sql: Sql, restauranteId: number): Promise<boolean> {
  const rows = await sql<{ modulo_code: string }[]>`
    SELECT modulo_code FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restauranteId} AND estado = ${ACTIVE_MODULE_STATE}
  `;
  const active = resolveActiveModules(rows.map((row) => row.modulo_code as ModuleCode));
  return active.has(MODULE.WhatsappAgent);
}

export type AgentSettings = {
  readonly activo: boolean;
  readonly nombreVisible: string | null;
  readonly tono: AgentTone | null;
  readonly instrucciones: string | null;
  /** null = sin pausa. */
  readonly pausaMinutos: number | null;
  readonly pausaDerivarMinutos: number | null;
};

function positiveMinutes(value: string | undefined): number | null {
  if (value === undefined) return null;
  const minutes = Number(value.trim());
  return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Ajustes del agente desde `restaurante_config`. Sin valor no se inventa ninguno. */
export function agentSettings(config: ReadonlyMap<string, string>): AgentSettings {
  const tone = text(config.get(CONFIG_KEY.AgentTone));
  return {
    activo: text(config.get(CONFIG_KEY.AgentActive))?.toLowerCase() === TRUE_VALUE,
    nombreVisible: text(config.get(CONFIG_KEY.AgentVisibleName)),
    tono: Object.values(AGENT_TONE).includes(tone as AgentTone) ? (tone as AgentTone) : null,
    instrucciones: text(config.get(CONFIG_KEY.AgentInstructions)),
    pausaMinutos: positiveMinutes(config.get(CONFIG_KEY.AgentPauseMinutes)),
    pausaDerivarMinutos: positiveMinutes(config.get(CONFIG_KEY.AgentHandoffPauseMinutes)),
  };
}

/** Frase con la que el agente se presenta: siempre en nombre del restaurante. */
export function agentPresentation(restaurantName: string, visibleName: string | null): string {
  return visibleName
    ? `Soy ${visibleName}, el agente de pedidos del restaurante ${restaurantName}`
    : `Soy el agente de pedidos del restaurante ${restaurantName}`;
}

export type RestaurantMessages = {
  readonly bienvenida: string | null;
  readonly cerrado: string | null;
};

export async function loadRestaurantMessages(
  sql: Sql,
  restauranteId: number,
): Promise<RestaurantMessages> {
  const rows = await sql<{ mensaje_bienvenida: string | null; mensaje_cerrado: string | null }[]>`
    SELECT mensaje_bienvenida, mensaje_cerrado FROM public.restaurante WHERE id = ${restauranteId}
  `;
  return {
    bienvenida: text(rows[0]?.mensaje_bienvenida ?? undefined),
    cerrado: text(rows[0]?.mensaje_cerrado ?? undefined),
  };
}

export type AgentCustomer = {
  readonly nombre: string | null;
  readonly direccionFrecuente: string | null;
};

/** Datos del cliente en ESTE restaurante (nunca los de otro). */
export async function loadAgentCustomer(
  sql: Sql,
  restauranteId: number,
  telefono: string,
): Promise<AgentCustomer> {
  const rows = await sql<{ nombre: string | null; direccion_frecuente: string | null }[]>`
    SELECT nombre, direccion_frecuente
    FROM   public.usuarios
    WHERE  restaurante_id = ${restauranteId} AND telefono = ${telefono}
    ORDER  BY updated_at DESC NULLS LAST
    LIMIT  1
  `;
  return {
    nombre: text(rows[0]?.nombre ?? undefined),
    direccionFrecuente: text(rows[0]?.direccion_frecuente ?? undefined),
  };
}
