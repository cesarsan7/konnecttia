import { MODULE, type ModuleCode, resolveActiveModules } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Sql } from "../lib/db";
import { AGENT_TONE, agentSettings } from "./agent";
import { CART_STATE } from "./agent-cart";
import { changeOrderStatus } from "./order-status";
import { CONFIG_KEY, loadConfig } from "./restaurants";

/** Mensaje que n8n envía al cliente por el canal indicado. */
export type AgentNotice = {
  readonly restaurante_id: number;
  readonly canal_id: number;
  readonly destinatario: string;
  readonly texto: string;
};

export type MaintenanceResult = {
  readonly carritos_caducados: number;
  readonly avisos: readonly AgentNotice[];
  readonly pedidos_cancelados: readonly AgentNotice[];
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
 * - premium (`whatsapp.agent_pro`): avisa una vez antes de caducar (`cart_warning_minutes`) y
 *   cancela los pedidos de WhatsApp que siguen pendientes de pago pasado
 *   `pedido_pago_pendiente_expira_minutos` (0 = no cancelar; nunca si ya hay justificante).
 * Devuelve los mensajes a enviar; la API no envía nada.
 */
export async function runAgentMaintenance(sql: Sql, now: Date): Promise<MaintenanceResult> {
  let expired = 0;
  const warnings: AgentNotice[] = [];
  const cancelled: AgentNotice[] = [];

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
  }
  return { carritos_caducados: expired, avisos: warnings, pedidos_cancelados: cancelled };
}
