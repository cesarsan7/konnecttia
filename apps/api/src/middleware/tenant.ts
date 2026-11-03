import type { MiddlewareHandler } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { findRestaurantBySlug } from "../repositories/restaurants";

/**
 * Resuelve el restaurante a partir del slug de la URL, en el servidor. Ningún parámetro enviado
 * por el navegador puede cambiar el restaurante de la petición.
 */
export function resolveRestaurant(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const slug = c.req.param("slug") ?? "";
    const restaurant = await findRestaurantBySlug(deps.sql, slug);
    if (!restaurant) {
      return fail(c, 404, API_ERROR.RestaurantNotFound);
    }
    c.set("restaurant", restaurant);
    await next();
  };
}
