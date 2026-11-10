import type { BoardSounds } from "@konnecttia/domain";
import type { DeliveryPhotoMode } from "./delivery-photo";

/** Respuestas de GET /panel/:slug/ajustes (apps/api/src/routes/panel-settings.ts). */

export type OpenMode = "auto" | "abierto" | "cerrado";

export type Day = {
  readonly dia: string;
  readonly disponible: boolean;
  readonly apertura_1: string | null;
  readonly cierre_1: string | null;
  readonly apertura_2: string | null;
  readonly cierre_2: string | null;
};

export type BankDetails = {
  readonly titular?: string;
  readonly banco?: string;
  readonly iban?: string;
  readonly concepto?: string;
  readonly bizum?: string;
};

import type { SocialLink } from "@konnecttia/domain";

export type RestaurantSettings = {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly descripcion: string | null;
  readonly eslogan: string | null;
  /** Logo (URL pública) y redes sociales del restaurante (pieza Z). */
  readonly logo_url?: string | null;
  /** Color de marca propio (`#rrggbb`); null = el de EasyOrder (pieza AA). */
  readonly color_marca?: string | null;
  readonly redes_sociales?: readonly SocialLink[];
  readonly zona_horaria: string | null;
  /** País (ISO alfa-2): prefijo telefónico por defecto del checkout. */
  readonly pais?: string;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly metodos_pago: readonly string[];
  readonly datos_bancarios: BankDetails | null;
  readonly apertura_manual: OpenMode;
  readonly recogida_minutos: number | null;
  readonly reparto_minutos_min: number | null;
  readonly reparto_minutos_max: number | null;
  readonly modo_ocupado_opciones: readonly number[];
  readonly modo_ocupado_duracion_minutos: number | null;
  /** Foto de entrega del repartidor (reparto_foto_entrega). */
  readonly reparto_foto_entrega: DeliveryPhotoMode;
  /** Sonido de cada evento del tablero (pieza de sonidos por estado). */
  readonly sonidos?: BoardSounds;
  readonly privacidad_url: string | null;
  readonly privacidad_version: string | null;
  readonly avisos_local_activo: boolean;
  readonly avisos_local_emails: readonly string[];
  readonly avisos_cliente_activo: boolean;
  readonly avisos_cliente_estados: readonly string[];
  readonly antifraude_abiertos: number | null;
  readonly antifraude_por_hora: number | null;
  readonly suplementos: readonly Surcharge[];
};

export type BranchSettings = {
  readonly id: number;
  readonly nombre: string;
  readonly direccion: string | null;
  readonly telefono: string | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly principal: boolean;
  readonly activo: boolean;
  readonly recogida: boolean;
  readonly reparto: boolean;
  readonly apertura_manual: OpenMode;
  readonly horario_propio: readonly Day[] | null;
};

export type Holiday = {
  readonly id: number;
  readonly fecha: string;
  readonly nombre: string | null;
  readonly cerrado: boolean;
  readonly sucursal_id: number | null;
};

export type Settings = {
  readonly restaurante: RestaurantSettings;
  readonly horario: readonly Day[];
  readonly locales: readonly BranchSettings[];
  readonly festivos: readonly Holiday[];
  readonly metodos_disponibles: readonly string[];
  readonly edicion_completa: boolean;
};

export const PAYMENT_HINT: Readonly<Record<string, string>> = {
  efectivo: "Se paga al recoger o al repartidor.",
  tarjeta: "Datáfono en el local o en la entrega.",
  transferencia: "El pedido queda pendiente hasta que confirmes el cobro.",
  bizum: "El pedido queda pendiente hasta que confirmes el cobro.",
};

const SETTINGS_ERROR: Readonly<Record<string, string>> = {
  no_service: "Deja activa al menos la recogida o el reparto.",
  no_payment_method: "Elige al menos un método de pago.",
  transfer_without_iban: "Para aceptar transferencias, indica el IBAN y el titular.",
  invalid_iban: "El IBAN no es válido. Revisa los dígitos.",
  bizum_without_phone: "Para aceptar Bizum, indica el teléfono de Bizum.",
  min_over_max: "El tiempo mínimo de reparto no puede ser mayor que el máximo.",
  incomplete_shift: "Cada turno necesita hora de apertura y de cierre.",
  empty_shift: "La apertura y el cierre de un turno no pueden ser la misma hora.",
  second_without_first: "Rellena el primer turno antes que el segundo.",
  open_without_shift: "Un día abierto necesita al menos un turno.",
  principal_required: "El local principal no se puede desactivar.",
  lat_lng_together: "Indica latitud y longitud juntas.",
  duplicate_date: "Ya hay un festivo en esa fecha.",
  unknown_network: "Esa red social no está admitida.",
  duplicate_network: "Cada red solo puede aparecer una vez.",
  invalid_url: "El enlace no es válido. Pega la dirección completa (https://…).",
  branch_scope_limited: "Tu usuario solo opera algunos locales: esto lo cambia el propietario.",
};

export function settingsErrorMessage(reason: string | undefined, field?: string): string {
  const base = reason ? SETTINGS_ERROR[reason] : undefined;
  if (base && field && /^[A-ZÁÉÍÓÚ]/.test(field)) return `${field}: ${base}`;
  return base ?? "No se pudo guardar. Revisa los datos e inténtalo de nuevo.";
}

/** «20» → 20; vacío → null; texto no numérico o fuera de rango → undefined (error). */
export function parseMinutes(text: string, max = 600): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return undefined;
  const minutes = Number(value);
  return minutes >= 1 && minutes <= max ? minutes : undefined;
}

