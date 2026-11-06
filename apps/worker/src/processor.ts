import { createHash } from "node:crypto";
import { MODULE } from "@konnecttia/access";
import type { Mailer } from "@konnecttia/notifications";
import { loadNoticeConfig } from "./config";
import type { Sql } from "./db";
import type { Logger } from "./logger";
import { HANDLED_EVENTS, type OrderForNotice, planDeliveries, SKIP_REASON } from "./plan";
import { decideRetry, RETRY_DECISION, type RetryPolicy } from "./retry";

/** `outbox_evento.estado`. */
const EVENT_STATE = {
  Pending: "pendiente",
  Processing: "procesando",
  Sent: "enviado",
  Failed: "fallido",
  Discarded: "descartado",
} as const;

/** `aviso_envio.canal`. */
const CHANNEL_EMAIL = "email";

export type ProcessorDeps = {
  readonly sql: Sql;
  /** null si no hay RESEND_API_KEY: los eventos se descartan con motivo, sin perderlos. */
  readonly mailer: Mailer | null;
  readonly log: Logger;
  readonly panelUrl: string | null;
  readonly webUrl: string | null;
  readonly batchSize: number;
  readonly leaseSeconds: number;
  readonly retry: RetryPolicy;
};

type ClaimedEvent = {
  id: number;
  restaurante_id: number;
  tipo: string;
  agregado_id: string;
  payload: unknown;
  intentos: number;
};

export const EVENT_RESULT = {
  Sent: "enviado",
  Skipped: "omitido",
  Retry: "reintento",
  Failed: "fallido",
} as const;
export type EventResult = (typeof EVENT_RESULT)[keyof typeof EVENT_RESULT];

type Outcome =
  | { readonly kind: typeof EVENT_RESULT.Sent; readonly sent: number; readonly alreadySent: number }
  | { readonly kind: typeof EVENT_RESULT.Skipped; readonly reason: string }
  | { readonly kind: "error"; readonly error: string };

const hashRecipient = (email: string) =>
  createHash("sha256").update(email.toLowerCase()).digest("hex");

