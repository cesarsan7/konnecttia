import {
  isPlatformRole,
  PLATFORM_ROLE,
  type PlatformRole,
  platformRoleAtLeast,
} from "@konnecttia/domain";
import type { MiddlewareHandler } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { audit } from "../repositories/access";

const BEARER_PREFIX = "Bearer ";

/**
 * Frontera de seguridad del panel interno de Konnecttia (ADR 0009). Toda ruta `/plataforma/*`
 * exige un Bearer de Supabase válido y una fila ACTIVA en `plataforma_miembro` con, al menos, el
 * rol indicado: «soporte» solo lee; «admin» escribe. 401 sin sesión; 403 si no es del equipo o
 * su rol no alcanza (la denegación queda en la auditoría).
 */
export function requirePlatform(
  deps: AppDeps,
  minimumRole: PlatformRole = PLATFORM_ROLE.Support,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith(BEARER_PREFIX)) return fail(c, 401, API_ERROR.Unauthorized);
    const user = await deps.verifyToken(header.slice(BEARER_PREFIX.length));
    if (!user) return fail(c, 401, API_ERROR.Unauthorized);

    const [member] = await deps.sql<{ email: string | null; rol: string }[]>`
      SELECT email, rol FROM public.plataforma_miembro
      WHERE  user_id = ${user.userId}::uuid AND activo
    `;
    const deny = async (reason: string) => {
      await audit(deps.sql, {
        restauranteId: null,
        actorTipo: "plataforma",
        actorId: user.userId,
        accion: `${c.req.method} ${c.req.path}`,
        recursoTipo: "plataforma",
        recursoId: null,
        resultado: "denegado",
        detalle: { motivo: reason },
        requestId: c.get("requestId"),
      });
      return fail(c, 403, API_ERROR.Forbidden, { reason });
    };
    if (!member || !isPlatformRole(member.rol)) return deny("not_platform_member");
    if (!platformRoleAtLeast(member.rol, minimumRole)) return deny("platform_role_insufficient");

    c.set("user", user);
    c.set("platform", { userId: user.userId, email: member.email ?? user.email, rol: member.rol });
    await next();
  };
}
