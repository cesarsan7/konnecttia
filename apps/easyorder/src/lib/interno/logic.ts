import {
  checkRestaurantSlug,
  isValidTimeZone,
  SLUG_ERROR,
  type SlugError,
  slugFromName,
} from "@konnecttia/domain";
import type { ApiErrorBody } from "../types";
import type {
  CodeChannel,
  CodeSettingsBody,
  CodeSettingsInfo,
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
  // Datos para abrir al público (todos opcionales).
  readonly lat: string;
  readonly lng: string;
  readonly semanaApertura: string;
  readonly semanaCierre: string;
  readonly findeApertura: string;
  readonly findeCierre: string;
  readonly recogidaMinutos: string;
  readonly radioKm: string;
  readonly tarifa: string;
  readonly minimo: string;
  readonly repartoMinutos: string;
  readonly efectivo: boolean;
  readonly tarjeta: boolean;
  /** Código de verificación del checkout web (capa 3): WhatsApp es el valor recomendado. */
  readonly codigoVerificacion: CodeChannel;
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

/** Valores iniciales de los datos opcionales para abrir al público. */
export const EMPTY_OPENING_DATA = {
  lat: "",
  lng: "",
  semanaApertura: "",
  semanaCierre: "",
  findeApertura: "",
  findeCierre: "",
  recogidaMinutos: "",
  radioKm: "",
  tarifa: "",
  minimo: "",
  repartoMinutos: "",
  efectivo: true,
  tarjeta: true,
  codigoVerificacion: "whatsapp",
} as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «28,97», «28.97» o « 5 » → número; null si no es un número. */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

const filled = (text: string) => text.trim() !== "";

/** Valida los datos opcionales para abrir al público: cada grupo va completo o vacío. */
function validateOpeningData(form: NewRestaurantForm): FormErrors {
  const errors: { -readonly [K in keyof FormErrors]: string } = {};
  const range = (value: string, min: number, max: number) => {
    const number = parseDecimal(value);
    return number !== null && number >= min && number <= max;
  };
  if (filled(form.lat) !== filled(form.lng)) {
    errors[filled(form.lat) ? "lng" : "lat"] = "Indica latitud y longitud, o ninguna de las dos.";
  } else if (filled(form.lat)) {
    if (!range(form.lat, -90, 90)) errors.lat = "Latitud no válida (entre -90 y 90).";
    if (!range(form.lng, -180, 180)) errors.lng = "Longitud no válida (entre -180 y 180).";
  }
  for (const [open, close] of [
    ["semanaApertura", "semanaCierre"],
    ["findeApertura", "findeCierre"],
  ] as const) {
    if (filled(form[open]) !== filled(form[close])) {
      errors[filled(form[open]) ? close : open] = "Indica apertura y cierre, o ninguna de las dos.";
    } else if (filled(form[open])) {
      if (!TIME.test(form[open].trim())) errors[open] = "Hora no válida (por ejemplo, 08:00).";
      if (!TIME.test(form[close].trim())) errors[close] = "Hora no válida (por ejemplo, 23:00).";
    }
  }
  if (filled(form.recogidaMinutos)) {
    const minutes = parseDecimal(form.recogidaMinutos);
    if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      errors.recogidaMinutos = "Minutos enteros entre 1 y 240.";
    }
  }
  const zone = [form.radioKm, form.tarifa, form.minimo, form.repartoMinutos];
  if (zone.some(filled)) {
    if (!zone.every(filled)) {
      for (const [key, value] of [
        ["radioKm", form.radioKm],
        ["tarifa", form.tarifa],
        ["minimo", form.minimo],
        ["repartoMinutos", form.repartoMinutos],
      ] as const) {
        if (!filled(value)) errors[key] = "Completa los cuatro datos del reparto, o ninguno.";
      }
    } else {
      if (!range(form.radioKm, 0.1, 100)) errors.radioKm = "Radio entre 0,1 y 100 km.";
      if (!range(form.tarifa, 0, 100)) errors.tarifa = "Tarifa entre 0 y 100 €.";
      if (!range(form.minimo, 0, 1000)) errors.minimo = "Mínimo entre 0 y 1000 €.";
      const minutes = parseDecimal(form.repartoMinutos);
      if (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        errors.repartoMinutos = "Minutos enteros entre 1 y 240.";
      }
    }
    if (!filled(form.lat)) errors.lat = "El reparto por radio necesita la ubicación del local.";
  }
  if (!form.efectivo && !form.tarjeta) errors.efectivo = "Elige al menos un método de cobro.";
  return errors;
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
  return { ...errors, ...validateOpeningData(form) };
}

