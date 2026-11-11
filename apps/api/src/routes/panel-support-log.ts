import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { requirePermission } from "../middleware/auth";
import { CONFIG_KEY, loadConfig } from "../repositories/restaurants";
import { listSupportLog } from "../repositories/support-access";

/**
 * Registro de los accesos de soporte de Konnecttia al restaurante. Solo lo ve quien gestiona el
 * equipo, y solo si Konnecttia lo ha habilitado para este restaurante (si no, `habilitado: false`).
 */
export function registerSupportLogRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get("/:slug/soporte/registro", requirePermission(deps, PERMISSION.TeamManage), async (c) => {
    const restaurant = c.get("restaurant");
    const config = await loadConfig(deps.sql, restaurant.id);
    if (config.get(CONFIG_KEY.SupportLogVisible) !== "true") {
      return c.json({ habilitado: false, accesos: [] });
    }
    return c.json({ habilitado: true, accesos: await listSupportLog(deps.sql, restaurant.id) });
  });
}
