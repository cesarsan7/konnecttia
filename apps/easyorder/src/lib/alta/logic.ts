import { isValidTimeZone, slugFromName } from "@konnecttia/domain";
import { slugMessage } from "../interno/logic";
import type { ApiErrorBody } from "../types";
import type { AltaConfig, SignupBody, SlugCheck } from "./types";

/** Lógica pura del asistente de alta: validación por paso, cuerpo de la API, textos y avisos. */

export const SIGNUP_STEP = { Restaurant: 0, Branch: 1, Service: 2 } as const;
export type SignupStep = (typeof SIGNUP_STEP)[keyof typeof SIGNUP_STEP];
export const SIGNUP_STEP_LABELS = ["Tu restaurante", "Tu local", "Servicio"] as const;
export const LAST_STEP = SIGNUP_STEP.Service;

export type SignupForm = {
  readonly nombre: string;
  readonly slug: string;
  readonly localNombre: string;
  readonly direccion: string;
  readonly telefono: string;
  readonly zonaHoraria: string;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly miembroNombre: string;
};

export type SignupErrors = Partial<Record<keyof SignupForm | "servicio", string>>;

export const EMPTY_SIGNUP: SignupForm = {
  nombre: "",
  slug: "",
  localNombre: "",
  direccion: "",
  telefono: "",
  zonaHoraria: "",
  recogida: true,
  reparto: false,
  miembroNombre: "",
};

const MEMBER_NAME_MAX = 80;

/** Zona horaria del navegador si es válida; si no, vacío (la persona la escribe). */
export function suggestedTimeZone(
  read: () => string | undefined = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  try {
    const zone = read();
    return zone && isValidTimeZone(zone) ? zone : "";
  } catch {
    return "";
  }
}

/** Dirección web propuesta desde el nombre (mientras la persona no la haya tocado). */
export function suggestSlug(name: string): string {
  return slugFromName(name);
}

/** Valida los campos de un paso (la API repite todas las comprobaciones). */
export function validateStep(step: SignupStep, form: SignupForm): SignupErrors {
  const errors: { -readonly [K in keyof SignupErrors]: string } = {};
  if (step === SIGNUP_STEP.Restaurant) {
    if (!form.nombre.trim()) errors.nombre = "Escribe el nombre de tu restaurante.";
    else if (form.nombre.trim().length > 120) errors.nombre = "Admite hasta 120 caracteres.";
    const slug = slugMessage(form.slug.trim());
    if (slug) errors.slug = slug;
    if (form.miembroNombre.trim().length > MEMBER_NAME_MAX) {
      errors.miembroNombre = `Admite hasta ${MEMBER_NAME_MAX} caracteres.`;
    }
  }
  if (step === SIGNUP_STEP.Branch) {
    if (!form.localNombre.trim()) errors.localNombre = "Escribe el nombre del local.";
    else if (form.localNombre.trim().length > 120) {
      errors.localNombre = "Admite hasta 120 caracteres.";
    }
    if (form.direccion.trim().length > 200) errors.direccion = "Admite hasta 200 caracteres.";
    if (form.telefono.trim().length > 30) errors.telefono = "Admite hasta 30 caracteres.";
    if (!isValidTimeZone(form.zonaHoraria.trim())) {
      errors.zonaHoraria = "Elige una zona horaria válida (por ejemplo, Atlantic/Canary).";
    }
  }
  if (step === SIGNUP_STEP.Service && !form.recogida && !form.reparto) {
    errors.servicio = "Elige al menos una forma de servicio: recogida o reparto.";
  }
  return errors;
}

/** ¿Hay algún error? */
export const hasErrors = (errors: SignupErrors): boolean => Object.keys(errors).length > 0;