/** «10, 20,30» → [10, 20, 30] sin repetidos; undefined si algo no es válido. */
export function parseMinuteList(text: string): number[] | undefined {
  const parts = text
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const values = parts.map((part) => parseMinutes(part, 240));
  if (values.some((value) => value === undefined || value === null)) return undefined;
  const unique = [...new Set(values as number[])].sort((a, b) => a - b);
  return unique.length <= 6 ? unique : undefined;
}

// ------------------------------------------------------------- privacidad y antifraude

/** Topes que valida la API (apps/api/src/lib/settings-validation.ts). */
export const PRIVACY_URL_MAX = 500;
export const PRIVACY_VERSION_MAX = 40;
export const PHONE_LIMIT_MAX = 1000;

/** URL de la política: vacío → null (se usa la página plantilla); no http/https → undefined. */
export function parsePolicyUrl(text: string): string | null | undefined {
  const value = text.trim();
  if (!value) return null;
  if (value.length > PRIVACY_URL_MAX) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Límite por teléfono: vacío → null (sin límite); entero entre 1 y el tope; otra cosa → undefined. */
export function parsePhoneLimit(text: string): number | null | undefined {
  return parseMinutes(text, PHONE_LIMIT_MAX);
}

/** Copia el horario de un día al resto (la tarea más repetida al configurar). */
export function copyDayToAll(week: readonly Day[], from: string): Day[] {
  const source = week.find((day) => day.dia === from);
  if (!source) return [...week];
  return week.map((day) => ({ ...source, dia: day.dia }));
}

export function closedWeekFrom(week: readonly Day[]): Day[] {
  return week.map((day) => ({ ...day }));
}

/** Resumen de un día para la lista: «12:00–16:00 · 20:00–00:30» o «Cerrado». */
export function dayLabel(day: Day): string {
  if (!day.disponible || !day.apertura_1 || !day.cierre_1) return "Cerrado";
  const first = `${day.apertura_1}–${day.cierre_1}`;
  return day.apertura_2 && day.cierre_2 ? `${first} · ${day.apertura_2}–${day.cierre_2}` : first;
}

/** Fecha «2026-12-25» → «vie, 25 dic 2026» en español. */
export function holidayDate(date: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(instant);
}

// ---------------------------------------------------------------------- reparto y tiempos

export type Surcharge = {
  readonly concepto: string;
  readonly por_debajo_centimos: number;
  readonly importe_centimos: number;
  readonly aplica_a: "ambos" | "recogida" | "reparto";
};

export type ZoneCoverage =
  | {
      readonly tipo: "radio";
      readonly lat: number;
      readonly lng: number;
      readonly radio_km: number;
    }
  | { readonly tipo: "codigo_postal"; readonly codigo_postal: string }
  | { readonly tipo: "toda_la_ciudad" };

export type ZoneFee =
  | { readonly tipo: "fija"; readonly base_centimos: number }
  | {
      readonly tipo: "por_km";
      readonly base_centimos: number;
      readonly por_km_centimos: number;
      readonly maxima_centimos: number | null;
    };

export type DeliveryZone = {
  readonly id: number;
  readonly nombre: string;
  readonly sucursal_id: number;
  readonly descripcion: string | null;
  readonly activa: boolean;
  readonly cobertura: ZoneCoverage;
  readonly tarifa: ZoneFee;
  readonly pedido_minimo_centimos: number;
  readonly envio_gratis_desde_centimos: number | null;
  readonly minutos_min: number | null;
  readonly minutos_max: number | null;
};

export type ZoneBranch = {
  readonly id: number;
  readonly nombre: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly reparto: boolean;
};

export type PeakTime = {
  readonly id: number;
  readonly dia: string | null;
  readonly desde: string;
  readonly hasta: string;
  readonly servicio: "recogida" | "reparto" | "ambos";
  readonly minutos_extra: number;
  readonly sucursal_id: number | null;
  readonly activo: boolean;
};

const euros = (cents: number) =>
  `${(cents / 100).toFixed(2).replace(".", ",").replace(",00", "")} €`;

export function coverageLabel(coverage: ZoneCoverage): string {
  if (coverage.tipo === "toda_la_ciudad") return "Toda la ciudad";
  if (coverage.tipo === "codigo_postal") return `Código postal ${coverage.codigo_postal}`;
  return `${String(coverage.radio_km).replace(".", ",")} km alrededor`;
}

export function feeLabel(fee: ZoneFee, freeFrom: number | null): string {
  const base =
    fee.tipo === "fija"
      ? fee.base_centimos === 0
        ? "Envío gratis"
        : `Envío ${euros(fee.base_centimos)}`
      : `${euros(fee.base_centimos)} + ${euros(fee.por_km_centimos)}/km${
          fee.maxima_centimos !== null ? ` (máx. ${euros(fee.maxima_centimos)})` : ""
        }`;
  return freeFrom !== null ? `${base} · gratis desde ${euros(freeFrom)}` : base;
}

export const SERVICE_LABEL: Readonly<Record<string, string>> = {
  ambos: "Recogida y reparto",
  recogida: "Recogida",
  reparto: "Reparto",
};

const ZONE_ERROR: Readonly<Record<string, string>> = {
  duplicate_postal_code: "Ese código postal ya está en otra zona.",
  min_over_max: "El tiempo mínimo no puede ser mayor que el máximo.",
  max_below_base: "El tope por km no puede ser menor que la tarifa base.",
  empty_range: "La franja necesita horas de inicio y fin distintas.",
};

export function zoneErrorMessage(reason: string | undefined): string {
  return (
    (reason && (ZONE_ERROR[reason] ?? settingsErrorMessage(reason))) ||
    settingsErrorMessage(undefined)
  );
}
