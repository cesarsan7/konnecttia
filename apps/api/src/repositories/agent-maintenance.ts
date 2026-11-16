import { MODULE, type ModuleCode, resolveActiveModules } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { AGENT_TONE, agentSettings } from "./agent";
import { CART_STATE } from "./agent-cart";
import { changeOrderStatus } from "./order-status";
import { OUTBOX_EVENT } from "./orders";
import { CONFIG_KEY, loadConfig } from "./restaurants";

/** Mensaje que n8n envía al cliente por el canal indicado. */
export type AgentNotice = {
  readonly restaurante_id: number;
  readonly canal_id: number;
  readonly destinatario: string;
  readonly texto: string;
};

export type MaintenanceResult = {
  readonly eventos_purgados: number;
  readonly carritos_caducados: number;
  readonly avisos: readonly AgentNotice[];
  readonly pedidos_cancelados: readonly AgentNotice[];
  readonly estados: readonly AgentNotice[];
};

const ACTIVE_MODULE_STATE = "activo";
const CANCEL_ORIGIN = "sistema";
const CANCEL_ACTOR = "agente_caducidad";

function positive(config: ReadonlyMap<string, string>, key: string): number | null {
  const value = Number(config.get(key)?.trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function warningText(formal: boolean, minutes: number): string {
  return formal
    ? `Su carrito caducará en unos ${minutes} minutos. ¿Desea continuar con su pedido?`
    : `Tu carrito caducará en unos ${minutes} minutos. ¿Quieres seguir con tu pedido?`;
}

export function pendingPaymentText(formal: boolean, code: string | null): string {
  const ref = code ? ` ${code}` : "";
  return formal
    ? `Hemos cancelado su pedido${ref} porque no recibimos el pago a tiempo. Si aún lo desea, puede hacer un pedido nuevo cuando quiera.`
    : `Hemos cancelado tu pedido${ref} porque no recibimos el pago a tiempo. Si aún lo quieres, puedes hacer un pedido nuevo cuando quieras.`;
}

const EVENT_RETENTION_DAYS = 7;
const STATUS_NOTICE_LOOKBACK_MINUTES = 60;
/** Ventana de atención de WhatsApp: pasadas 24 h sin hablar con el cliente no se le escribe. */
const WHATSAPP_WINDOW_HOURS = 23;

export function statusText(
  formal: boolean,
  status: string,
  code: string | null,
  fulfillment: string | null,
): string | null {
  const ref = code ? ` ${code}` : "";
  const pickup = fulfillment === "retiro";
  const t = (close: string, polite: string) => (formal ? polite : close);
  switch (status) {
    case ORDER_STATUS.Confirmed:
      return t(`El local ha aceptado tu pedido${ref}.`, `El local ha aceptado su pedido${ref}.`);
    case ORDER_STATUS.Preparing:
      return t(`Estamos preparando tu pedido${ref}.`, `Estamos preparando su pedido${ref}.`);
    case ORDER_STATUS.Ready:
      return pickup
        ? t(`Tu pedido${ref} está listo para recoger.`, `Su pedido${ref} está listo para recoger.`)
        : t(
            `Tu pedido${ref} está listo y saldrá en breve.`,
            `Su pedido${ref} está listo y saldrá en breve.`,
          );
    case ORDER_STATUS.OnTheWay:
      return t(`Tu pedido${ref} va en camino.`, `Su pedido${ref} va en camino.`);
    case ORDER_STATUS.Delivered:
      return t(
        `Tu pedido${ref} ha sido entregado. ¡Que aproveche!`,
        `Su pedido${ref} ha sido entregado. ¡Que aproveche!`,
      );
    case ORDER_STATUS.Cancelled:
      return t(
        `Tu pedido${ref} ha sido cancelado. Si tienes dudas, escríbenos por aquí.`,
        `Su pedido${ref} ha sido cancelado. Si tiene dudas, escríbanos por aquí.`,
      );
    default:
      return null;
  }
}

/** Estados elegidos por el restaurante (`agente_notif_estados`, lista JSON); vacío = ninguno. */
export function notifyStates(config: ReadonlyMap<string, string>): string[] {
  try {
    const parsed: unknown = JSON.parse(config.get(CONFIG_KEY.AgentNotifyStates) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

type AgentRestaurant = { readonly id: number; readonly pro: boolean };

/** Restaurantes con el agente operativo y si además tienen el módulo premium. */
async function agentRestaurants(sql: Sql): Promise<AgentRestaurant[]> {
  const rows = await sql<{ restaurante_id: number; modulo_code: string }[]>`
    SELECT restaurante_id, modulo_code FROM public.restaurante_modulo
    WHERE  estado = ${ACTIVE_MODULE_STATE}
      AND  restaurante_id IN (
             SELECT restaurante_id FROM public.restaurante_modulo
             WHERE  modulo_code = ${MODULE.WhatsappAgent} AND estado = ${ACTIVE_MODULE_STATE})
  `;
  const byRestaurant = new Map<number, ModuleCode[]>();
  for (const row of rows) {
    byRestaurant.set(row.restaurante_id, [
      ...(byRestaurant.get(row.restaurante_id) ?? []),
      row.modulo_code as ModuleCode,
    ]);
  }
  return [...byRestaurant].flatMap(([id, codes]) => {
    const active = resolveActiveModules(codes);
    return active.has(MODULE.WhatsappAgent)
      ? [{ id, pro: active.has(MODULE.WhatsappAgentPro) }]
      : [];
  });
}

/**
 * Mantenimiento periódico del agente (lo llama n8n cada pocos minutos):
 * - básico: marca como caducados los carritos abiertos que superan `cart_expiry_minutes`;
 * - premium (`whatsapp.agent_pro`): avisa los cambios de estado elegidos (`agente_notif_estados`),
 *   avisa una vez antes de caducar (`cart_warning_minutes`) y cancela los pedidos de WhatsApp que siguen pendientes de pago pasado
 *   `pedido_pago_pendiente_expira_minutos` (0 = no cancelar; nunca si ya hay justificante).
 * Devuelve los mensajes a enviar; la API no envía nada.
 */
export async function runAgentMaintenance(sql: Sql, now: Date): Promise<MaintenanceResult> {
  // Claves de idempotencia de webhooks ya procesados: más de 7 días no sirven para nada.
  const purged = await sql`
    DELETE FROM public.whatsapp_evento
    WHERE  recibido_at < ${new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000)}
    RETURNING clave
  `;
  let expired = 0;
  const warnings: AgentNotice[] = [];
  const cancelled: AgentNotice[] = [];
  const statuses: AgentNotice[] = [];

  for (const restaurant of await agentRestaurants(sql)) {
    const config = await loadConfig(sql, restaurant.id);
    const formal = agentSettings(config).tono === AGENT_TONE.Formal;
    const expiry = positive(config, CONFIG_KEY.CartExpiryMinutes);

    if (expiry !== null) {
      const closed = await sql`
        UPDATE public.agente_carrito SET estado = ${CART_STATE.Expired}, updated_at = ${now}
        WHERE  restaurante_id = ${restaurant.id} AND estado = ${CART_STATE.Open}
          AND  updated_at < ${new Date(now.getTime() - expiry * 60_000)}
        RETURNING id
      `;
      expired += closed.length;
    }

    if (!restaurant.pro) continue;

    const warning = positive(config, CONFIG_KEY.CartWarningMinutes);
    if (expiry !== null && warning !== null && warning < expiry) {
      const due = await sql<{ canal_id: string; telefono: string }[]>`
        UPDATE public.agente_carrito SET aviso_caducidad_at = ${now}
        WHERE  restaurante_id = ${restaurant.id} AND estado = ${CART_STATE.Open}
          AND  jsonb_array_length(lineas) > 0
          AND  updated_at <= ${new Date(now.getTime() - (expiry - warning) * 60_000)}
          AND  (aviso_caducidad_at IS NULL OR aviso_caducidad_at < updated_at)
        RETURNING canal_id, telefono
      `;
      for (const row of due) {
        warnings.push({
          restaurante_id: restaurant.id,
          canal_id: Number(row.canal_id),
          destinatario: row.telefono,
          texto: warningText(formal, warning),
        });
      }
    }

    const pending = positive(config, CONFIG_KEY.PendingPaymentExpiryMinutes);
    if (pending !== null) {
      const orders = await sql<
        { pedido_id: number; codigo: string | null; canal_id: string; telefono: string }[]
      >`
        SELECT p.id AS pedido_id, p.pedido_codigo AS codigo, c.canal_id, c.telefono
        FROM   public.agente_carrito c
        JOIN   public.pedidos p ON p.id = c.pedido_id AND p.restaurante_id = c.restaurante_id
        WHERE  c.restaurante_id = ${restaurant.id} AND c.estado = ${CART_STATE.Confirmed}
          AND  p.estado = ${ORDER_STATUS.PendingPayment}
          AND  c.updated_at < ${new Date(now.getTime() - pending * 60_000)}
          AND  NOT EXISTS (SELECT 1 FROM public.pedido_justificante j WHERE j.pedido_id = p.id)
      `;
      for (const order of orders) {
        const result = await changeOrderStatus(sql, {
          restaurantId: restaurant.id,
          orderId: order.pedido_id,
          target: ORDER_STATUS.Cancelled,
          origin: CANCEL_ORIGIN,
          actor: CANCEL_ACTOR,
          allowed: () => true,
          onlyFrom: [ORDER_STATUS.PendingPayment],
        });
        if (result.kind !== "updated") continue;
        cancelled.push({
          restaurante_id: restaurant.id,
          canal_id: Number(order.canal_id),
          destinatario: order.telefono,
          texto: pendingPaymentText(formal, order.codigo),
        });
      }
    }

    const states = notifyStates(config);
    if (states.length > 0) {
      const events = await sql<
        {
          evento_id: string;
          hacia: string;
          codigo: string | null;
          tipo_despacho: string | null;
          canal_id: string;
          telefono: string;
        }[]
      >`
        SELECT e.id AS evento_id, e.payload->>'hacia' AS hacia, p.pedido_codigo AS codigo,
               p.tipo_despacho, c.canal_id, c.telefono
        FROM   public.outbox_evento e
        JOIN   public.pedidos p
               ON p.id::text = e.agregado_id AND p.restaurante_id = e.restaurante_id
        JOIN   public.agente_carrito c
               ON c.pedido_id = p.id AND c.restaurante_id = p.restaurante_id
        WHERE  e.restaurante_id = ${restaurant.id}
          AND  e.tipo = ${OUTBOX_EVENT.OrderStatusChanged}
          AND  e.created_at > ${new Date(now.getTime() - STATUS_NOTICE_LOOKBACK_MINUTES * 60_000)}
          AND  e.payload->>'hacia' IN ${sql(states)}
          AND  c.updated_at > ${new Date(now.getTime() - WHATSAPP_WINDOW_HOURS * 3_600_000)}
          AND  NOT EXISTS (SELECT 1 FROM public.aviso_whatsapp a WHERE a.evento_id = e.id)
          -- Lo cancelado por el propio sistema ya tiene su mensaje, y el cliente que cancela lo sabe.
          AND  NOT EXISTS (
                 SELECT 1 FROM public.pedido_estado_log l
                 WHERE  l.pedido_id = p.id AND l.estado_nuevo = e.payload->>'hacia'
                   AND  l.origen IN (${CANCEL_ORIGIN}, 'cliente'))
        ORDER  BY e.id
      `;
      for (const event of events) {
        const text = statusText(formal, event.hacia, event.codigo, event.tipo_despacho);
        if (text === null) continue;
        const claimed = await sql`
          INSERT INTO public.aviso_whatsapp (evento_id, restaurante_id)
          VALUES (${event.evento_id}, ${restaurant.id})
          ON CONFLICT DO NOTHING
          RETURNING evento_id
        `;
        if (claimed.length === 0) continue;
        statuses.push({
          restaurante_id: restaurant.id,
          canal_id: Number(event.canal_id),
          destinatario: event.telefono,
          texto: text,
        });
      }
    }
  }
  return {
    eventos_purgados: purged.length,
    carritos_caducados: expired,
    avisos: warnings,
    pedidos_cancelados: cancelled,
    estados: statuses,
  };
}
