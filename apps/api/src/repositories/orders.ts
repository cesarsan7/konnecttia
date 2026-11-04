import type { Fulfillment, Quote } from "@konnecttia/domain";
import { DEFERRED_PAYMENT_METHODS, ORDER_STATUS, PAYMENT_STATUS } from "@konnecttia/domain";
import { centsToEuros, eurosToCents, type Sql, UNIQUE_VIOLATION } from "../lib/db";

/** Canal del pedido (pedidos.canal). n8n escribe «whatsapp». */
export const ORDER_CHANNEL = {
  Web: "web",
  WhatsApp: "whatsapp",
  Phone: "telefono",
  Counter: "mostrador",
} as const;

export type OrderChannel = (typeof ORDER_CHANNEL)[keyof typeof ORDER_CHANNEL];
export const OUTBOX_EVENT = {
  OrderReceived: "pedido.recibido",
  OrderStatusChanged: "pedido.estado_cambiado",
} as const;

export type NewOrder = {
  readonly restauranteId: number;
  /** Local que prepara (recogida) o despacha (reparto) el pedido. */
  readonly sucursalId: number;
  readonly idempotencyKey: string;
  readonly canal: OrderChannel;
  readonly nombre: string;
  readonly telefono: string;
  readonly nombrePedido: string | null;
  readonly fulfillment: Fulfillment;
  readonly direccion: string | null;
  readonly postalCode: string | null;
  /** Ubicación del cliente (solo reparto) y distancia al local que despacha. */
  readonly customerPoint: { readonly lat: number; readonly lng: number } | null;
  readonly distanciaKm: number | null;
  readonly metodoPago: string;
  readonly tiempoEstimado: string | null;
  readonly notas: string | null;
  readonly quote: Quote;
  /** Pedido en mesa (servicio de mesa). */
  readonly mesaId?: number | null;
};

export type CreatedOrder = {
  readonly id: number;
  readonly pedidoCodigo: string | null;
  readonly trackingToken: string;
  readonly estado: string;
  readonly totalCents: number;
  readonly created: boolean;
};

/**
 * Snapshot de las líneas en el formato JSON que ya leen el panel de EasyOrder y n8n.
 * En ese formato la cantidad de un extra es el total de la línea (no por unidad), así que se
 * multiplica por la cantidad del producto para que las sumas del panel coincidan con el total.
 */
export function legacyItemsSnapshot(quote: Quote) {
  return quote.lines.map((line) => ({
    menu_item_id: line.itemId,
    menu_variant_id: line.variantId,
    item_name: line.name,
    variant_name: line.variantName,
    quantity: line.quantity,
    unit_price: centsToEuros(
      line.unitPriceCents -
        line.modifiers.reduce(
          (sum, modifier) => sum + modifier.unitPriceCents * modifier.quantity,
          0,
        ),
    ),
    extras: line.modifiers.map((modifier) => ({
      extra_id: modifier.optionId,
      name: modifier.name,
      unit_price: centsToEuros(modifier.unitPriceCents),
      quantity: modifier.quantity * line.quantity,
    })),
    line_total: centsToEuros(line.lineTotalCents),
    ...(line.note ? { nota: line.note } : {}),
  }));
}

async function findByIdempotencyKey(
  sql: Sql,
  restauranteId: number,
  key: string,
): Promise<CreatedOrder | null> {
  const rows = await sql<
    {
      id: number;
      pedido_codigo: string | null;
      tracking_token: string;
      estado: string;
      total: string;
    }[]
  >`
    SELECT id, pedido_codigo, tracking_token, estado, total
    FROM   public.pedidos
    WHERE  restaurante_id = ${restauranteId} AND idempotency_key = ${key}
    LIMIT  1
  `;
  const row = rows[0];
  return row
    ? {
        id: row.id,
        pedidoCodigo: row.pedido_codigo,
        trackingToken: row.tracking_token,
        estado: row.estado,
        totalCents: eurosToCents(row.total),
        created: false,
      }
    : null;
}

/**
 * Crea el pedido, el perfil del cliente y el evento de outbox en una sola transacción.
 * Si la misma clave de idempotencia ya existe, devuelve el pedido original.
 */
