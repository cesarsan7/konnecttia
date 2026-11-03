import {
  cents,
  type DaySchedule,
  type DeliveryTerms,
  FULFILLMENT,
  type Fulfillment,
  type OpenOverride,
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

export const CONFIG_KEY = {
  OpenOverride: "is_open_override",
  PickupEtaMinutes: "pickup_eta_minutes",
  DeliveryEtaMin: "delivery_eta_min_minutes",
  DeliveryEtaMax: "delivery_eta_max_minutes",
  /** JSON con reglas de suplemento, p. ej. envases: [{"label":"Envases","below":25,"amount":1}] */
  SurchargeRules: "surcharge_rules",
} as const;

const DEFAULT_PICKUP_ETA_MINUTES = 20;
const DEFAULT_DELIVERY_ETA = { min: 30, max: 45 } as const;

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
      delivery_enabled: boolean;
      pickup_enabled: boolean;
    }[]
  >`
    SELECT id, nombre, slug, zona_horaria, payment_methods, delivery_enabled, pickup_enabled
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
    paymentMethods: Array.isArray(row.payment_methods)
      ? row.payment_methods.filter((value): value is string => typeof value === "string")
      : [],
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
    ...(rule.appliesTo ? { appliesTo: rule.appliesTo } : {}),
  }));
}

export function pickupEta(config: ReadonlyMap<string, string>): string {
  const minutes = Number.parseInt(config.get(CONFIG_KEY.PickupEtaMinutes) ?? "", 10);
  return `${Number.isFinite(minutes) ? minutes : DEFAULT_PICKUP_ETA_MINUTES} min`;
}

export type DeliveryZoneTerms = DeliveryTerms & {
  readonly zoneId: number;
  readonly postalCode: string | null;
  readonly eta: string;
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
      fee: string;
      min_order_amount: string | null;
      estimated_minutes_min: number | null;
      estimated_minutes_max: number | null;
      postal_code: string | null;
    }[]
  >`
    SELECT delivery_zone_id, fee, min_order_amount, estimated_minutes_min,
           estimated_minutes_max, postal_code
    FROM   public.delivery_zone
    WHERE  delivery_zone_id = ${zoneId}
      AND  restaurante_id   = ${restauranteId}
      AND  is_active        = true
    LIMIT  1
  `;
  const zone = rows[0];
  if (!zone) return null;
  const fromConfig = (key: string, fallback: number) => {
    const value = Number.parseInt(config.get(key) ?? "", 10);
    return Number.isFinite(value) ? value : fallback;
  };
  const etaMin =
    zone.estimated_minutes_min ?? fromConfig(CONFIG_KEY.DeliveryEtaMin, DEFAULT_DELIVERY_ETA.min);
  const etaMax =
    zone.estimated_minutes_max ?? fromConfig(CONFIG_KEY.DeliveryEtaMax, DEFAULT_DELIVERY_ETA.max);
  return {
    zoneId: zone.delivery_zone_id,
    feeCents: cents(eurosToCents(zone.fee)),
    minOrderCents: cents(eurosToCents(zone.min_order_amount)),
    postalCode: zone.postal_code,
    eta: `${etaMin}-${etaMax} min`,
  };
}

export function fulfillmentEnabled(restaurant: Restaurant, fulfillment: Fulfillment): boolean {
  return fulfillment === FULFILLMENT.Delivery
    ? restaurant.deliveryEnabled
    : restaurant.pickupEnabled;
}