/** Texto de error seguro para guardar y registrar: sin cuerpos de respuesta ni datos personales. */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (/^Resend respondió \d{3}$/.test(error.message)) return error.message;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.name}:${code}` : error.name;
  }
  return "ErrorDesconocido";
}

/**
 * Reclama un lote de eventos pendientes (o con la reserva vencida) con `FOR UPDATE SKIP LOCKED`.
 * Reclamar suma un intento y reserva el evento `leaseSeconds`: si el proceso muere a medias, otro
 * lo recoge cuando la reserva vence, y el máximo de intentos sigue acotando los reintentos.
 */
async function claimBatch(deps: ProcessorDeps): Promise<ClaimedEvent[]> {
  return deps.sql<ClaimedEvent[]>`
    WITH due AS (
      SELECT id
      FROM   public.outbox_evento
      WHERE  tipo = ANY(${HANDLED_EVENTS}::text[])
        AND  intentos < ${deps.retry.maxAttempts}
        AND  estado IN (${EVENT_STATE.Pending}, ${EVENT_STATE.Failed}, ${EVENT_STATE.Processing})
        AND  disponible_en <= now()
      ORDER  BY disponible_en, id
      LIMIT  ${deps.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.outbox_evento e
    SET    estado = ${EVENT_STATE.Processing},
           intentos = e.intentos + 1,
           disponible_en = now() + make_interval(secs => ${deps.leaseSeconds})
    FROM   due
    WHERE  e.id = due.id
    RETURNING e.id, e.restaurante_id, e.tipo, e.agregado_id, e.payload, e.intentos
  `;
}

/** Eventos cuya reserva venció con todos los intentos gastados: se marcan como fallidos. */
async function failExpiredLeases(deps: ProcessorDeps): Promise<number> {
  const rows = await deps.sql`
    UPDATE public.outbox_evento
    SET    estado = ${EVENT_STATE.Failed}, ultimo_error = 'reserva_vencida', procesado_at = now()
    WHERE  tipo = ANY(${HANDLED_EVENTS}::text[])
      AND  estado = ${EVENT_STATE.Processing}
      AND  intentos >= ${deps.retry.maxAttempts}
      AND  disponible_en <= now()
    RETURNING id
  `;
  return rows.length;
}

/** Sin proveedor de email: descarta (con motivo) los eventos pendientes para no reintentarlos sin fin. */
async function discardWithoutProvider(deps: ProcessorDeps): Promise<number> {
  const rows = await deps.sql`
    UPDATE public.outbox_evento
    SET    estado = ${EVENT_STATE.Discarded}, ultimo_error = ${SKIP_REASON.NoProvider}, procesado_at = now()
    WHERE  id IN (
      SELECT id FROM public.outbox_evento
      WHERE  tipo = ANY(${HANDLED_EVENTS}::text[])
        AND  estado IN (${EVENT_STATE.Pending}, ${EVENT_STATE.Failed})
        AND  intentos < ${deps.retry.maxAttempts}
        AND  disponible_en <= now()
      ORDER  BY id
      LIMIT  ${deps.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.length;
}

type OrderRow = {
  id: number;
  pedido_codigo: string | null;
  tipo_despacho: string | null;
  canal: string;
  nombre: string | null;
  total: string | null;
  tracking_token: string;
  restaurante_nombre: string;
  restaurante_slug: string | null;
};

async function loadOrder(sql: Sql, event: ClaimedEvent): Promise<OrderForNotice | null> {
  const orderId = Number(event.agregado_id);
  if (!Number.isInteger(orderId)) return null;
  // El pedido se busca siempre por restaurante del evento: un evento no puede leer otro tenant.
  const rows = await sql<OrderRow[]>`
    SELECT p.id, p.pedido_codigo, p.tipo_despacho, p.canal,
           COALESCE(NULLIF(p.nombre_pedido, ''), u.nombre) AS nombre,
           p.total, p.tracking_token, r.nombre AS restaurante_nombre, r.slug AS restaurante_slug
    FROM   public.pedidos p
    JOIN   public.restaurante r ON r.id = p.restaurante_id
    LEFT JOIN public.usuarios u ON u.id = p.usuario_id
    WHERE  p.id = ${orderId} AND p.restaurante_id = ${event.restaurante_id}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    codigo: row.pedido_codigo,
    tipoDespacho: row.tipo_despacho,
    canal: row.canal,
    nombre: row.nombre,
    totalCents: Math.round(Number(row.total ?? 0) * 100),
    trackingToken: row.tracking_token,
    restauranteNombre: row.restaurante_nombre,
    restauranteSlug: row.restaurante_slug,
  };
}

/** El módulo «Avisos por email» es de núcleo: está activo salvo que alguien lo suspenda o cancele. */
async function emailModuleActive(sql: Sql, restauranteId: number): Promise<boolean> {
  const rows = await sql<{ blocked: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM public.restaurante_modulo
      WHERE  restaurante_id = ${restauranteId} AND modulo_code = ${MODULE.EmailNotifications}
        AND  estado <> 'activo'
    ) AS blocked
  `;
  return !(rows[0]?.blocked ?? false);
}

async function processEvent(
  deps: ProcessorDeps,
  mailer: Mailer,
  event: ClaimedEvent,
): Promise<Outcome> {
  const order = await loadOrder(deps.sql, event);
  if (!order) return { kind: EVENT_RESULT.Skipped, reason: SKIP_REASON.OrderMissing };

  const [config, moduleActive] = await Promise.all([
    loadNoticeConfig(deps.sql, event.restaurante_id),
    emailModuleActive(deps.sql, event.restaurante_id),
  ]);
  const plan = planDeliveries({
    tipo: event.tipo,
    payload: event.payload,
    order,
    config,
    moduleActive,
    panelUrl: deps.panelUrl,
    webUrl: deps.webUrl,
  });
  if (plan.deliveries.length === 0) {
    return {
      kind: EVENT_RESULT.Skipped,
      reason: plan.skipped.join(",") || SKIP_REASON.LocalDisabled,
    };
  }

  let sent = 0;
  let alreadySent = 0;
  let firstError: string | null = null;
  const seen = new Set<string>();
  for (const delivery of plan.deliveries) {
    const hash = hashRecipient(delivery.to);
    if (seen.has(hash)) continue; // La misma persona en el local y como cliente recibe un solo email.
    seen.add(hash);

    // Idempotencia: si este evento ya envió a este destinatario, no se repite.
    const done = await deps.sql`
      SELECT 1 FROM public.aviso_envio
      WHERE  evento_id = ${event.id} AND canal = ${CHANNEL_EMAIL} AND destinatario_hash = ${hash}
    `;
    if (done.length > 0) {
      alreadySent += 1;
      continue;
    }
    try {
      await mailer.send({ to: delivery.to, ...delivery.message });
    } catch (error) {
      firstError ??= describeError(error);
      continue; // Los demás destinatarios se intentan igualmente.
    }
    await deps.sql`
      INSERT INTO public.aviso_envio (evento_id, restaurante_id, canal, destinatario_tipo, destinatario_hash)
      VALUES (${event.id}, ${event.restaurante_id}, ${CHANNEL_EMAIL}, ${delivery.kind}, ${hash})
      ON CONFLICT (evento_id, canal, destinatario_hash) DO NOTHING
    `;
    sent += 1;
  }
  if (firstError) return { kind: "error", error: firstError };
  return { kind: EVENT_RESULT.Sent, sent, alreadySent };
}

async function settle(
  deps: ProcessorDeps,
  event: ClaimedEvent,
  outcome: Outcome,
): Promise<EventResult> {
  const { sql } = deps;
  if (outcome.kind === EVENT_RESULT.Sent) {
    await sql`
      UPDATE public.outbox_evento
      SET    estado = ${EVENT_STATE.Sent}, ultimo_error = NULL, procesado_at = now()
      WHERE  id = ${event.id}
    `;
    return EVENT_RESULT.Sent;
  }
  if (outcome.kind === EVENT_RESULT.Skipped) {
    await sql`
      UPDATE public.outbox_evento
      SET    estado = ${EVENT_STATE.Discarded}, ultimo_error = ${outcome.reason}, procesado_at = now()
      WHERE  id = ${event.id}
    `;
    return EVENT_RESULT.Skipped;
  }
  const decision = decideRetry(event.intentos, deps.retry);
  if (decision.kind === RETRY_DECISION.Retry) {
    await sql`
      UPDATE public.outbox_evento
      SET    estado = ${EVENT_STATE.Failed}, ultimo_error = ${outcome.error},
             disponible_en = now() + make_interval(secs => ${decision.delaySeconds})
      WHERE  id = ${event.id}
    `;
    return EVENT_RESULT.Retry;
  }
  await sql`
    UPDATE public.outbox_evento
    SET    estado = ${EVENT_STATE.Failed}, ultimo_error = ${outcome.error}, procesado_at = now()
    WHERE  id = ${event.id}
  `;
  return EVENT_RESULT.Failed;
}

/**
 * Procesa un lote del outbox. Devuelve cuántos eventos se trataron (el bucle sigue sin esperar si
 * el lote vino lleno).
 */
export async function runBatch(deps: ProcessorDeps): Promise<number> {
  const expired = await failExpiredLeases(deps);
  if (expired > 0) deps.log.warn("reservas_vencidas", { eventos: expired });

  if (!deps.mailer) {
    const discarded = await discardWithoutProvider(deps);
    if (discarded > 0) deps.log.warn("eventos_descartados_sin_proveedor", { eventos: discarded });
    return discarded;
  }

  const events = await claimBatch(deps);
  for (const event of events) {
    let outcome: Outcome;
    try {
      outcome = await processEvent(deps, deps.mailer, event);
    } catch (error) {
      outcome = { kind: "error", error: describeError(error) };
    }
    let result: EventResult;
    try {
      result = await settle(deps, event, outcome);
    } catch (error) {
      // Sin poder anotar el resultado, la reserva vence sola y otro intento lo recoge.
      deps.log.error("evento_sin_anotar", { evento_id: event.id, error: describeError(error) });
      continue;
    }
    deps.log.info("evento_procesado", {
      evento_id: event.id,
      tipo: event.tipo,
      restaurante_id: event.restaurante_id,
      intento: event.intentos,
      resultado: result,
      ...(outcome.kind === EVENT_RESULT.Sent
        ? { enviados: outcome.sent, ya_enviados: outcome.alreadySent }
        : {}),
      ...(outcome.kind === EVENT_RESULT.Skipped ? { motivo: outcome.reason } : {}),
      ...(outcome.kind === "error" ? { error: outcome.error } : {}),
    });
  }
  return events.length;
}
