import {
  checkRestaurantSlug,
  isValidTimeZone,
  SLUG_ERROR,
  type SlugError,
  slugFromName,
} from "@konnecttia/domain";
import type { ApiErrorBody } from "../types";
import type {
  ModuleChangeBody,
  ModuleOrigin,
  ModuleRow,
  ModuleState,
  NewRestaurantBody,
} from "./types";

/** Lógica pura del panel interno: validación del alta, textos y acciones de módulos. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NewRestaurantForm = {
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly plan: string;
  readonly localNombre: string;
  readonly direccion: string;
  readonly telefono: string;
  readonly propietarioEmail: string;
};

export type FormErrors = Partial<Record<keyof NewRestaurantForm, string>>;

const SLUG_MESSAGES: Record<SlugError, string> = {
  [SLUG_ERROR.TooShort]: "El enlace necesita al menos 3 caracteres.",
  [SLUG_ERROR.TooLong]: "El enlace admite hasta 40 caracteres.",
  [SLUG_ERROR.InvalidFormat]:
    "Solo minúsculas, números y guiones entre palabras (por ejemplo, la-isla).",
  [SLUG_ERROR.Reserved]: "Ese enlace está reservado por la plataforma. Elige otro.",
};

export function slugMessage(slug: string): string | null {
  const problem = checkRestaurantSlug(slug);
  return problem ? SLUG_MESSAGES[problem] : null;
}

/** Valida el formulario de alta antes de enviarlo (la API repite las comprobaciones). */
export function validateNewRestaurant(form: NewRestaurantForm): FormErrors {
  const errors: { -readonly [K in keyof FormErrors]: string } = {};
  if (!form.nombre.trim()) errors.nombre = "Escribe el nombre del restaurante.";
  else if (form.nombre.trim().length > 120) errors.nombre = "Admite hasta 120 caracteres.";
  const slug = slugMessage(form.slug.trim());
  if (slug) errors.slug = slug;
  if (!isValidTimeZone(form.zonaHoraria.trim())) {
    errors.zonaHoraria = "Zona horaria no válida (por ejemplo, Atlantic/Canary).";
  }
  if (!form.plan) errors.plan = "Elige un plan.";
  if (!form.localNombre.trim()) errors.localNombre = "Escribe el nombre del local principal.";
  else if (form.localNombre.trim().length > 120)
    errors.localNombre = "Admite hasta 120 caracteres.";
  if (form.direccion.trim().length > 200) errors.direccion = "Admite hasta 200 caracteres.";
  if (form.telefono.trim().length > 30) errors.telefono = "Admite hasta 30 caracteres.";
  if (!EMAIL.test(form.propietarioEmail.trim())) {
    errors.propietarioEmail = "Escribe un email válido para la persona propietaria.";
  }
  return errors;
}

/** Cuerpo de POST /plataforma/restaurantes a partir del formulario ya validado. */
export function toNewRestaurantBody(form: NewRestaurantForm): NewRestaurantBody {
  const direccion = form.direccion.trim();
  const telefono = form.telefono.trim();
  return {
    nombre: form.nombre.trim(),
    slug: form.slug.trim(),
    zona_horaria: form.zonaHoraria.trim(),
    plan: form.plan,
    local: {
      nombre: form.localNombre.trim(),
      ...(direccion ? { direccion } : {}),
      ...(telefono ? { telefono } : {}),
    },
    propietario_email: form.propietarioEmail.trim().toLowerCase(),
  };
}

/** Propone el slug mientras la persona no lo haya tocado a mano. */
export function suggestSlug(name: string): string {
  return slugFromName(name);
}

/** Enlace de invitación: el de la API o, si no lo conoce, el del origen desde el que se navega. */
export function invitationLink(apiLink: string | null, token: string, origin: string): string {
  return apiLink ?? `${origin.replace(/\/$/, "")}/panel/unirse/${token}`;
}

const REASONS: Record<string, string> = {
  slug_taken: "Ya existe un restaurante con ese enlace.",
  slug_reserved: SLUG_MESSAGES[SLUG_ERROR.Reserved],
  slug_invalid_format: SLUG_MESSAGES[SLUG_ERROR.InvalidFormat],
  slug_too_short: SLUG_MESSAGES[SLUG_ERROR.TooShort],
  slug_too_long: SLUG_MESSAGES[SLUG_ERROR.TooLong],
  invalid_time_zone: "La zona horaria no es válida.",
  unknown_plan: "Ese plan no existe.",
  duplicate_name: "Ya hay un rol con ese nombre.",
  template_role: "Las plantillas no se editan desde aquí.",
  role_in_use: "Hay personas con ese rol. Cámbiales el rol antes de borrarlo.",
  pending_invites: "Hay invitaciones pendientes con ese rol. Revócalas antes de borrarlo.",
  origin_required: "Elige si se activa como complemento o como cortesía.",
  module_in_plan: "Ese módulo viene con el plan: cámbialo desde el plan.",
  module_not_manageable: "Ese módulo no se activa desde aquí.",
  module_not_active: "El restaurante no tiene ese módulo.",
  dependency_missing: "Antes hay que activar los módulos de los que depende.",
  has_dependents: "Otros módulos activos dependen de este. Desactívalos antes.",
  platform_role_insufficient: "Tu usuario solo puede consultar. Pide a un administrador el cambio.",
  not_platform_member: "Tu usuario no pertenece al equipo de Konnecttia.",
};

