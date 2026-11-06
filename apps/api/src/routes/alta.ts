import { checkRestaurantSlug, isValidTimeZone, TRIAL_STATE, trialEnd } from "@konnecttia/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv, AuthenticatedUser } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { MEMBER_NAME_MAX } from "../lib/member-name";
import { createRateLimiter } from "../lib/rate-limit";
import { TURNSTILE_MAX_TOKEN_LENGTH } from "../lib/turnstile";
import { audit } from "../repositories/access";
import { addOwner, createRestaurant, knownTimeZone, SlugTaken } from "../repositories/platform";
import { loadPlatformConfig, TRIAL_PLAN } from "../repositories/trial";

/**
 * Alta autoservicio con prueba (pieza G). Apagada por defecto: `alta_autoservicio_activa` en
 * `plataforma_config`, que Konnecttia activa desde /interno. Las rutas públicas (`/config`,
 * `/slug`) solo informan; `POST /` exige sesión de Supabase con el email verificado.
 */

const BEARER_PREFIX = "Bearer ";
const SLUG_CHECKS_PER_IP_PER_MIN = 30;
const SIGNUPS_PER_IP_PER_HOUR = 5;
const CAPTCHA_FAILED_REASON = "captcha_failed";

/** Motivos (`reason`) de los rechazos del alta. */
export const SIGNUP_REASON = {
  Closed: "alta_closed",
  EmailNotVerified: "email_not_verified",
  AlreadyHasTrial: "already_has_trial",
  SlugTaken: "slug_taken",
  InvalidTimeZone: "invalid_time_zone",
  FulfillmentRequired: "fulfillment_required",
} as const;

const signupSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(100),
  zona_horaria: z.string().trim().min(1).max(64),
  local: z.object({
    nombre: z.string().trim().min(1).max(120),
    direccion: z.string().trim().max(200).optional(),
    telefono: z.string().trim().max(30).optional(),
  }),
  recogida: z.boolean(),
  reparto: z.boolean(),
  /** Nombre de quien da el alta (se guarda en su membresía). */
  miembro_nombre: z.string().trim().max(MEMBER_NAME_MAX).optional(),
  captcha_token: z.string().max(TURNSTILE_MAX_TOKEN_LENGTH).optional(),
});

type Ctx = Context<AppEnv>;

