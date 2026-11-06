import {
  type Cents,
  cents,
  type DaySchedule,
  DELIVERY_FEE_KIND,
  type DeliveryFeeRule,
  type EtaRange,
  FULFILLMENT,
  type Fulfillment,
  type OpenOverride,
  type QueueRule,
  SURCHARGE_KIND,
  type SurchargeRule,
} from "@konnecttia/domain";
import { z } from "zod";
import { eurosToCents, type Sql } from "../lib/db";

export type Restaurant = {
  readonly id: number;
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly paymentMethods: readonly string[];
  readonly deliveryEnabled: boolean;
  readonly pickupEnabled: boolean;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Claves de `restaurante_config` que usa la API. Son las mismas que usa n8n (Despacho); las
 * `estimated_time_*` son de la versión inicial de EasyOrder y se aceptan como último recurso.
 * No hay valores por defecto en el código: si falta la configuración, el tiempo queda «a confirmar».
 */
export const CONFIG_KEY = {
  OpenOverride: "is_open_override",
  PickupEtaText: "pickup_eta_text",
  PickupEtaMinutes: "pickup_eta_minutes",
  PickupEtaLegacy: "estimated_time_pickup",
  DeliveryEtaText: "delivery_eta_text",
  DeliveryEtaMin: "delivery_eta_min_minutes",
  DeliveryEtaMax: "delivery_eta_max_minutes",
  DeliveryEtaLegacy: "estimated_time_delivery",
  /** Minutos extra por pedido activo por encima del umbral (ajuste por cola). */
  QueueMinutesPerOrder: "cola_minutos_por_pedido",
  /** Pedidos activos que no suman tiempo. */
  QueueFreeOrders: "cola_pedidos_sin_espera",
  /** URL del webhook de avisos de estado (n8n). Sustituye a chatwoot_webhook_prod. */
  N8nWebhookAvisos: "n8n_webhook_avisos",
  /** URL del webhook de entrada de mensajes de Chatwoot (n8n, chatwootnew). */
  N8nWebhookEntrada: "n8n_webhook_entrada",
  /** Clave antigua del dashboard de EasyOrder; solo se lee si falta la nueva. */
  LegacyWebhookAvisos: "chatwoot_webhook_prod",
  /** Lista JSON de minutos extra que ofrece el botón «Modo ocupado» del panel. */
  BusyModeOptions: "modo_ocupado_opciones",
  /** Minutos que dura el modo ocupado antes de apagarse solo. */
  BusyModeDuration: "modo_ocupado_duracion_minutos",
  /** JSON con reglas de suplemento, p. ej. envases: [{"label":"Envases","below":25,"amount":1}] */
  SurchargeRules: "surcharge_rules",
  /** Pedidos anteriores que se muestran al buscar un teléfono (pedido manual, «Repetir»). */
  LookupOrdersLimit: "lookup_pedidos_limit",
  /** Minutos sin servir a partir de los que una mesa se marca en el plano. */
  TableWaitAlert: "mesa_aviso_espera_minutos",
  /** Minutos de ocupación a partir de los que una mesa se marca en el plano. */
  TableStayAlert: "mesa_aviso_estancia_minutos",
  /** Justificantes de pago que el cliente puede subir por pedido. */
  ProofsMaxPerOrder: "justificantes_max_por_pedido",
  /** URL de la política de privacidad del restaurante (checkout web). */
  PrivacyUrl: "privacidad_url",
  /** Texto que identifica la versión vigente de esa política. */
  PrivacyVersion: "privacidad_version",
  /** Máximo de pedidos web sin cerrar por teléfono. Sin clave: sin límite. */
  AntifraudOpenPerPhone: "antifraude_pedidos_abiertos_por_telefono",
  /** Máximo de pedidos web por teléfono en la última hora. Sin clave: sin límite. */
  AntifraudPerPhoneHour: "antifraude_pedidos_por_telefono_hora",
} as const;

/**
 * Métodos de pago que ve el cliente en la carta y el checkout: los que el restaurante tiene
 * activos, y si Konnecttia le fijó una lista de permitidos (`metodos_pago_permitidos`), solo los
 * que estén en ella. Aunque se cargue un método no permitido por SQL, nunca se ofrece.
 */
export function publicPaymentMethods(active: unknown, allowed: unknown): string[] {
  const list = Array.isArray(active)
    ? active.filter((value): value is string => typeof value === "string")
    : [];
  if (!Array.isArray(allowed)) return list;
  return list.filter((method) => allowed.includes(method));
}

export async function findRestaurantBySlug(sql: Sql, slug: string): Promise<Restaurant | null> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 100) {
    return null;
  }
  const rows = await sql<
    {
      id: number;
      nombre: string;
      slug: string;
      zona_horaria: string | null;
      payment_methods: unknown;
      metodos_pago_permitidos: unknown;
      delivery_enabled: boolean;
      pickup_enabled: boolean;
    }[]
  >`
    SELECT id, nombre, slug, zona_horaria, payment_methods, metodos_pago_permitidos,
           delivery_enabled, pickup_enabled
    FROM   public.restaurante
    WHERE  slug = ${slug}
    LIMIT  1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    slug: row.slug,
    zonaHoraria: row.zona_horaria ?? "Atlantic/Canary",
    paymentMethods: publicPaymentMethods(row.payment_methods, row.metodos_pago_permitidos),
    deliveryEnabled: row.delivery_enabled,
    pickupEnabled: row.pickup_enabled,
  };
}

export async function loadSchedule(sql: Sql, restauranteId: number): Promise<DaySchedule[]> {
  return sql<DaySchedule[]>`
    SELECT dia,
           COALESCE(disponible, false) AS disponible,
           to_char(apertura_1, 'HH24:MI') AS apertura_1,
           to_char(cierre_1,   'HH24:MI') AS cierre_1,
           to_char(apertura_2, 'HH24:MI') AS apertura_2,
           to_char(cierre_2,   'HH24:MI') AS cierre_2
    FROM   public.horarios
    WHERE  restaurante_id = ${restauranteId}
  `;
}

export async function loadConfig(sql: Sql, restauranteId: number): Promise<Map<string, string>> {
  const rows = await sql<{ config_key: string; config_value: string }[]>`
    SELECT config_key, config_value
    FROM   public.restaurante_config
    WHERE  restaurante_id = ${restauranteId}
  `;
  return new Map(rows.map((row) => [row.config_key, row.config_value]));
}

export function openOverride(config: ReadonlyMap<string, string>): OpenOverride {
  const value = config.get(CONFIG_KEY.OpenOverride);
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

const surchargeConfigSchema = z.array(
  z.object({
    label: z.string().min(1).max(40),
    below: z.number().positive(),
    amount: z.number().positive(),
    appliesTo: z.array(z.enum([FULFILLMENT.Pickup, FULFILLMENT.Delivery])).optional(),
  }),
);

/** Lee las reglas de suplemento; una configuración mal escrita se ignora en lugar de romper el checkout. */
export function surchargeRules(config: ReadonlyMap<string, string>): SurchargeRule[] {
  const raw = config.get(CONFIG_KEY.SurchargeRules);
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = surchargeConfigSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.map((rule) => ({
    kind: SURCHARGE_KIND.BelowSubtotal,
    label: rule.label,
    thresholdCents: cents(eurosToCents(rule.below)),
    amountCents: cents(eurosToCents(rule.amount)),
    // Sin indicar: recogida y reparto. Los pedidos en mesa no llevan envases.
    appliesTo: rule.appliesTo ?? [FULFILLMENT.Pickup, FULFILLMENT.Delivery],
  }));
}

function minutesFrom(config: ReadonlyMap<string, string>, key: string): number | null {
  const value = Number.parseInt(config.get(key) ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function textFrom(config: ReadonlyMap<string, string>, key: string): string | null {
  const value = config.get(key)?.trim();
  return value ? value.slice(0, 40) : null;
}

/** Base del tiempo estimado: un texto fijo del restaurante o un rango en minutos. */
export type EtaBase =
  | { readonly kind: "texto"; readonly text: string }
  | { readonly kind: "rango"; readonly range: EtaRange };

function rangeOf(min: number | null, max: number | null): EtaBase | null {
  const low = min ?? max;
  const high = max ?? min;
  if (low === null || high === null) return null;
  return { kind: "rango", range: { min: Math.min(low, high), max: Math.max(low, high) } };
}

function textOf(config: ReadonlyMap<string, string>, key: string): EtaBase | null {
  const text = textFrom(config, key);
  return text ? { kind: "texto", text } : null;
}

/** Base de recogida configurada para el restaurante, o `null` («a confirmar»). */
export function pickupEta(config: ReadonlyMap<string, string>): EtaBase | null {
  return (
    textOf(config, CONFIG_KEY.PickupEtaText) ??
    rangeOf(minutesFrom(config, CONFIG_KEY.PickupEtaMinutes), null) ??
    rangeOf(minutesFrom(config, CONFIG_KEY.PickupEtaLegacy), null)
  );
}

/** Base de reparto: la de la zona; si no, la del restaurante; si no, `null`. */
export function deliveryEta(
  zone: { readonly min: number | null; readonly max: number | null },
  config: ReadonlyMap<string, string>,
): EtaBase | null {
  return (
    rangeOf(zone.min, zone.max) ??
    textOf(config, CONFIG_KEY.DeliveryEtaText) ??
    rangeOf(
      minutesFrom(config, CONFIG_KEY.DeliveryEtaMin),
      minutesFrom(config, CONFIG_KEY.DeliveryEtaMax),
    ) ??
    rangeOf(minutesFrom(config, CONFIG_KEY.DeliveryEtaLegacy), null)
  );
}

/** Ajuste por cola configurado (`cola_*`), o `null` si el restaurante no lo usa. */
export function queueRule(config: ReadonlyMap<string, string>): QueueRule | null {
  const perOrder = minutesFrom(config, CONFIG_KEY.QueueMinutesPerOrder);
  if (perOrder === null) return null;
  const free = Number.parseInt(config.get(CONFIG_KEY.QueueFreeOrders) ?? "0", 10);
  return { minutesPerOrder: perOrder, freeOrders: Number.isFinite(free) && free > 0 ? free : 0 };
}

export type BusyModeSettings = { readonly opciones: number[]; readonly duracion_minutos: number };

const busyOptionsSchema = z.array(z.number().int().min(1).max(240)).min(1).max(6);

/**
 * Opciones del «modo ocupado» del restaurante. Sin configuración (o con un valor no válido) el
 * panel no ofrece el botón: no hay valores por defecto en el código.
 */
export function busyModeSettings(config: ReadonlyMap<string, string>): BusyModeSettings | null {
  const rawOptions = config.get(CONFIG_KEY.BusyModeOptions);
  const duration = Number(config.get(CONFIG_KEY.BusyModeDuration));
  if (!rawOptions || !Number.isInteger(duration) || duration < 5 || duration > 720) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOptions);
  } catch {
    return null;
  }
  const options = busyOptionsSchema.safeParse(parsed);
  if (!options.success) return null;
  return { opciones: [...new Set(options.data)].sort((a, b) => a - b), duracion_minutos: duration };
}

export type DeliveryZoneTerms = {
  readonly zoneId: number;
  readonly name: string;
  readonly postalCode: string | null;
  readonly eta: EtaBase | null;
  readonly minOrderCents: Cents;
  readonly freeFromCents: Cents | null;
  readonly fee: DeliveryFeeRule;
};

export async function findDeliveryZone(
  sql: Sql,
  restauranteId: number,
  zoneId: number,
  config: ReadonlyMap<string, string>,
): Promise<DeliveryZoneTerms | null> {
  const rows = await sql<
    {
      delivery_zone_id: number;
      zone_name: string;
      fee: string;
      min_order_amount: string | null;
      estimated_minutes_min: number | null;
      estimated_minutes_max: number | null;
      postal_code: string | null;
      tipo_tarifa: string;
      tarifa_por_km: string | null;
      tarifa_maxima: string | null;
      envio_gratis_desde: string | null;
    }[]
  >`
    SELECT delivery_zone_id, zone_name, fee, min_order_amount, estimated_minutes_min,
           estimated_minutes_max, postal_code, tipo_tarifa, tarifa_por_km, tarifa_maxima,
           envio_gratis_desde
    FROM   public.delivery_zone
    WHERE  delivery_zone_id = ${zoneId}
      AND  restaurante_id   = ${restauranteId}
      AND  is_active        = true
    LIMIT  1
  `;
  const zone = rows[0];
  if (!zone) return null;
  const optionalCents = (value: string | null) =>
    value === null ? null : cents(eurosToCents(value));
  return {
    zoneId: zone.delivery_zone_id,
    name: zone.zone_name,
    minOrderCents: cents(eurosToCents(zone.min_order_amount)),
    freeFromCents: optionalCents(zone.envio_gratis_desde),
    postalCode: zone.postal_code,
    eta: deliveryEta({ min: zone.estimated_minutes_min, max: zone.estimated_minutes_max }, config),
    fee: {
      kind:
        zone.tipo_tarifa === DELIVERY_FEE_KIND.PerKm
          ? DELIVERY_FEE_KIND.PerKm
          : DELIVERY_FEE_KIND.Flat,
      baseCents: cents(eurosToCents(zone.fee)),
      perKmCents: optionalCents(zone.tarifa_por_km),
      maxCents: optionalCents(zone.tarifa_maxima),
    },
  };
}

export function fulfillmentEnabled(restaurant: Restaurant, fulfillment: Fulfillment): boolean {
  // La mesa depende del módulo de mesas (lo comprueba el permiso de la ruta).
  if (fulfillment === FULFILLMENT.DineIn) return true;
  return fulfillment === FULFILLMENT.Delivery
    ? restaurant.deliveryEnabled
    : restaurant.pickupEnabled;
}

/** URL del webhook de avisos de n8n: clave nueva y, mientras exista el dashboard antiguo, la vieja. */
export function notificationWebhookUrl(config: ReadonlyMap<string, string>): string | null {
  for (const key of [CONFIG_KEY.N8nWebhookAvisos, CONFIG_KEY.LegacyWebhookAvisos]) {
    const value = config.get(key)?.trim();
    if (value && /^https?:\/\//.test(value)) return value;
  }
  return null;
}
