import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { API_ERROR, fail } from "../lib/http";
import { panelBase } from "../lib/invite-link";
import { recoveryEmail } from "../lib/mailer";
import { createRateLimiter } from "../lib/rate-limit";

/** Peticiones de recuperación por IP cada 15 minutos. */
const RECOVERIES_PER_IP = 5;
/** Emails de recuperación a una misma dirección por hora. */
const RECOVERIES_PER_EMAIL = 3;

/** Cómo salió el email: con Resend desde la API, o el panel debe pedírselo a Supabase. */
export const RECOVERY_SENDER = { EasyOrder: "easyorder", Supabase: "supabase" } as const;

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

/**
 * «¿Olvidaste tu contraseña?»: la API genera el enlace de recuperación de Supabase (clave de
 * servicio) y lo envía con Resend, con el mismo aspecto que las invitaciones. Así no depende del
 * SMTP de Supabase. La respuesta es la misma exista o no la cuenta (no revela qué emails están
 * dados de alta). Sin clave de servicio o sin Resend, responde `supabase` y el panel usa
 * `resetPasswordForEmail` como hasta ahora.
 */
export function authRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const ipLimited = createRateLimiter(RECOVERIES_PER_IP, 15 * 60_000);
  const emailLimited = createRateLimiter(RECOVERIES_PER_EMAIL, 60 * 60_000);

  app.post("/recuperar", async (c) => {
    if (ipLimited(c.req.header(deps.clientIpHeader) ?? "desconocida")) {
      return fail(c, 429, API_ERROR.RateLimited);
    }
    const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, API_ERROR.InvalidBody);
    const email = parsed.data.email;

    const base = panelBase(deps, c.req.header("Origin"));
    if (!deps.generateRecoveryLink || !deps.mailer || !base) {
      return c.json({ ok: true, enviado_por: RECOVERY_SENDER.Supabase });
    }
    // Pasado el límite por email se responde igual, sin enviar (evita bombardear un buzón).
    if (!emailLimited(email)) {
      const link = await deps.generateRecoveryLink(email, `${base}/panel/restablecer`);
      if (link) {
        try {
          await deps.mailer.send({ to: email, ...recoveryEmail({ link }) });
        } catch (error) {
          console.error(
            JSON.stringify({
              level: "warn",
              message: "email de recuperación no enviado",
              error: String(error),
            }),
          );
        }
      }
    }
    return c.json({ ok: true, enviado_por: RECOVERY_SENDER.EasyOrder });
  });

  return app;
}
