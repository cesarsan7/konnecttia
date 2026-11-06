import { PERMISSION } from "@konnecttia/access";
import type { Hono } from "hono";
import type { AppDeps, AppEnv } from "../context";
import { requirePermission } from "../middleware/auth";

/**
 * Checklist de primeros pasos (pieza G): qué falta por configurar para que el restaurante pueda
 * recibir pedidos. Solo booleans calculados con lo que ya hay en la base; la web decide cómo
 * enlazar cada paso. `zonas` es null cuando el restaurante no ofrece reparto.
 */
export function registerOnboardingRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get("/:slug/primeros-pasos", requirePermission(deps, PERMISSION.SettingsView), async (c) => {
    const restaurant = c.get("restaurant");
    const id = restaurant.id;
    const [row] = await deps.sql<
      { logo: boolean; carta: boolean; horario: boolean; zonas: boolean; equipo: boolean }[]
    >`
      SELECT COALESCE(btrim(r.logo_url), '') <> '' AS logo,
             EXISTS (SELECT 1 FROM public.menu_item i
                     WHERE i.restaurante_id = ${id} AND i.is_active) AS carta,
             (EXISTS (SELECT 1 FROM public.horarios h
                      WHERE h.restaurante_id = ${id} AND h.disponible AND h.apertura_1 IS NOT NULL)
              OR EXISTS (SELECT 1 FROM public.sucursal_horario sh
                         JOIN public.sucursal s ON s.id = sh.sucursal_id
                         WHERE s.restaurante_id = ${id} AND sh.disponible
                           AND sh.apertura_1 IS NOT NULL)) AS horario,
             EXISTS (SELECT 1 FROM public.delivery_zone z
                     WHERE z.restaurante_id = ${id} AND z.is_active) AS zonas,
             ((SELECT count(*) FROM public.local_memberships m WHERE m.restaurante_id = ${id}) > 1
              OR EXISTS (SELECT 1 FROM public.restaurant_invites v
                         WHERE v.restaurante_id = ${id} AND v.rol_id IS NOT NULL
                           AND v.revocada_at IS NULL AND v.used_at IS NULL)) AS equipo
      FROM   public.restaurante r WHERE r.id = ${id}
    `;
    return c.json({
      pasos: {
        logo: row?.logo ?? false,
        carta: row?.carta ?? false,
        horario: row?.horario ?? false,
        pagos: restaurant.paymentMethods.length > 0,
        zonas: restaurant.deliveryEnabled ? (row?.zonas ?? false) : null,
        equipo: row?.equipo ?? false,
      },
    });
  });
}
