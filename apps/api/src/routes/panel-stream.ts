import { branchFilter, PERMISSION } from "@konnecttia/access";
import { ORDER_STATUS } from "@konnecttia/domain";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppDeps, AppEnv } from "../context";
import type { Sql } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";

/**
 * Tiempo real del tablero (SSE). El navegador mantiene una conexión abierta y recibe un evento
 * «pedidos» cuando cambia algo; entonces vuelve a pedir el tablero.
 *
 * Por qué una huella y no solo outbox_evento: los pedidos de WhatsApp los crea y actualiza n8n
 * directamente en `pedidos`, sin outbox. La huella (ids, estados y cobro de los pedidos del
 * tablero, más el modo ocupado) detecta cualquier cambio venga de donde venga, con una consulta
 * pequeña cada pocos segundos en el servidor en lugar de muchas desde cada navegador.
 */

export const STREAM_EVENT = { Orders: "pedidos", Ping: "ping" } as const;

/** Cada cuánto se mira la huella. */
const CHECK_MS = 2_000;
/** Comentario para que proxies y navegador no cierren la conexión por inactividad. */
const HEARTBEAT_MS = 20_000;
/** La conexión se cierra sola y el navegador vuelve a conectar (renueva el token). */
const MAX_STREAM_MS = 10 * 60_000;
const BOARD_CLOSED_HOURS = 12;

export async function boardFingerprint(
  sql: Sql,
  restauranteId: number,
  branches: readonly number[] | null,
  now: Date,
): Promise<string> {
  const [row] = await sql<{ huella: string | null }[]>`
    SELECT md5(
             COALESCE((
               SELECT string_agg(p.id || ':' || p.estado || ':' || p.estado_pago || ':' ||
                                 COALESCE(p.updated_at::text, ''), ',' ORDER BY p.id)
               FROM   public.pedidos p
               WHERE  p.restaurante_id = ${restauranteId}
                 AND  p.estado <> ${ORDER_STATUS.InCart}
                 ${branches === null ? sql`` : sql`AND p.sucursal_id IN ${sql(branches)}`}
                 AND  COALESCE(p.updated_at, p.created_at) >
                      (${now}::timestamptz AT TIME ZONE 'UTC') - make_interval(hours => ${BOARD_CLOSED_HOURS})
             ), '') || '|' ||
             COALESCE((
               SELECT string_agg(m.id || ':' || COALESCE(m.finalizado_at::text, ''), ',' ORDER BY m.id)
               FROM   public.modo_ocupado m
               WHERE  m.restaurante_id = ${restauranteId} AND m.hasta > ${now}
             ), '')
           ) AS huella
  `;
  return row?.huella ?? "";
}

export function registerStreamRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get("/:slug/orders/stream", requirePermission(deps, PERMISSION.OrdersView), async (c) => {
    const restaurantId = c.get("restaurant").id;
    const branches = branchFilter(c.get("access"));
    if (branches !== null && branches.length === 0) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_out_of_scope" });
    }
    // Traefik / nginx: no acumular la respuesta.
    c.header("X-Accel-Buffering", "no");
    c.header("Cache-Control", "no-cache, no-transform");
    return streamSSE(c, async (stream) => {
      const started = Date.now();
      let last = await boardFingerprint(deps.sql, restaurantId, branches, deps.now());
      let lastBeat = Date.now();
      await stream.writeSSE({ event: STREAM_EVENT.Orders, data: "inicio", retry: 3000 });
      try {
        while (!stream.aborted && Date.now() - started < MAX_STREAM_MS) {
          await stream.sleep(CHECK_MS);
          if (stream.aborted) break;
          const current = await boardFingerprint(deps.sql, restaurantId, branches, deps.now());
          if (current !== last) {
            last = current;
            await stream.writeSSE({ event: STREAM_EVENT.Orders, data: "cambio" });
            lastBeat = Date.now();
          } else if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            await stream.writeSSE({ event: STREAM_EVENT.Ping, data: "" });
            lastBeat = Date.now();
          }
        }
      } catch (error) {
        // Se cierra la conexión: el navegador vuelve a conectar o pasa a sondeo.
        console.error(
          JSON.stringify({
            level: "warn",
            message: "stream del tablero cerrado",
            error: String(error),
          }),
        );
      }
    });
  });
}
