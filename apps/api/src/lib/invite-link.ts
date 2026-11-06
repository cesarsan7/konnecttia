import type { AppDeps } from "../context";
import { inviteEmail } from "./mailer";

/** Días que dura una invitación. */
export const INVITE_DAYS = 7;

/**
 * Base de los enlaces del panel: el Origin de la petición si CORS lo permite, o PANEL_PUBLIC_URL.
 * `null` si no hay ninguno (el panel ofrece entonces construir el enlace con su propio origen).
 */
export function panelBase(deps: AppDeps, origin: string | undefined): string | null {
  const base = origin && deps.allowedOrigins.includes(origin) ? origin : deps.panelUrl;
  return base ? base.replace(/\/$/, "") : null;
}

/** Enlace para aceptar una invitación al equipo de un restaurante. */
export function inviteLink(base: string, token: string): string {
  return `${base}/panel/unirse/${token}`;
}

/**
 * Envía la invitación por email (si hay Resend). Un fallo del envío no anula la invitación: el
 * panel ofrece copiar el enlace igualmente. Devuelve si el email salió.
 */
export async function sendInviteEmail(
  deps: AppDeps,
  input: {
    readonly origin: string | undefined;
    readonly to: string;
    readonly restaurante: string;
    readonly rol: string;
    readonly token: string;
  },
): Promise<boolean> {
  if (!deps.mailer) return false;
  const base = panelBase(deps, input.origin);
  if (!base) return false;
  try {
    await deps.mailer.send({
      to: input.to,
      ...inviteEmail({
        restaurante: input.restaurante,
        rol: input.rol,
        link: inviteLink(base, input.token),
        dias: INVITE_DAYS,
      }),
    });
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "warn",
        message: "email de invitación no enviado",
        error: String(error),
      }),
    );
    return false;
  }
}