/** Mensaje en castellano para un error de la API del panel interno. */
export function platformErrorMessage(
  status: number,
  body: (ApiErrorBody & { modulos?: readonly string[] }) | null,
  moduleNames: ReadonlyMap<string, string> = new Map(),
): string {
  if (status === 0) return "Sin conexión con el servidor. Inténtalo de nuevo en unos segundos.";
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar.";
  const reason = body?.reason ? REASONS[body.reason] : undefined;
  if (reason) {
    const names = (body?.modulos ?? []).map((code) => moduleNames.get(code) ?? code);
    return names.length > 0 ? `${reason} (${names.join(", ")})` : reason;
  }
  if (status === 403) return "Tu usuario no tiene permiso para hacer esto.";
  if (status === 404) return "No encontramos ese restaurante.";
  if (status === 400) return "Revisa los datos: alguno no es válido.";
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export type RoleFormErrors = { nombre?: string; permisos?: string };

/** Valida el formulario de un rol propio (la API repite las comprobaciones). */
export function validateRoleForm(nombre: string, permisos: readonly string[]): RoleFormErrors {
  const errors: RoleFormErrors = {};
  const name = nombre.trim();
  if (name.length < 2) errors.nombre = "El nombre necesita al menos 2 caracteres.";
  else if (name.length > 60) errors.nombre = "El nombre admite hasta 60 caracteres.";
  if (permisos.length === 0) errors.permisos = "Elige al menos un permiso.";
  return errors;
}

/** Permisos marcados que pertenecen a módulos que el restaurante no tiene contratados. */
export function inactivePermissions(
  selected: ReadonlySet<string>,
  catalog: readonly { activo: boolean; permisos: readonly { code: string }[] }[],
): string[] {
  return catalog
    .filter((group) => !group.activo)
    .flatMap((group) => group.permisos.map((permission) => permission.code))
    .filter((code) => selected.has(code));
}

export const PLAN_NAME_FALLBACK = "Sin plan";

const ORIGIN_LABEL: Record<ModuleOrigin, string> = {
  plan: "Del plan",
  complemento: "Complemento",
  cortesia: "Cortesía",
};

const STATE_LABEL: Record<ModuleState, string> = {
  activo: "Activo",
  suspendido: "Suspendido",
  cancelado: "Cancelado",
};

export const originLabel = (origin: ModuleOrigin) => ORIGIN_LABEL[origin];
export const stateLabel = (state: ModuleState) => STATE_LABEL[state];

export const PAYMENT_LABEL: Readonly<Record<string, string>> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  bizum: "Bizum",
  online: "Pago online",
};

export const paymentLabel = (method: string) => PAYMENT_LABEL[method] ?? method;

/** Origen que se envía al activar un módulo que el restaurante aún no tiene. */
export type ManualOrigin = "complemento" | "cortesia";

/**
 * Cambio que hace el interruptor de un módulo: activo → suspendido; si no está activo se activa
 * (con el origen elegido si el restaurante no tenía fila; con el que ya tiene, si la tenía).
 */
export function moduleToggle(module: ModuleRow, origin: ManualOrigin): ModuleChangeBody {
  if (module.estado === "activo") return { estado: "suspendido" };
  return module.estado === null ? { estado: "activo", origen: origin } : { estado: "activo" };
}

/** Un módulo se puede cancelar solo si lo tiene el restaurante y no está ya cancelado. */
export function canCancelModule(module: ModuleRow): boolean {
  return module.gestionable && module.estado !== null && module.estado !== "cancelado";
}

/** Módulos que dependen de este y están activos (para avisar antes de desactivarlo). */
export function activeDependents(modules: readonly ModuleRow[], code: string): ModuleRow[] {
  return modules.filter((m) => m.estado === "activo" && m.depende_de.includes(code));
}

/** ¿Cambió la selección de métodos permitidos respecto a lo guardado? */
export function samePaymentSelection(
  saved: readonly string[] | null,
  draft: readonly string[] | null,
): boolean {
  if (saved === null || draft === null) return saved === draft;
  return saved.length === draft.length && saved.every((method) => draft.includes(method));
}

/** Métodos que el restaurante tiene activos y que dejarían de estar permitidos. */
export function methodsThatWouldBeRemoved(
  active: readonly string[],
  draft: readonly string[] | null,
): string[] {
  return draft === null ? [] : active.filter((method) => !draft.includes(method));
}
