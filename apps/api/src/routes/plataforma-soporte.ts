import { PLATFORM_ROLE } from "@konnecttia/domain";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import { CONFIG_KEY, loadConfig } from "../repositories/restaurants";
import { listSupportLog, SUPPORT_ACTION, SUPPORT_MINUTES } from "../repositories/support-access";

/**
 * Soporte de solo lectura. El equipo de Konnecttia (admin o soporte) puede abrir el panel de un
 * restaurante AJENO durante una hora, con un motivo obligatorio. Solo consulta (la API rechaza
 * cualquier escritura en ese modo), no ve datos personales de clientes, y la entrada y la salida
 * quedan en la auditoría del restaurante.
 */
const visibleSchema = z.object({ visible: z.boolean() });
const enterSchema = z.object({ motivo: z.string().trim().min(10).max(300) });

export function registerPlatformSupportRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  const restaurant = async (rawId: string) => {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const [row] = await deps.sql<{ id: number; slug: string | null }[]>`
      SELECT id, slug FROM public.restaurante WHERE id = ${id}
    `;
    return row ?? null;
  };

  app.post("/restaurantes/:id/soporte", reader, async (c) => {
    const found = await restaurant(c.req.param("id"));
    if (!found) return fail(c, 404, API_ERROR.RestaurantNotFound);
    if (!found.slug) return fail(c, 409, API_ERROR.Conflict, { reason: "no_slug" });
    const parsed = enterSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "motivo" });

    const platform = c.get("platform");
    const expiraEn = new Date(deps.now().getTime() + SUPPORT_MINUTES * 60_000);
    await audit(deps.sql, {
      restauranteId: found.id,
      actorTipo: "plataforma",
      actorId: platform.userId,
      accion: SUPPORT_ACTION.Enter,
      recursoTipo: "restaurante",
      recursoId: String(found.id),
      resultado: "ok",
      detalle: {
        motivo: parsed.data.motivo,
        email: platform.email,
        rol: platform.rol,
        expira_en: expiraEn.toISOString(),
      },
      requestId: c.get("requestId"),
    });
    return c.json(
      { slug: found.slug, expira_en: expiraEn.toISOString(), minutos: SUPPORT_MINUTES },
      201,
    );
  });

  /** Registro para Konnecttia: accesos de soporte, cambios hechos desde /interno y si el restaurante lo ve. */
  app.get("/restaurantes/:id/registro", reader, async (c) => {
    const found = await restaurant(c.req.param("id"));
    if (!found) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const config = await loadConfig(deps.sql, found.id);
    const [accesos, cambios] = await Promise.all([
      listSupportLog(deps.sql, found.id),
      deps.sql<
        { id: number; fecha: Date; accion: string; email: string | null; detalle: unknown }[]
      >`
        SELECT a.id::int AS id, a.created_at AS fecha, a.accion, pm.email, a.detalle
        FROM   public.auditoria a
        LEFT   JOIN public.plataforma_miembro pm ON pm.user_id::text = a.actor_id
        WHERE  a.restaurante_id = ${found.id} AND a.actor_tipo = 'plataforma'
          AND  a.accion LIKE 'plataforma.%'
          AND  a.accion NOT IN (${SUPPORT_ACTION.Enter}, ${SUPPORT_ACTION.Leave})
        ORDER  BY a.id DESC
        LIMIT  50
      `,
    ]);
    return c.json({
      visible_al_restaurante: config.get(CONFIG_KEY.SupportLogVisible) === "true",
      accesos,
      cambios: cambios.map((row) => ({ ...row, fecha: row.fecha.toISOString() })),
    });
  });

  app.put("/restaurantes/:id/registro-soporte", writer, async (c) => {
    const found = await restaurant(c.req.param("id"));
    if (!found) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = visibleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody, { field: "visible" });
    const { visible } = parsed.data;
    if (visible) {
      await deps.sql`
        INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
        VALUES (${found.id}, ${CONFIG_KEY.SupportLogVisible}, 'true',
                'El restaurante ve el registro de accesos de soporte')
        ON CONFLICT (config_key, restaurante_id)
        DO UPDATE SET config_value = 'true', updated_at = now()
      `;
    } else {
      await deps.sql`
        DELETE FROM public.restaurante_config
        WHERE  restaurante_id = ${found.id} AND config_key = ${CONFIG_KEY.SupportLogVisible}
      `;
    }
    const platform = c.get("platform");
    await audit(deps.sql, {
      restauranteId: found.id,
      actorTipo: "plataforma",
      actorId: platform.userId,
      accion: "plataforma.soporte.registro_visible",
      recursoTipo: "restaurante",
      recursoId: String(found.id),
      resultado: "ok",
      detalle: { visible },
      requestId: c.get("requestId"),
    });
    return c.json({ visible_al_restaurante: visible });
  });

  app.delete("/restaurantes/:id/soporte", reader, async (c) => {
    const found = await restaurant(c.req.param("id"));
    if (!found) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const platform = c.get("platform");
    await audit(deps.sql, {
      restauranteId: found.id,
      actorTipo: "plataforma",
      actorId: platform.userId,
      accion: SUPPORT_ACTION.Leave,
      recursoTipo: "restaurante",
      recursoId: String(found.id),
      resultado: "ok",
      detalle: { email: platform.email },
      requestId: c.get("requestId"),
    });
    return c.json({ ok: true });
  });
}
