import { PAYMENT_METHODS, type PaymentMethod } from "./payment-methods";

/** Roles del equipo de Konnecttia en el panel interno (`plataforma_miembro.rol`). */
export const PLATFORM_ROLE = {
  /** Lee y escribe: alta de restaurantes, plan, módulos y métodos de pago. */
  Admin: "admin",
  /** Solo lee. */
  Support: "soporte",
} as const;

export type PlatformRole = (typeof PLATFORM_ROLE)[keyof typeof PLATFORM_ROLE];

export function isPlatformRole(value: string): value is PlatformRole {
  return value === PLATFORM_ROLE.Admin || value === PLATFORM_ROLE.Support;
}

/** Un rol cumple el mínimo exigido: admin cumple todo; soporte, solo «soporte». */
export function platformRoleAtLeast(role: PlatformRole, minimum: PlatformRole): boolean {
  return role === PLATFORM_ROLE.Admin || minimum === PLATFORM_ROLE.Support;
}

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs que no puede tener un restaurante: son rutas de la web, subdominios o nombres que
 * confundirían a quien los vea. Constante técnica (no es regla de negocio de ningún restaurante).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "ajustes",
  "alta",
  "api",
  "app",
  "assets",
  "auth",
  "ayuda",
  "carta",
  "checkout",
  "cuenta",
  "easyorder",
  "health",
  "interno",
  "konnecttia",
  "login",
  "logout",
  "me",
  "panel",
  "pedido",
  "pedidos",
  "plataforma",
  "privacidad",
  "public",
  "registro",
  "soporte",
  "static",
  "status",
  "www",
]);

export const SLUG_ERROR = {
  TooShort: "slug_too_short",
  TooLong: "slug_too_long",
  InvalidFormat: "slug_invalid_format",
  Reserved: "slug_reserved",
} as const;

export type SlugError = (typeof SLUG_ERROR)[keyof typeof SLUG_ERROR];

/** Comprueba el slug de un restaurante nuevo (la unicidad la comprueba la base de datos). */
export function checkRestaurantSlug(slug: string): SlugError | null {
  if (slug.length < SLUG_MIN_LENGTH) return SLUG_ERROR.TooShort;
  if (slug.length > SLUG_MAX_LENGTH) return SLUG_ERROR.TooLong;
  if (!SLUG_PATTERN.test(slug)) return SLUG_ERROR.InvalidFormat;
  if (RESERVED_SLUGS.has(slug)) return SLUG_ERROR.Reserved;
  return null;
}

/** Propuesta de slug a partir del nombre: minúsculas, sin acentos, guiones entre palabras. */
export function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, "");
}

/** Zona horaria IANA que el motor de fechas conoce («Atlantic/Canary», «UTC»…). */
export function isValidTimeZone(value: string): boolean {
  if (!value.trim() || value !== value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Lee `restaurante.metodos_pago_permitidos`: null = todos; si no, solo los métodos conocidos. */
export function allowedPaymentMethods(raw: unknown): readonly PaymentMethod[] {
  if (!Array.isArray(raw)) return PAYMENT_METHODS;
  return PAYMENT_METHODS.filter((method) => raw.includes(method));
}

/** Lo que el restaurante tiene activo, limitado a lo que Konnecttia le permite. */
export function enabledPaymentMethods(active: unknown, allowed: unknown): readonly PaymentMethod[] {
  const permitted = new Set<string>(allowedPaymentMethods(allowed));
  const list = Array.isArray(active) ? active : [];
  return PAYMENT_METHODS.filter((method) => list.includes(method) && permitted.has(method));
}