export async function createOrder(sql: Sql, order: NewOrder): Promise<CreatedOrder> {
  const existing = await findByIdempotencyKey(sql, order.restauranteId, order.idempotencyKey);
  if (existing) return existing;

  const { quote } = order;
  const subtotal = centsToEuros(
    quote.subtotalCents +
      quote.surcharges.reduce((sum, surcharge) => sum + surcharge.amountCents, 0),
  );
  const notas = [
    ...(order.notas ? [{ item: "general", nota: order.notas }] : []),
    ...quote.surcharges.map((surcharge) => ({
      item: "suplemento",
      nota: `${surcharge.label}: ${centsToEuros(surcharge.amountCents).toFixed(2)} €`,
    })),
  ];
  const estadoPago = DEFERRED_PAYMENT_METHODS.has(order.metodoPago)
    ? PAYMENT_STATUS.Pending
    : PAYMENT_STATUS.NotApplicable;

  try {
    return await sql.begin(async (tx) => {
      // Un pedido en mesa puede no tener teléfono: entonces no hay perfil de cliente.
      const usuario = order.telefono
        ? await tx<{ id: number }[]>`
            SELECT id FROM public.fn_upsert_usuario_perfil(
              ${order.telefono}, ${order.nombre}, ${order.direccion}, ${order.fulfillment},
              ${order.restauranteId}
            ) LIMIT 1
          `
        : [];
      const inserted = await tx<
        { id: number; pedido_codigo: string | null; tracking_token: string; estado: string }[]
      >`
        INSERT INTO public.pedidos (
          restaurante_id, telefono, usuario_id, items, subtotal, costo_envio, total,
          tipo_despacho, direccion, postal_code, tiempo_estimado, metodo_pago,
          estado, estado_pago, notas, canal, nombre_pedido, idempotency_key,
          sucursal_id, lat, lng, distancia_km, mesa_id
        ) VALUES (
          ${order.restauranteId}, ${order.telefono}, ${usuario[0]?.id ?? null},
          ${tx.json(legacyItemsSnapshot(quote))}, ${subtotal},
          ${centsToEuros(quote.deliveryFeeCents)}, ${centsToEuros(quote.totalCents)},
          ${order.fulfillment}, ${order.direccion}, ${order.postalCode}, ${order.tiempoEstimado},
          ${order.metodoPago}, ${ORDER_STATUS.Received}, ${estadoPago},
          ${notas.length > 0 ? tx.json(notas) : null}, ${order.canal}, ${order.nombrePedido},
          ${order.idempotencyKey}, ${order.sucursalId}, ${order.customerPoint?.lat ?? null},
          ${order.customerPoint?.lng ?? null},
          ${order.distanciaKm === null ? null : Math.round(order.distanciaKm * 100) / 100},
          ${order.mesaId ?? null}
        )
        RETURNING id, pedido_codigo, tracking_token, estado
      `;
      const pedido = inserted[0];
      if (!pedido) {
        throw new Error("El INSERT del pedido no devolvió filas");
      }
      await tx`
        INSERT INTO public.outbox_evento
          (restaurante_id, tipo, agregado_tipo, agregado_id, payload, clave_idempotencia)
        VALUES (
          ${order.restauranteId}, ${OUTBOX_EVENT.OrderReceived}, 'pedido', ${String(pedido.id)},
          ${tx.json({ pedido_id: pedido.id, canal: order.canal })},
          ${`${OUTBOX_EVENT.OrderReceived}:${pedido.id}`}
        )
      `;
      return {
        id: pedido.id,
        pedidoCodigo: pedido.pedido_codigo,
        trackingToken: pedido.tracking_token,
        estado: pedido.estado,
        totalCents: quote.totalCents,
        created: true,
      };
    });
  } catch (error) {
    // Dos peticiones simultáneas con la misma clave: gana la primera, la segunda la devuelve.
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      const winner = await findByIdempotencyKey(sql, order.restauranteId, order.idempotencyKey);
      if (winner) return winner;
    }
    throw error;
  }
}

export type TrackedOrder = {
  readonly pedidoCodigo: string | null;
  readonly restaurante: string;
  /** Local que prepara o despacha (dirección del local, nunca la del cliente). */
  readonly local: { readonly nombre: string; readonly direccion: string | null } | null;
  readonly estado: string;
  readonly estadoPago: string;
  readonly tipoDespacho: string | null;
  readonly tiempoEstimado: string | null;
  readonly items: unknown;
  readonly subtotal: number;
  readonly costoEnvio: number;
  readonly total: number;
  readonly metodoPago: string | null;
  readonly datosBancarios: unknown;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

/**
 * Seguimiento público por token aleatorio. No devuelve teléfono, dirección ni notas.
 * Los datos bancarios solo se muestran si el cliente aún tiene que pagar por transferencia.
 */
export async function findOrderByTrackingToken(
  sql: Sql,
  token: string,
): Promise<TrackedOrder | null> {
  const rows = await sql<
    {
      pedido_codigo: string | null;
      restaurante: string;
      local_nombre: string | null;
      local_direccion: string | null;
      estado: string;
      estado_pago: string;
      tipo_despacho: string | null;
      tiempo_estimado: string | null;
      items: unknown;
      subtotal: string;
      costo_envio: string;
      total: string;
      metodo_pago: string | null;
      datos_bancarios: unknown;
      created_at: string;
      updated_at: string | null;
    }[]
  >`
    SELECT p.pedido_codigo, r.nombre AS restaurante, p.estado, p.estado_pago, p.tipo_despacho,
           p.tiempo_estimado, p.items, p.subtotal, p.costo_envio, p.total, p.metodo_pago,
           r.datos_bancarios, p.created_at, p.updated_at,
           s.nombre AS local_nombre, s.direccion AS local_direccion
    FROM   public.pedidos p
    JOIN   public.restaurante r ON r.id = p.restaurante_id
    LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
    WHERE  p.tracking_token = ${token}::uuid
    LIMIT  1
  `;
  const row = rows[0];
  if (!row) return null;
  const showBankDetails =
    row.estado_pago === PAYMENT_STATUS.Pending &&
    DEFERRED_PAYMENT_METHODS.has(row.metodo_pago ?? "");
  return {
    pedidoCodigo: row.pedido_codigo,
    restaurante: row.restaurante,
    local: row.local_nombre ? { nombre: row.local_nombre, direccion: row.local_direccion } : null,
    estado: row.estado,
    estadoPago: row.estado_pago,
    tipoDespacho: row.tipo_despacho,
    tiempoEstimado: row.tiempo_estimado,
    items: row.items,
    subtotal: Number(row.subtotal),
    costoEnvio: Number(row.costo_envio),
    total: Number(row.total),
    metodoPago: row.metodo_pago,
    datosBancarios: showBankDetails ? row.datos_bancarios : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
