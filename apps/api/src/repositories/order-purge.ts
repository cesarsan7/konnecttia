import type { TransactionSql } from "postgres";
import type { AppDeps } from "../context";
import { DELIVERY_PHOTO_PREFIX } from "./delivery-photos";

type Tx = TransactionSql;

export type PurgeOptions = {
  /** Solo lo anterior a esta fecha (pedidos, carritos y derivaciones). Sin fecha, todo. */
  readonly before: Date | null;
  /** También los carritos del agente de WhatsApp. */
  readonly carts: boolean;
  /** También las derivaciones del agente a una persona. */
  readonly handoffs: boolean;
  /** También la memoria y el estado de las conversaciones del agente (no admite fecha). */
  readonly conversations: boolean;
};

export type PurgeCounts = {
  readonly pedidos: number;
  readonly carritos: number;
  readonly derivaciones: number;
  readonly conversaciones: number;
};

/** Origen con el que el agente de WhatsApp registra sus derivaciones. */
const HANDOFF_ORIGIN = "agente_whatsapp";

/**
 * Borra los pedidos de un restaurante (con justificantes, incidencias, reparto y registro de
 * estados, que caen en cascada) y, si se pide, lo que dejaron las pruebas del agente. No toca la
 * carta, el equipo, los clientes ni los ajustes. Los carritos que apuntaban a un pedido borrado
 * quedan sin pedido (`ON DELETE SET NULL`), así que se limpian aparte.
 */
export async function purgeOrders(
  tx: Tx,
  restaurantId: number,
  options: PurgeOptions,
): Promise<PurgeCounts> {
  const before = options.before;
  const orders = await tx`
    DELETE FROM public.pedidos
    WHERE  restaurante_id = ${restaurantId}
      AND  (${before}::timestamptz IS NULL OR created_at < ${before})
    RETURNING id
  `;
  let carts = 0;
  if (options.carts) {
    const rows = await tx`
      DELETE FROM public.agente_carrito
      WHERE  restaurante_id = ${restaurantId}
        AND  (${before}::timestamptz IS NULL OR created_at < ${before})
      RETURNING id
    `;
    carts = rows.length;
  }
  let handoffs = 0;
  if (options.handoffs) {
    const rows = await tx`
      DELETE FROM public.escalaciones
      WHERE  restaurante_id = ${restaurantId}
        AND  contexto->>'origen' = ${HANDOFF_ORIGIN}
        AND  (${before}::timestamptz IS NULL OR created_at < ${before})
      RETURNING id
    `;
    handoffs = rows.length;
  }
  let conversations = 0;
  if (options.conversations) {
    const state = await tx`
      DELETE FROM public.whatsapp_conversacion WHERE restaurante_id = ${restaurantId} RETURNING 1
    `;
    const memory = await tx`
      DELETE FROM public.n8n_chat_histories WHERE restaurante_id = ${restaurantId} RETURNING 1
    `;
    conversations = state.length + memory.length;
  }
  return {
    pedidos: orders.length,
    carritos: carts,
    derivaciones: handoffs,
    conversaciones: conversations,
  };
}

export type PurgeFiles = {
  readonly justificantes: number | "sin_almacen" | "error" | "omitido";
  readonly fotos_entrega: number | "sin_almacen" | "error" | "omitido";
};

/**
 * Justificantes de pago y fotos de entrega de los pedidos purgados (mejor esfuerzo, después de
 * confirmar la transacción). Con fecha no se pueden borrar por carpeta sin tocar pedidos que se
 * conservan: se omiten.
 */
export async function removeOrderFiles(
  deps: Pick<AppDeps, "proofStorage">,
  restaurantId: number,
  options: Pick<PurgeOptions, "before">,
): Promise<PurgeFiles> {
  if (options.before) return { justificantes: "omitido", fotos_entrega: "omitido" };
  const remove = deps.proofStorage?.removeFolder;
  if (!remove) return { justificantes: "sin_almacen", fotos_entrega: "sin_almacen" };
  const attempt = async (folder: string) => {
    try {
      return await remove(folder);
    } catch {
      return "error" as const;
    }
  };
  return {
    justificantes: await attempt(String(restaurantId)),
    fotos_entrega: await attempt(`${DELIVERY_PHOTO_PREFIX}/${restaurantId}`),
  };
}