/** Cuerpo de POST /plataforma/restaurantes a partir del formulario ya validado. */
export function toNewRestaurantBody(form: NewRestaurantForm): NewRestaurantBody {
  const direccion = form.direccion.trim();
  const telefono = form.telefono.trim();
  const lat = parseDecimal(form.lat);
  const lng = parseDecimal(form.lng);
  const week: [string, readonly string[]][] = [
    [form.semanaApertura.trim(), ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]],
    [form.findeApertura.trim(), ["Sábado", "Domingo"]],
  ];
  const closes = [form.semanaCierre.trim(), form.findeCierre.trim()];
  const horario = week.flatMap(([apertura, days], index) =>
    apertura
      ? days.map((dia) => ({ dia, disponible: true, apertura, cierre: closes[index] ?? "" }))
      : [],
  );
  const hasZone = filled(form.radioKm);
  const recogida = parseDecimal(form.recogidaMinutos);
  const metodos = [form.efectivo ? "efectivo" : null, form.tarjeta ? "tarjeta" : null].filter(
    (method): method is string => method !== null,
  );
  return {
    ...(lat !== null && lng !== null ? { ubicacion: { lat, lng } } : {}),
    ...(horario.length > 0 ? { horario } : {}),
    ...(recogida !== null ? { recogida_minutos: recogida } : {}),
    ...(hasZone
      ? {
          zona_reparto: {
            radio_km: parseDecimal(form.radioKm) ?? 0,
            tarifa: parseDecimal(form.tarifa) ?? 0,
            minimo: parseDecimal(form.minimo) ?? 0,
            minutos: parseDecimal(form.repartoMinutos) ?? 0,
          },
        }
      : {}),
    metodos_pago: metodos,
    codigo_verificacion: form.codigoVerificacion,
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
  base_template: "Las plantillas base (Propietario, Encargado…) no se borran.",
  owner_locked:
    "Propietario debe conservar los permisos de equipo y ajustes: sin ellos nadie podría gestionar el restaurante.",
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

const MENU_LINE_MESSAGES: Record<string, string> = {
  empty: "No hay ninguna fila con datos.",
  too_many_rows: "Demasiadas filas (máximo 1000).",
  missing_columns:
    "faltan columnas (hacen falta al menos categoría, producto, descripción, variante y precio).",
  missing_category: "falta la categoría.",
  missing_product: "falta el nombre del producto.",
  invalid_price: "el precio no es válido (usa por ejemplo 4,90 y mayor que 0).",
  too_long: "algún texto es demasiado largo.",
  too_many_categories: "Demasiadas categorías (máximo 60).",
  duplicate_variant: "la variante está repetida en ese producto.",
  invalid_default: "«por defecto» solo admite sí o no.",
};

/** Frases para mostrar los problemas de una importación de carta (una por error). */
export function menuImportMessage(
  status: number,
  body: (ApiErrorBody & { errores?: readonly { line: number; code: string }[] }) | null,
): readonly string[] {
  if (body?.reason === "invalid_menu" && body.errores?.length) {
    return body.errores.map((error) => {
      const text = MENU_LINE_MESSAGES[error.code] ?? "fila no válida.";
      return error.line > 0 ? `Línea ${error.line}: ${text}` : text;
    });
  }
  if (body?.reason === "menu_already_loaded") {
    return ["Este restaurante ya tiene carta: la importación no la sobrescribe."];
  }
  return [platformErrorMessage(status, body)];
}

/** Frase del aviso al editar una plantilla: a cuánta gente afecta ya. */
export function templateImpact(template: {
  readonly miembros: number;
  readonly invitaciones: number;
  readonly restaurantes: number;
}): string {
  if (template.miembros === 0 && template.invitaciones === 0) {
    return "Nadie la usa todavía: puedes cambiarla sin afectar a ningún restaurante.";
  }
  const people = `${template.miembros} ${template.miembros === 1 ? "persona" : "personas"}`;
  const places = `${template.restaurantes} ${template.restaurantes === 1 ? "restaurante" : "restaurantes"}`;
  const invites =
    template.invitaciones > 0
      ? ` y ${template.invitaciones} ${template.invitaciones === 1 ? "invitación pendiente" : "invitaciones pendientes"}`
      : "";
  return `Afecta al instante a ${people} en ${places}${invites}.`;
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

// ---------------------------------------------------------- código de verificación (capa 3)

/** Valores por defecto de la API (ADR 0011): se muestran como ayuda en los campos vacíos. */
export const CODE_DEFAULT_THRESHOLD_EUR = 30;
export const CODE_DEFAULT_CAP_EUR = 10;

export type CodeSettingsForm = {
  readonly canal: CodeChannel;
  /** Vacío = valor por defecto. */
  readonly umbral: string;
  readonly tope: string;
};

const amountText = (value: number) => String(value).replace(".", ",");

/** Formulario a partir de lo guardado: solo se rellenan los valores que el restaurante cambió. */
export function codeSettingsForm(info: CodeSettingsInfo): CodeSettingsForm {
  return {
    canal: info.canal,
    umbral: info.umbral_personalizado ? amountText(info.umbral_eur) : "",
    tope: info.tope_personalizado ? amountText(info.tope_mensual_eur) : "",
  };
}

/** Importe en euros: vacío vale (= por defecto); si hay texto, un número entre 0 y el máximo. */
function amountProblem(text: string, max: number): string | null {
  if (!filled(text)) return null;
  const value = parseDecimal(text);
  if (value === null || value < 0 || value > max) {
    return `Escribe un importe entre 0 y ${max} €, o déjalo vacío para el valor por defecto.`;
  }
  return null;
}

export function validateCodeSettings(form: CodeSettingsForm): { umbral?: string; tope?: string } {
  const umbral = amountProblem(form.umbral, 100_000);
  const tope = amountProblem(form.tope, 1_000);
  return { ...(umbral ? { umbral } : {}), ...(tope ? { tope } : {}) };
}

/** Cuerpo de PUT /antifraude-codigo a partir del formulario ya validado. */
export function toCodeSettingsBody(form: CodeSettingsForm): CodeSettingsBody {
  return {
    canal: form.canal,
    umbral_eur: filled(form.umbral) ? parseDecimal(form.umbral) : null,
    tope_mensual_eur: filled(form.tope) ? parseDecimal(form.tope) : null,
  };
}

export function sameCodeSettings(a: CodeSettingsForm, b: CodeSettingsForm): boolean {
  const body = (form: CodeSettingsForm) => JSON.stringify(toCodeSettingsBody(form));
  return body(a) === body(b);
}
