import type { Fulfillment, Quote } from "@konnecttia/domain";
import {
  DEFERRED_PAYMENT_METHODS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} from "@konnecttia/domain";
import { emailPayload, maskEmail } from "../lib/customer-email";
import { centsToEuros, eurosToCents, type Sql, UNIQUE_VIOLATION } from "../lib/db";
import { acceptsProof, maxProofsPerOrder } from "./payment-proofs";
import { CONFIG_KEY } from "./restaurants";

/** Canal del pedido (pedidos.canal). n8n escribe «whatsapp». */
export const ORDER_CHANNEL = {
  Web: "web",
  WhatsApp: "whatsapp",
  Phone: "telefono",
  Counter: "mostrador",
} as const;

/** Estados en los que el pedido ya no genera avisos: el email ya no se puede cambiar. */
const FINAL_STATES: ReadonlySet<string> = new Set([
  ORDER_STATUS.Delivered,
  ORDER_STATUS.Cancelled,
  ORDER_STATUS.Expired,
]);

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
  /** Email para avisar del pedido (obligatorio en el checkout web). */
  readonly emailCliente?: string | null;
  readonly quote: Quote;
  /** Pedido en mesa (servicio de mesa). */
  readonly mesaId?: number | null;
  /** Consentimiento dado en el checkout web. Los demás canales no lo piden. */
  readonly consent?: OrderConsent;
};

export type OrderConsent = {
  /** Versión de la política de privacidad aceptada (`null` si el restaurante no la define). */
  readonly privacyVersion: string | null;
  /** Estado de la casilla de promociones en ese pedido. */
  readonly promotions: boolean;
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
          sucursal_id, lat, lng, distancia_km, mesa_id,
          privacidad_aceptada_at, privacidad_version, email_cliente
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
          ${order.mesaId ?? null},
          ${order.consent ? tx`now()` : null}, ${order.consent?.privacyVersion ?? null},
          ${order.emailCliente ?? null}
        )
        RETURNING id, pedido_codigo, tracking_token, estado
      `;
      const pedido = inserted[0];
      if (!pedido) {
        throw new Error("El INSERT del pedido no devolvió filas");
      }
      // Última decisión sobre promociones (dada o retirada); solo se toca si cambia.
      if (order.consent && usuario[0]) {
        await tx`
          UPDATE public.usuarios
          SET    acepta_promociones = ${order.consent.promotions}, acepta_promociones_at = now()
          WHERE  id = ${usuario[0].id}
            AND  acepta_promociones IS DISTINCT FROM ${order.consent.promotions}
        `;
      }
      await tx`
        INSERT INTO public.outbox_evento
          (restaurante_id, tipo, agregado_tipo, agregado_id, payload, clave_idempotencia)
        VALUES (
          ${order.restauranteId}, ${OUTBOX_EVENT.OrderReceived}, 'pedido', ${String(pedido.id)},
          ${tx.json({ pedido_id: pedido.id, canal: order.canal, ...emailPayload(order.emailCliente) })},
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
  /** Email al que se avisa, enmascarado («j***@gmail.com»); `null` si el pedido no tiene. */
  readonly emailAvisos: string | null;
  /** Se puede corregir el email mientras el pedido siga abierto. */
  readonly emailEditable: boolean;
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
  /** Solo los datos del método elegido (IBAN y titular, o teléfono de Bizum); null si no aplica. */
  readonly datosBancarios: Record<string, string> | null;
  /** Justificantes ya subidos y si el cliente aún puede subir otro. */
  readonly justificantes: number;
  readonly aceptaJustificante: boolean;
  readonly createdAt: string;
  readonly updatedAt: string | null;
};

/** Datos de `restaurante.datos_bancarios` que necesita cada método para que el cliente pague. */
const PAYMENT_DETAIL_KEYS: Readonly<Record<string, readonly string[]>> = {
  [PAYMENT_METHOD.Transfer]: ["titular", "iban", "banco"],
  [PAYMENT_METHOD.Bizum]: ["bizum"],
};

/**
 * Datos para pagar con el método del pedido y nada más (no se expone el resto de la ficha
 * bancaria del restaurante). null si no hay ninguno configurado.
 */
export function paymentInstructions(
  method: string | null,
  bank: unknown,
): Record<string, string> | null {
  const keys = PAYMENT_DETAIL_KEYS[method ?? ""];
  if (!keys || !bank || typeof bank !== "object") return null;
  const source = bank as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) picked[key] = value.trim();
  }
  return Object.keys(picked).length > 0 ? picked : null;
}

/**
 * Seguimiento público por token aleatorio. No devuelve teléfono, dirección ni notas.
 * Los datos para pagar solo se muestran mientras el cobro (transferencia, Bizum) esté pendiente.
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
      justificantes: number;
      justificantes_max: string | null;
      email_cliente: string | null;
      created_at: string;
      updated_at: string | null;
    }[]
  >`
    SELECT p.pedido_codigo, r.nombre AS restaurante, p.estado, p.estado_pago, p.tipo_despacho,
           p.tiempo_estimado, p.items, p.subtotal, p.costo_envio, p.total, p.metodo_pago,
           r.datos_bancarios, p.created_at, p.updated_at, p.email_cliente,
           (SELECT count(*)::int FROM public.pedido_justificante j WHERE j.pedido_id = p.id)
             AS justificantes,
           (SELECT c.config_value FROM public.restaurante_config c
            WHERE  c.restaurante_id = p.restaurante_id AND c.config_key = ${CONFIG_KEY.ProofsMaxPerOrder})
             AS justificantes_max,
           s.nombre AS local_nombre, s.direccion AS local_direccion
    FROM   public.pedidos p
    JOIN   public.restaurante r ON r.id = p.restaurante_id
    LEFT   JOIN public.sucursal s ON s.id = p.sucursal_id
    WHERE  p.tracking_token = ${token}::uuid
    LIMIT  1
  `;
  const row = rows[0];
  if (!row) return null;
  const payable = acceptsProof({
    estado: row.estado,
    estado_pago: row.estado_pago,
    metodo_pago: row.metodo_pago,
  });
  const maxProofs = maxProofsPerOrder(
    new Map(
      row.justificantes_max === null ? [] : [[CONFIG_KEY.ProofsMaxPerOrder, row.justificantes_max]],
    ),
  );
  return {
    emailAvisos: row.email_cliente ? maskEmail(row.email_cliente) : null,
    emailEditable: !FINAL_STATES.has(row.estado),
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
    datosBancarios: payable ? paymentInstructions(row.metodo_pago, row.datos_bancarios) : null,
    justificantes: row.justificantes,
    aceptaJustificante: payable && row.justificantes < maxProofs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * El cliente corrige el email de sus avisos desde el enlace de seguimiento. Solo mientras el pedido
 * esté abierto y no esté anonimizado (teléfono vacío tras borrar los datos del cliente).
 */
export async function updateTrackedOrderEmail(
  sql: Sql,
  token: string,
  email: string,
): Promise<"updated" | "not_found" | "closed"> {
  const rows = await sql<{ estado: string; telefono: string }[]>`
    UPDATE public.pedidos
    SET    email_cliente = ${email}, updated_at = now()
    WHERE  tracking_token = ${token}::uuid
      AND  estado NOT IN ${sql([...FINAL_STATES])}
      AND  telefono <> ''
    RETURNING estado, telefono
  `;
  if (rows.length > 0) return "updated";
  const [exists] = await sql<{ id: number }[]>`
    SELECT id FROM public.pedidos WHERE tracking_token = ${token}::uuid
  `;
  return exists ? "closed" : "not_found";
}
