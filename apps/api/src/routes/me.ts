import { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";

const BEARER_PREFIX = "Bearer ";

/**
 * Datos de la cuenta que ha iniciado sesión. El panel lo usa justo después del login para saber
 * a qué restaurante llevar al usuario (o mostrarle un selector si es miembro de varios).
 */
export function meRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.get("/restaurantes", async (c) => {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith(BEARER_PREFIX)) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    const user = await deps.verifyToken(header.slice(BEARER_PREFIX.length));
    if (!user) {
      return fail(c, 401, API_ERROR.Unauthorized);
    }
    const rows = await deps.sql<{ slug: string; nombre: string; roles: string[] }[]>`
      SELECT r.slug, r.nombre,
             COALESCE(array_agg(rl.nombre ORDER BY rl.id) FILTER (WHERE rl.id IS NOT NULL), '{}') AS roles
      FROM   public.local_memberships m
      JOIN   public.restaurante r       ON r.id = m.restaurante_id
      LEFT   JOIN public.membresia_rol mr ON mr.membership_id = m.id
      LEFT   JOIN public.rol rl           ON rl.id = mr.rol_id
      WHERE  m.user_id = ${user.userId}::uuid AND r.slug IS NOT NULL
      GROUP  BY r.id, r.slug, r.nombre
      ORDER  BY r.nombre
    `;
    return c.json({ email: user.email, restaurantes: rows });
  });

  return app;
}
