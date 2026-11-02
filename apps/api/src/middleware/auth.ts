import { authorize, type PermissionCode } from "@konnecttia/access";
import type { MiddlewareHandler } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { audit, loadAccessContext } from "../repositories/access";

const BEARER_PREFIX = "Bearer ";

/** Exige un usuario autenticado que sea miembro del restaurante de la URL. */
export function requireMember(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith(BEARER_PREFIX)) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    const user = await deps.verifyToken(header.slice(BEARER_PREFIX.length));
    if (!user) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    const restaurant = c.get("restaurant");
    const access = await loadAccessContext(deps.sql, user.userId, restaurant.id);
    if (!access) {
      return fail(c, 403, API_ERROR.Forbidden);
    }
    c.set("user", user);
    c.set("access", access);
    await next();
  };
}

/**
 * Exige un permiso: el módulo debe estar activo para el restaurante y algún rol del usuario debe
 * concederlo. Las denegaciones quedan en la auditoría.
 */
export function requirePermission(
  deps: AppDeps,
  permission: PermissionCode,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const decision = authorize(c.get("access"), permission);
    if (!decision.allowed) {
      await audit(deps.sql, {
        restauranteId: c.get("restaurant").id,
        actorTipo: "usuario",
        actorId: c.get("user").userId,
        accion: permission,
        recursoTipo: "permiso",
        recursoId: null,
        resultado: "denegado",
        detalle: { motivo: decision.reason, ruta: c.req.path },
        requestId: c.get("requestId"),
      });
      return fail(c, 403, API_ERROR.Forbidden, { reason: decision.reason, permission });
    }
    await next();
  };
}
