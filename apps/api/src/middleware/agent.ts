import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { agentModuleActive, loadActiveChannel } from "../repositories/agent";
import { findRestaurantById } from "../repositories/restaurants";

/** Cabecera con el secreto compartido entre n8n y la API. */
export const AGENT_SECRET_HEADER = "X-Agente-Secreto";

/** Motivos de rechazo de las rutas del agente (en `reason`). */
export const AGENT_DENY_REASON = {
  NotConfigured: "agente_no_configurado",
  ChannelInactive: "canal_no_activo",
  ModuleInactive: "modulo_agente_inactivo",
} as const;

const CHANNEL_ID_PATTERN = /^[1-9][0-9]{0,17}$/;

function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Solo comprueba el secreto de n8n (rutas que no son de un canal, como el mantenimiento). */
export function requireAgentSecret(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const expected = deps.agentSecret ?? null;
    if (!expected) {
      return fail(c, 503, API_ERROR.ServiceUnavailable, {
        reason: AGENT_DENY_REASON.NotConfigured,
      });
    }
    if (!sameSecret(c.req.header(AGENT_SECRET_HEADER) ?? "", expected)) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    await next();
  };
}

/**
 * Autentica a n8n (secreto compartido) y resuelve en el servidor el canal, el restaurante y el
 * módulo del agente. n8n nunca indica el restaurante: solo el canal por el que entró el mensaje.
 */
export function resolveAgentChannel(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const expected = deps.agentSecret ?? null;
    if (!expected) {
      return fail(c, 503, API_ERROR.ServiceUnavailable, {
        reason: AGENT_DENY_REASON.NotConfigured,
      });
    }
    if (!sameSecret(c.req.header(AGENT_SECRET_HEADER) ?? "", expected)) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    const raw = c.req.param("canalId") ?? "";
    const channel = CHANNEL_ID_PATTERN.test(raw)
      ? await loadActiveChannel(deps.sql, Number(raw))
      : null;
    if (!channel) {
      return fail(c, 404, API_ERROR.NotFound, { reason: AGENT_DENY_REASON.ChannelInactive });
    }
    const [restaurant, moduleActive] = await Promise.all([
      findRestaurantById(deps.sql, channel.restauranteId),
      agentModuleActive(deps.sql, channel.restauranteId),
    ]);
    if (!restaurant) {
      return fail(c, 404, API_ERROR.RestaurantNotFound);
    }
    if (!moduleActive) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: AGENT_DENY_REASON.ModuleInactive });
    }
    c.set("agentChannel", channel);
    c.set("restaurant", restaurant);
    await next();
  };
}