/** Cuerpo de POST /alta a partir del formulario ya validado. */
export function toSignupBody(form: SignupForm, captchaToken: string | null): SignupBody {
  const direccion = form.direccion.trim();
  const telefono = form.telefono.trim();
  const miembro = form.miembroNombre.trim();
  return {
    nombre: form.nombre.trim(),
    slug: form.slug.trim(),
    zona_horaria: form.zonaHoraria.trim(),
    local: {
      nombre: form.localNombre.trim(),
      ...(direccion ? { direccion } : {}),
      ...(telefono ? { telefono } : {}),
    },
    recogida: form.recogida,
    reparto: form.reparto,
    ...(miembro ? { miembro_nombre: miembro } : {}),
    ...(captchaToken ? { captcha_token: captchaToken } : {}),
  };
}

/** Texto de la comprobación en vivo de la dirección web; null si está disponible. */
export function slugCheckMessage(check: SlugCheck): string | null {
  if (check.disponible) return null;
  return REASONS[check.motivo] ?? SLUG_FORMAT_MESSAGE;
}

/** Dirección pública que tendrá la carta, para enseñarla bajo el campo. */
export function cartaUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/$/, "")}/${slug.trim() || "tu-restaurante"}`;
}

/** «14 días», «1 día»… */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Frase de los límites de la prueba para la landing; null si no hay ninguno. */
export function trialLimitsText(config: Pick<AltaConfig, "dias" | "max_pedidos">): string | null {
  const parts = [
    config.dias === null ? null : plural(config.dias, "día", "días"),
    config.max_pedidos === null ? null : plural(config.max_pedidos, "pedido", "pedidos"),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return parts.join(" o ");
}

const SLUG_FORMAT_MESSAGE =
  "Solo minúsculas, números y guiones entre palabras (por ejemplo, mi-bar).";

const REASONS: Record<string, string> = {
  alta_closed: "El alta está cerrada por ahora.",
  email_not_verified: "Confirma tu email antes de crear tu restaurante. Revisa tu correo.",
  already_has_trial: "Esta cuenta ya tiene una prueba de EasyOrder.",
  slug_taken: "Esa dirección ya está en uso. Prueba con otra.",
  slug_reserved: "Esa dirección está reservada. Elige otra.",
  slug_invalid_format: SLUG_FORMAT_MESSAGE,
  slug_too_short: "La dirección necesita al menos 3 caracteres.",
  slug_too_long: "La dirección admite hasta 40 caracteres.",
  invalid_time_zone: "La zona horaria no es válida.",
  fulfillment_required: "Elige al menos una forma de servicio: recogida o reparto.",
  captcha_failed: "No pudimos comprobar que eres una persona. Inténtalo de nuevo.",
};

/** Mensaje en castellano para un error de POST /alta. */
export function signupErrorMessage(status: number, body: ApiErrorBody | null): string {
  if (status === 0) return "Sin conexión con el servidor. Inténtalo de nuevo en unos segundos.";
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar.";
  if (status === 429) return "Demasiados intentos. Espera un rato y vuelve a probar.";
  const reason = body?.reason ? REASONS[body.reason] : undefined;
  if (reason) return reason;
  if (status === 400) return "Revisa los datos: alguno no es válido.";
  return "No pudimos crear tu restaurante. Inténtalo de nuevo.";
}

/** ¿El error es de un campo del paso 1 (hay que volver a él)? */
export function signupErrorStep(body: ApiErrorBody | null): SignupStep | null {
  const reason = body?.reason ?? "";
  if (reason.startsWith("slug_")) return SIGNUP_STEP.Restaurant;
  if (reason === "invalid_time_zone") return SIGNUP_STEP.Branch;
  if (reason === "fulfillment_required") return SIGNUP_STEP.Service;
  return null;
}

/** Mensajes de Supabase Auth del registro y la entrada, traducidos. */
export function signupAuthMessage(message: string): string {
  if (/already registered/i.test(message)) {
    return "Ese email ya tiene cuenta. Elige «Ya tengo cuenta».";
  }
  if (/password/i.test(message)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/invalid login credentials/i.test(message)) return "Email o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Confirma tu email antes de entrar.";
  if (/rate limit|too many/i.test(message)) {
    return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  }
  return "No se pudo completar. Inténtalo de nuevo.";
}
