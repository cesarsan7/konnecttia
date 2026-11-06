import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { ORDER_CHANNEL } from "./orders";
import { CONFIG_KEY } from "./restaurants";

/**
 * Antifraude del pedido web (pieza Q, capas gratuitas). Todo se compara con el teléfono
 * normalizado por `fn_telefono_normalizado` (solo dígitos, con 34 si es español de 9 cifras):
 * la misma función que usará n8n, para que web y WhatsApp coincidan.
 */

/** Estados en los que el pedido ya no está en curso. */
const CLOSED_ORDER = [ORDER_STATUS.Delivered, ORDER_STATUS.Cancelled, ORDER_STATUS.Expired];

export const PHONE_LIMIT = { Open: "abiertos", Hour: "hora" } as const;
export type PhoneLimitHit = (typeof PHONE_LIMIT)[keyof typeof PHONE_LIMIT];

export type PhoneLimits = {
  /** Pedidos web sin cerrar a la vez. null = sin límite. */
  readonly open: number | null;
  /** Pedidos web en la última hora (incluidos los cancelados). null = sin límite. */
  readonly perHour: number | null;
};

/** Entero positivo de la configuración; ausente, vacío o inválido (0, texto) = sin límite. */
function limitFrom(config: ReadonlyMap<string, string>, key: string): number | null {
  const value = Number.parseInt(config.get(key) ?? "", 10);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

export function phoneLimits(config: ReadonlyMap<string, string>): PhoneLimits {
  return {
    open: limitFrom(config, CONFIG_KEY.AntifraudOpenPerPhone),
    perHour: limitFrom(config, CONFIG_KEY.AntifraudPerPhoneHour),
  };
}

/** Decide qué límite se supera, si alguno, con los pedidos que el teléfono ya tiene. */
export function exceededLimit(
  limits: PhoneLimits,
  counts: { readonly open: number; readonly lastHour: number },
): PhoneLimitHit | null {
  if (limits.open !== null && counts.open >= limits.open) return PHONE_LIMIT.Open;
  if (limits.perHour !== null && counts.lastHour >= limits.perHour) return PHONE_LIMIT.Hour;
  return null;
}

/** ¿Ya existe un pedido con esta clave de idempotencia? Un reintento no se vuelve a juzgar. */
export async function orderExistsForKey(
  sql: Sql,
  restauranteId: number,
  idempotencyKey: string,
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM public.pedidos
    WHERE  restaurante_id = ${restauranteId} AND idempotency_key = ${idempotencyKey}
    LIMIT  1
  `;
  return rows.length > 0;
}

export async function isPhoneBlocked(
  sql: Sql,
  restauranteId: number,
  phone: string,
): Promise<boolean> {
  const [row] = await sql<{ bloqueado: boolean }[]>`
    SELECT public.fn_telefono_bloqueado(${restauranteId}::int4, ${phone}) AS bloqueado
  `;
  return row?.bloqueado === true;
}

/**
 * Comprueba los límites de pedidos web de un teléfono. Sin ningún límite configurado no consulta
 * la base. Es una barrera de mejor esfuerzo: dos pedidos simultáneos pueden pasar a la vez.
 */
export async function checkPhoneLimits(
  sql: Sql,
  restauranteId: number,
  phone: string,
  limits: PhoneLimits,
): Promise<PhoneLimitHit | null> {
  if (limits.open === null && limits.perHour === null) return null;
  const [row] = await sql<{ abiertos: number; hora: number }[]>`
    SELECT count(*) FILTER (WHERE p.estado NOT IN ${sql(CLOSED_ORDER)})::int AS abiertos,
           count(*) FILTER (WHERE p.created_at > now() - interval '1 hour')::int AS hora
    FROM   public.pedidos p
    WHERE  p.restaurante_id = ${restauranteId}
      AND  p.canal = ${ORDER_CHANNEL.Web}
      AND  public.fn_telefono_normalizado(p.telefono) = public.fn_telefono_normalizado(${phone})
  `;
  return exceededLimit(limits, { open: row?.abiertos ?? 0, lastHour: row?.hora ?? 0 });
}