export function altaRoutes(deps: AppDeps) {
  const { sql } = deps;
  const app = new Hono<AppEnv>();
  const slugLimited = createRateLimiter(SLUG_CHECKS_PER_IP_PER_MIN, 60_000);
  const signupLimited = createRateLimiter(SIGNUPS_PER_IP_PER_HOUR, 60 * 60_000);
  const clientIp = (c: Ctx) => c.req.header(deps.clientIpHeader) ?? "desconocida";

  async function currentUser(c: Ctx): Promise<AuthenticatedUser | null> {
    const header = c.req.header("Authorization") ?? "";
    if (!header.startsWith(BEARER_PREFIX)) return null;
    return deps.verifyToken(header.slice(BEARER_PREFIX.length));
  }

  // Lo que necesita la landing: si el alta está abierta y qué límites tiene la prueba.
  app.get("/config", async (c) => {
    const config = await loadPlatformConfig(sql);
    return c.json({
      activa: config.signupActive,
      requiere_aprobacion: config.requiresApproval,
      dias: config.trialDays,
      max_pedidos: config.trialMaxOrders,
      contacto: config.contactEmail,
    });
  });

  // Comprobación en vivo de la dirección web: mismas reglas que el alta de /interno.
  app.get("/slug", async (c) => {
    if (slugLimited(clientIp(c))) return fail(c, 429, API_ERROR.RateLimited);
    const value = (c.req.query("valor") ?? "").trim();
    const problem = checkRestaurantSlug(value);
    if (problem) return c.json({ disponible: false, motivo: problem });
    const [taken] = await sql`SELECT 1 FROM public.restaurante WHERE slug = ${value}`;
    return c.json(
      taken ? { disponible: false, motivo: SIGNUP_REASON.SlugTaken } : { disponible: true },
    );
  });

  app.post("/", async (c) => {
    // Primero el límite por IP (barato), antes de consultar a Supabase.
    if (signupLimited(clientIp(c))) return fail(c, 429, API_ERROR.RateLimited);
    const user = await currentUser(c);
    if (!user) return fail(c, 401, API_ERROR.Unauthorized);

    const config = await loadPlatformConfig(sql);
    if (!config.signupActive) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: SIGNUP_REASON.Closed });
    }
    if (user.emailVerified !== true) {
      return fail(c, 403, API_ERROR.Forbidden, { reason: SIGNUP_REASON.EmailNotVerified });
    }

    const parsed = signupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, 400, API_ERROR.InvalidBody, { field: parsed.error.issues[0]?.path.join(".") });
    }
    const input = parsed.data;

    if (deps.verifyCaptcha) {
      const human = await deps.verifyCaptcha(
        input.captcha_token,
        c.req.header(deps.clientIpHeader) ?? null,
      );
      if (!human) return fail(c, 422, API_ERROR.CaptchaFailed, { reason: CAPTCHA_FAILED_REASON });
    }

    // Una prueba por usuario.
    const [existing] = await sql`
      SELECT 1 FROM public.restaurante_prueba WHERE user_id = ${user.userId}::uuid
    `;
    if (existing) {
      return fail(c, 409, API_ERROR.Conflict, { reason: SIGNUP_REASON.AlreadyHasTrial });
    }

    const slug = input.slug;
    const slugProblem = checkRestaurantSlug(slug);
    if (slugProblem)
      return fail(c, 422, API_ERROR.Unprocessable, { reason: slugProblem, field: "slug" });
    if (!isValidTimeZone(input.zona_horaria) || !(await knownTimeZone(sql, input.zona_horaria))) {
      return fail(c, 422, API_ERROR.Unprocessable, {
        reason: SIGNUP_REASON.InvalidTimeZone,
        field: "zona_horaria",
      });
    }
    if (!input.recogida && !input.reparto) {
      return fail(c, 422, API_ERROR.Unprocessable, { reason: SIGNUP_REASON.FulfillmentRequired });
    }

    const now = deps.now();
    const state = config.requiresApproval ? TRIAL_STATE.Pending : TRIAL_STATE.Active;
    let created: Awaited<ReturnType<typeof createRestaurant>>;
    try {
      created = await sql.begin(async (tx) => {
        const restaurant = await createRestaurant(
          tx,
          {
            nombre: input.nombre,
            slug,
            zonaHoraria: input.zona_horaria,
            plan: TRIAL_PLAN,
            local: input.local,
            recogida: input.recogida,
            reparto: input.reparto,
          },
          now,
        );
        await addOwner(tx, {
          restauranteId: restaurant.id,
          userId: user.userId,
          email: user.email,
          nombre: input.miembro_nombre || null,
          apodo: null,
        });
        // Los límites son copias de la configuración de hoy: cambiarla después no altera esta prueba.
        await tx`
          INSERT INTO public.restaurante_prueba
            (restaurante_id, user_id, email, inicio, fin, max_pedidos, estado, updated_at)
          VALUES (${restaurant.id}, ${user.userId}::uuid, ${user.email}, ${now}::timestamptz,
                  ${trialEnd(now, config.trialDays)}::timestamptz, ${config.trialMaxOrders},
                  ${state}, ${now}::timestamptz)
        `;
        return restaurant;
      });
    } catch (error) {
      if (error instanceof SlugTaken) {
        return fail(c, 409, API_ERROR.Conflict, { reason: SIGNUP_REASON.SlugTaken, field: "slug" });
      }
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        // Carrera: o el slug o la prueba del usuario se crearon entre la comprobación y el insert.
        const constraint = (error as { constraint_name?: string }).constraint_name ?? "";
        return constraint.includes("user_id")
          ? fail(c, 409, API_ERROR.Conflict, { reason: SIGNUP_REASON.AlreadyHasTrial })
          : fail(c, 409, API_ERROR.Conflict, { reason: SIGNUP_REASON.SlugTaken, field: "slug" });
      }
      throw error;
    }

    await audit(sql, {
      restauranteId: created.id,
      actorTipo: "usuario",
      actorId: user.userId,
      accion: "alta.crear",
      recursoTipo: "restaurante",
      recursoId: String(created.id),
      resultado: "ok",
      detalle: {
        slug,
        plan: TRIAL_PLAN,
        estado: state,
        zona_horaria: input.zona_horaria,
        local: input.local.nombre,
        recogida: input.recogida,
        reparto: input.reparto,
        dias: config.trialDays,
        max_pedidos: config.trialMaxOrders,
      },
      requestId: c.get("requestId"),
    });
    return c.json({ slug, estado: state }, 201);
  });

  return app;
}
