import { ALL_BRANCHES, canAccessBranch, PERMISSION } from "@konnecttia/access";
import {
  allowedPaymentMethods,
  type BankDetails,
  checkDaySchedule,
  checkPaymentSetup,
  type DaySchedule,
  effectiveBrandColor,
  enabledPaymentMethods,
  FULFILLMENT,
  isValidIban,
  normalizeHex,
  PAYMENT_METHODS,
  parseSocialLinks,
  readSocialLinks,
  SOCIAL_NETWORKS,
  sameWeekday,
  WEEKDAYS_ES,
} from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { type Sql, UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import {
  isValidPhoneLimit,
  isValidPolicyUrl,
  PHONE_LIMIT_MAX,
  PRIVACY_URL_MAX,
  PRIVACY_VERSION_MAX,
} from "../lib/settings-validation";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { phoneLimits } from "../repositories/antifraud";
import { loadBranches } from "../repositories/branches";
import { deliveryPhotoMode } from "../repositories/delivery-photos";
import { detectImageType } from "../repositories/menu-admin";
import { CONFIG_KEY, loadConfig, surchargeRules } from "../repositories/restaurants";

/**
 * Ajustes del restaurante desde el panel: datos, servicios y pago, tiempos, apertura manual,
 * horarios, festivos y datos de cada local.
 * - settings.view para leer y settings.update para cambiar.
 * - Lo que es del restaurante (datos, pago, horario general, festivos generales) solo lo cambia
 *   quien tiene alcance sobre todos los locales. Lo de un local, quien tiene ese local.
 * - Todo cambio queda en auditoria.
 * Las claves de restaurante_config son las mismas que leen la API y n8n (CONFIG_KEY).
 */

type Tx = TransactionSql<{ bigint: number }>;
type Ctx = Context<AppEnv>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Apertura manual: sin valor = manda el horario. */
const OPEN_MODE = { Auto: "auto", Open: "abierto", Closed: "cerrado" } as const;

const time = z.string().regex(TIME).nullable();
const minutes = z.number().int().min(1).max(600).nullable();
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

const daySchema = z.object({
  dia: z.enum(WEEKDAYS_ES),
  disponible: z.boolean(),
  apertura_1: time,
  cierre_1: time,
  apertura_2: time,
  cierre_2: time,
});
const weekSchema = z
  .array(daySchema)
  .length(WEEKDAYS_ES.length)
  .refine((days) => new Set(days.map((day) => day.dia)).size === WEEKDAYS_ES.length);

const bankSchema = z
  .object({
    titular: text(120),
    banco: text(120),
    iban: text(42),
    concepto: text(120),
    bizum: text(20),
  })
  .partial();

const restaurantSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    telefono: text(30),
    direccion: text(200),
    descripcion: text(500),
    eslogan: text(120),
    recogida: z.boolean(),
    reparto: z.boolean(),
    metodos_pago: z.array(z.enum(PAYMENT_METHODS)).max(PAYMENT_METHODS.length),
    datos_bancarios: bankSchema.nullable(),
    apertura_manual: z.enum([OPEN_MODE.Auto, OPEN_MODE.Open, OPEN_MODE.Closed]),
    recogida_minutos: minutes,
    reparto_minutos_min: minutes,
    reparto_minutos_max: minutes,
    modo_ocupado_opciones: z.array(z.number().int().min(1).max(240)).max(6),
    modo_ocupado_duracion_minutos: z.number().int().min(5).max(720).nullable(),
    /** Foto de entrega del repartidor: no | opcional | obligatoria. */
    reparto_foto_entrega: z.enum(["no", "opcional", "obligatoria"]),
    /** Política de privacidad propia (http/https); vacío = página plantilla /[slug]/privacidad. */
    privacidad_url: text(PRIVACY_URL_MAX).refine(isValidPolicyUrl),
    /** Versión vigente de la política: los pedidos web nuevos guardan esta. */
    privacidad_version: text(PRIVACY_VERSION_MAX),
    /** Límites antifraude por teléfono; vacío = sin límite. */
    antifraude_abiertos: z
      .number()
      .int()
      .min(1)
      .max(PHONE_LIMIT_MAX)
      .nullable()
      .refine(isValidPhoneLimit),
    antifraude_por_hora: z
      .number()
      .int()
      .min(1)
      .max(PHONE_LIMIT_MAX)
      .nullable()
      .refine(isValidPhoneLimit),
    /** Color de marca (pieza AA): `#rrggbb`/`#rgb`, o null para volver al de EasyOrder. */
    color_marca: z
      .string()
      .max(9)
      .nullable()
      .refine((value) => value === null || normalizeHex(value) !== null),
    /** Redes sociales y web (pieza Z): `[{ red, url }]`, una por red. Vacío = ninguna. */
    redes_sociales: z
      .array(z.object({ red: z.string().max(20), url: z.string().max(400) }))
      .max(SOCIAL_NETWORKS.length),
    /** Suplementos por pedido pequeño (envases…): se guardan en surcharge_rules. */
    suplementos: z
      .array(
        z.object({
          concepto: z.string().trim().min(1).max(40),
          por_debajo_centimos: z.number().int().min(1).max(100_000),
          importe_centimos: z.number().int().min(1).max(10_000),
          aplica_a: z.enum(["ambos", "recogida", "reparto"]).default("ambos"),
        }),
      )
      .max(5),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const branchSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    direccion: text(200),
    telefono: text(30),
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    activo: z.boolean(),
    recogida: z.boolean(),
    reparto: z.boolean(),
    apertura_manual: z.enum([OPEN_MODE.Auto, OPEN_MODE.Open, OPEN_MODE.Closed]),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const branchScheduleSchema = z.object({ dias: weekSchema.nullable() });

const holidaySchema = z.object({
  fecha: z.string().regex(DATE),
  nombre: text(120).default(null),
  cerrado: z.boolean().default(false),
  /** null = todos los locales. */
  sucursal_id: z.number().int().positive().nullable().default(null),
});

async function parse<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

function invalid(c: Ctx, field?: string, reason?: string) {
  return fail(c, 400, API_ERROR.InvalidBody, {
    ...(field ? { field } : {}),
    ...(reason ? { reason } : {}),
  });
}

function overrideFrom(value: string | undefined): (typeof OPEN_MODE)[keyof typeof OPEN_MODE] {
  if (value === "true") return OPEN_MODE.Open;
  if (value === "false") return OPEN_MODE.Closed;
  return OPEN_MODE.Auto;
}

function overrideToBool(mode: (typeof OPEN_MODE)[keyof typeof OPEN_MODE]): boolean | null {
  return mode === OPEN_MODE.Open ? true : mode === OPEN_MODE.Closed ? false : null;
}

function positiveInt(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function busyOptions(value: string | undefined): number[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

/** Guarda (o borra, con null) una clave de restaurante_config. */
export async function setConfig(
  tx: Tx,
  restauranteId: number,
  key: string,
  value: string | null,
  description: string,
) {
  if (value === null) {
    await tx`
      DELETE FROM public.restaurante_config
      WHERE  restaurante_id = ${restauranteId} AND config_key = ${key}
    `;
    return;
  }
  await tx`
    INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
    VALUES (${restauranteId}, ${key}, ${value}, ${description})
    ON CONFLICT (config_key, restaurante_id)
    DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = now()
  `;
}

type DayRow = DaySchedule & { id: number };

const DAY_COLUMNS = (sql: Sql | Tx) => sql`
  dia, COALESCE(disponible, false) AS disponible,
  to_char(apertura_1, 'HH24:MI') AS apertura_1, to_char(cierre_1, 'HH24:MI') AS cierre_1,
  to_char(apertura_2, 'HH24:MI') AS apertura_2, to_char(cierre_2, 'HH24:MI') AS cierre_2
`;

/** Semana completa en orden (lunes a domingo); los días sin fila salen cerrados. */
function fullWeek(rows: readonly DaySchedule[]): DaySchedule[] {
  return WEEKDAYS_ES.map((dia) => {
    const row = rows.find((candidate) => sameWeekday(candidate.dia, dia));
    return row
      ? {
          dia,
          disponible: row.disponible,
          apertura_1: row.apertura_1,
          cierre_1: row.cierre_1,
          apertura_2: row.apertura_2,
          cierre_2: row.cierre_2,
        }
      : {
          dia,
          disponible: false,
          apertura_1: null,
          cierre_1: null,
          apertura_2: null,
          cierre_2: null,
        };
  });
}

function firstScheduleError(days: readonly DaySchedule[]) {
  for (const day of days) {
    const error = checkDaySchedule(day);
    if (error) return { dia: day.dia, error };
  }
  return null;
}

export function registerSettingsRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    recursoTipo: string,
    recursoId: number | null,
    detalle: Record<string, unknown> = {},
    resultado: "ok" | "denegado" = "ok",
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado,
      detalle,
      requestId: c.get("requestId"),
    });

  const requireAllBranches = async (c: Ctx, accion: string) => {
    if (c.get("access").branchScope === ALL_BRANCHES) return null;
    await record(c, accion, "ajustes", null, { motivo: "branch_scope_limited" }, "denegado");
    return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_scope_limited" });
  };

  /** Locales visibles (módulo de varios locales + alcance del usuario). */
  const visibleBranchIds = async (c: Ctx) => {
    const branches = await loadBranches(sql, c.get("restaurant").id);
    return branches
      .filter((branch) => canAccessBranch(c.get("access"), branch.id))
      .map((branch) => branch.id);
  };

  // ---------------------------------------------------------------------------------- lectura

  app.get("/:slug/ajustes", requirePermission(deps, PERMISSION.SettingsView), async (c) => {
    const restauranteId = c.get("restaurant").id;
    const branchIds = await visibleBranchIds(c);
    const [restaurants, config, schedule, branches, branchSchedules, holidays] = await Promise.all([
      sql<
        {
          nombre: string;
          telefono: string | null;
          direccion: string | null;
          descripcion: string | null;
          eslogan: string | null;
          zona_horaria: string | null;
          pickup_enabled: boolean;
          delivery_enabled: boolean;
          payment_methods: unknown;
          metodos_pago_permitidos: unknown;
          datos_bancarios: unknown;
          logo_url: string | null;
          redes_sociales: unknown;
          brand_color: string | null;
        }[]
      >`
        SELECT nombre, telefono, direccion, descripcion, eslogan, zona_horaria, pickup_enabled,
               delivery_enabled, payment_methods, metodos_pago_permitidos, datos_bancarios,
               logo_url, redes_sociales, brand_color
        FROM   public.restaurante WHERE id = ${restauranteId}
      `,
      loadConfig(sql, restauranteId),
      sql<DaySchedule[]>`
        SELECT ${DAY_COLUMNS(sql)} FROM public.horarios WHERE restaurante_id = ${restauranteId}
      `,
      branchIds.length === 0
        ? Promise.resolve([])
        : sql<
            {
              id: number;
              nombre: string;
              direccion: string | null;
              telefono: string | null;
              lat: string | null;
              lng: string | null;
              principal: boolean;
              activo: boolean;
              recogida: boolean;
              reparto: boolean;
              forzar_abierto: boolean | null;
            }[]
          >`
            SELECT id, nombre, direccion, telefono, lat, lng, es_principal AS principal, activo,
                   acepta_recogida AS recogida, acepta_reparto AS reparto, forzar_abierto
            FROM   public.sucursal
            WHERE  restaurante_id = ${restauranteId} AND id IN ${sql(branchIds)}
            ORDER  BY es_principal DESC, nombre
          `,
      branchIds.length === 0
        ? Promise.resolve([])
        : sql<(DaySchedule & { sucursal_id: number })[]>`
            SELECT sucursal_id, ${DAY_COLUMNS(sql)} FROM public.sucursal_horario
            WHERE  sucursal_id IN ${sql(branchIds)}
          `,
      sql<
        {
          id: number;
          fecha: string;
          nombre: string | null;
          cerrado: boolean;
          sucursal_id: number | null;
        }[]
      >`
        SELECT id, to_char(fecha, 'YYYY-MM-DD') AS fecha, nombre, cerrado, sucursal_id
        FROM   public.festivo
        WHERE  restaurante_id = ${restauranteId}
          AND  fecha >= (${deps.now()}::timestamptz AT TIME ZONE 'UTC')::date - 1
        ORDER  BY fecha, sucursal_id NULLS FIRST
      `,
    ]);
    const restaurant = restaurants[0];
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const bank =
      restaurant.datos_bancarios && typeof restaurant.datos_bancarios === "object"
        ? (restaurant.datos_bancarios as Record<string, unknown>)
        : null;
    return c.json({
      restaurante: {
        nombre: restaurant.nombre,
        telefono: restaurant.telefono,
        direccion: restaurant.direccion,
        descripcion: restaurant.descripcion,
        eslogan: restaurant.eslogan,
        logo_url: restaurant.logo_url?.trim() || null,
        redes_sociales: readSocialLinks(restaurant.redes_sociales),
        color_marca: effectiveBrandColor(restaurant.brand_color),
        zona_horaria: restaurant.zona_horaria,
        recogida: restaurant.pickup_enabled,
        reparto: restaurant.delivery_enabled,
        // Solo los que el panel sabe gestionar (sin «online» hasta la pasarela) y que Konnecttia
        // permite a este restaurante.
        metodos_pago: enabledPaymentMethods(
          restaurant.payment_methods,
          restaurant.metodos_pago_permitidos,
        ),
        datos_bancarios: bank,
        apertura_manual: overrideFrom(config.get(CONFIG_KEY.OpenOverride)),
        recogida_minutos: positiveInt(config.get(CONFIG_KEY.PickupEtaMinutes)),
        reparto_minutos_min: positiveInt(config.get(CONFIG_KEY.DeliveryEtaMin)),
        reparto_minutos_max: positiveInt(config.get(CONFIG_KEY.DeliveryEtaMax)),
        modo_ocupado_opciones: busyOptions(config.get(CONFIG_KEY.BusyModeOptions)),
        modo_ocupado_duracion_minutos: positiveInt(config.get(CONFIG_KEY.BusyModeDuration)),
        reparto_foto_entrega: deliveryPhotoMode(config),
        privacidad_url: config.get(CONFIG_KEY.PrivacyUrl)?.trim() || null,
        privacidad_version: config.get(CONFIG_KEY.PrivacyVersion)?.trim() || null,
        antifraude_abiertos: phoneLimits(config).open,
        antifraude_por_hora: phoneLimits(config).perHour,
        suplementos: surchargeRules(config).map((rule) => ({
          concepto: rule.label,
          por_debajo_centimos: rule.thresholdCents,
          importe_centimos: rule.amountCents,
          aplica_a:
            rule.appliesTo?.length === 1
              ? rule.appliesTo[0] === FULFILLMENT.Pickup
                ? "recogida"
                : "reparto"
              : "ambos",
        })),
      },
      horario: fullWeek(schedule),
      locales: branches.map((branch) => {
        const own = branchSchedules.filter((day) => day.sucursal_id === branch.id);
        return {
          ...branch,
          lat: branch.lat === null ? null : Number(branch.lat),
          lng: branch.lng === null ? null : Number(branch.lng),
          apertura_manual:
            branch.forzar_abierto === null
              ? OPEN_MODE.Auto
              : branch.forzar_abierto
                ? OPEN_MODE.Open
                : OPEN_MODE.Closed,
          forzar_abierto: undefined,
          horario_propio: own.length === 0 ? null : fullWeek(own),
        };
      }),
      festivos: holidays.filter(
        (holiday) => holiday.sucursal_id === null || branchIds.includes(holiday.sucursal_id),
      ),
      // Lo que Konnecttia permite a este restaurante (todos si no fijó una lista).
      metodos_disponibles: allowedPaymentMethods(restaurant.metodos_pago_permitidos),
      edicion_completa: c.get("access").branchScope === ALL_BRANCHES,
    });
  });

  // ------------------------------------------------------------------------------ restaurante

  app.patch(
    "/:slug/ajustes/restaurante",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
      if (denied) return denied;
      const body = await parse(c, restaurantSchema);
      if (!body) return invalid(c);
      const restauranteId = c.get("restaurant").id;

      const [current] = await sql<
        {
          pickup_enabled: boolean;
          delivery_enabled: boolean;
          payment_methods: unknown;
          metodos_pago_permitidos: unknown;
          datos_bancarios: unknown;
        }[]
      >`
        SELECT pickup_enabled, delivery_enabled, payment_methods, metodos_pago_permitidos,
               datos_bancarios
        FROM   public.restaurante WHERE id = ${restauranteId}
      `;
      if (!current) return fail(c, 404, API_ERROR.RestaurantNotFound);

      // Comprobaciones con el estado final (lo enviado + lo que ya había).
      const pickup = body.recogida ?? current.pickup_enabled;
      const delivery = body.reparto ?? current.delivery_enabled;
      if (!pickup && !delivery) return invalid(c, "recogida", "no_service");
      const bank: BankDetails | null =
        body.datos_bancarios !== undefined
          ? body.datos_bancarios === null
            ? null
            : (Object.fromEntries(
                Object.entries(body.datos_bancarios).filter(([, value]) => value),
              ) as BankDetails)
          : (current.datos_bancarios as BankDetails | null);
      if (bank?.iban && !isValidIban(bank.iban))
        return invalid(c, "datos_bancarios.iban", "invalid_iban");
      if (body.metodos_pago !== undefined) {
        // Konnecttia fija qué métodos puede activar cada restaurante (pieza K).
        const allowed = allowedPaymentMethods(current.metodos_pago_permitidos);
        if (body.metodos_pago.some((method) => !allowed.includes(method))) {
          return fail(c, 422, API_ERROR.Unprocessable, {
            field: "metodos_pago",
            reason: "payment_method_not_allowed",
          });
        }
      }
      if (body.metodos_pago !== undefined || body.datos_bancarios !== undefined) {
        const methods =
          body.metodos_pago ??
          enabledPaymentMethods(current.payment_methods, current.metodos_pago_permitidos);
        const problem = checkPaymentSetup(methods, bank);
        if (problem) return invalid(c, "metodos_pago", problem);
      }
      const social =
        body.redes_sociales === undefined ? null : parseSocialLinks(body.redes_sociales);
      if (social && !social.ok) {
        return invalid(c, `redes_sociales.${social.index}`, social.error);
      }
      const min = body.reparto_minutos_min;
      const max = body.reparto_minutos_max;
      if (min != null && max != null && min > max)
        return invalid(c, "reparto_minutos_min", "min_over_max");
      if (
        body.modo_ocupado_opciones !== undefined &&
        body.modo_ocupado_opciones.length > 0 &&
        body.modo_ocupado_duracion_minutos === null
      ) {
        return invalid(c, "modo_ocupado_duracion_minutos");
      }

      const has = (key: keyof typeof body) => Object.hasOwn(body, key);
      const cleanBank = bank
        ? Object.fromEntries(
            Object.entries(bank)
              .filter(([, value]) => typeof value === "string" && value.trim())
              .map(([key, value]) => [
                key,
                key === "iban" ? String(value).replace(/\s/g, "").toUpperCase() : value,
              ]),
          )
        : null;

      await sql.begin(async (tx) => {
        await tx`
          UPDATE public.restaurante
          SET    nombre           = COALESCE(${body.nombre ?? null}, nombre),
                 telefono         = CASE WHEN ${has("telefono")} THEN ${body.telefono ?? null} ELSE telefono END,
                 direccion        = CASE WHEN ${has("direccion")} THEN ${body.direccion ?? null} ELSE direccion END,
                 descripcion      = CASE WHEN ${has("descripcion")} THEN ${body.descripcion ?? null} ELSE descripcion END,
                 eslogan          = CASE WHEN ${has("eslogan")} THEN ${body.eslogan ?? null} ELSE eslogan END,
                 brand_color      = CASE WHEN ${has("color_marca")}
                                         THEN ${body.color_marca == null ? null : normalizeHex(body.color_marca)}
                                         ELSE brand_color END,
                 redes_sociales   = CASE WHEN ${has("redes_sociales")}
                                         THEN ${social?.ok && social.links.length > 0 ? tx.json([...social.links]) : null}::jsonb
                                         ELSE redes_sociales END,
                 pickup_enabled   = ${pickup},
                 delivery_enabled = ${delivery},
                 payment_methods  = CASE WHEN ${has("metodos_pago")}
                                         THEN ${tx.json(body.metodos_pago ?? [])}::jsonb
                                         ELSE payment_methods END,
                 datos_bancarios  = CASE WHEN ${has("datos_bancarios")}
                                         THEN ${cleanBank && Object.keys(cleanBank).length > 0 ? tx.json(cleanBank) : null}::jsonb
                                         ELSE datos_bancarios END
          WHERE  id = ${restauranteId}
        `;
        const config: [keyof typeof body, string, string | null, string][] = [
          [
            "apertura_manual",
            CONFIG_KEY.OpenOverride,
            body.apertura_manual === undefined
              ? null
              : (overrideToBool(body.apertura_manual)?.toString() ?? null),
            "Apertura o cierre manual desde el panel",
          ],
          [
            "recogida_minutos",
            CONFIG_KEY.PickupEtaMinutes,
            body.recogida_minutos?.toString() ?? null,
            "Minutos de recogida (panel)",
          ],
          [
            "reparto_minutos_min",
            CONFIG_KEY.DeliveryEtaMin,
            min?.toString() ?? null,
            "Reparto mínimo en minutos (panel)",
          ],
          [
            "reparto_minutos_max",
            CONFIG_KEY.DeliveryEtaMax,
            max?.toString() ?? null,
            "Reparto máximo en minutos (panel)",
          ],
          [
            "modo_ocupado_opciones",
            CONFIG_KEY.BusyModeOptions,
            body.modo_ocupado_opciones && body.modo_ocupado_opciones.length > 0
              ? JSON.stringify([...new Set(body.modo_ocupado_opciones)].sort((a, b) => a - b))
              : null,
            "Minutos extra del botón «Modo ocupado» del panel",
          ],
          [
            "modo_ocupado_duracion_minutos",
            CONFIG_KEY.BusyModeDuration,
            body.modo_ocupado_duracion_minutos?.toString() ?? null,
            "Duración del modo ocupado (minutos)",
          ],
          [
            "reparto_foto_entrega",
            CONFIG_KEY.DeliveryPhoto,
            body.reparto_foto_entrega ?? null,
            "Foto de entrega del repartidor (panel)",
          ],
          [
            "privacidad_url",
            CONFIG_KEY.PrivacyUrl,
            body.privacidad_url ?? null,
            "URL de la política de privacidad (panel)",
          ],
          [
            "privacidad_version",
            CONFIG_KEY.PrivacyVersion,
            body.privacidad_version ?? null,
            "Versión de la política de privacidad (panel)",
          ],
          [
            "antifraude_abiertos",
            CONFIG_KEY.AntifraudOpenPerPhone,
            body.antifraude_abiertos?.toString() ?? null,
            "Máximo de pedidos web abiertos por teléfono (panel)",
          ],
          [
            "antifraude_por_hora",
            CONFIG_KEY.AntifraudPerPhoneHour,
            body.antifraude_por_hora?.toString() ?? null,
            "Máximo de pedidos web por teléfono en la última hora (panel)",
          ],
          [
            "suplementos",
            CONFIG_KEY.SurchargeRules,
            body.suplementos && body.suplementos.length > 0
              ? JSON.stringify(
                  body.suplementos.map((rule) => ({
                    label: rule.concepto,
                    below: rule.por_debajo_centimos / 100,
                    amount: rule.importe_centimos / 100,
                    ...(rule.aplica_a === "ambos"
                      ? {}
                      : {
                          appliesTo: [
                            rule.aplica_a === "recogida"
                              ? FULFILLMENT.Pickup
                              : FULFILLMENT.Delivery,
                          ],
                        }),
                  })),
                )
              : null,
            "Suplementos por pedido pequeño (panel)",
          ],
        ];
        for (const [field, key, value, description] of config) {
          if (has(field)) await setConfig(tx, restauranteId, key, value, description);
        }
      });
      // Sin datos bancarios en la auditoría.
      const { datos_bancarios: _, ...logged } = body;
      await record(c, "ajustes.restaurante", "restaurante", restauranteId, {
        ...logged,
        ...(has("datos_bancarios") ? { datos_bancarios: "actualizados" } : {}),
      });
      return c.json({ ok: true });
    },
  );

  /**
   * Logo del restaurante (pieza Z): se sube al mismo almacenamiento público que las fotos de la
   * carta, se reconoce por su firma (JPG, PNG o WebP) y se guarda su URL en `restaurante.logo_url`.
   * Los archivos anteriores no se borran (el almacenamiento solo sube).
   */
  app.post(
    "/:slug/ajustes/logo",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    bodyLimit({
      maxSize: MAX_LOGO_BYTES + 64 * 1024,
      onError: (c) => fail(c, 413, API_ERROR.InvalidImage, { reason: "too_large" }),
    }),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
      if (denied) return denied;
      const storage = deps.imageStorage;
      if (!storage) return fail(c, 503, API_ERROR.StorageNotConfigured);
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.logo;
      if (!(file instanceof File)) return invalid(c, "logo");
      if (file.size > MAX_LOGO_BYTES) {
        return fail(c, 413, API_ERROR.InvalidImage, { reason: "too_large" });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = detectImageType(bytes);
      if (!type) return fail(c, 415, API_ERROR.InvalidImage, { reason: "unsupported_type" });
      const restauranteId = c.get("restaurant").id;
      const path = `${restauranteId}/logo-${crypto.randomUUID()}.${type.ext}`;
      const url = await storage.upload(path, bytes, type.mime);
      await sql`UPDATE public.restaurante SET logo_url = ${url} WHERE id = ${restauranteId}`;
      await record(c, "ajustes.logo", "restaurante", restauranteId, { ruta: path });
      return c.json({ logo_url: url });
    },
  );

  app.delete(
    "/:slug/ajustes/logo",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
      if (denied) return denied;
      const restauranteId = c.get("restaurant").id;
      await sql`UPDATE public.restaurante SET logo_url = NULL WHERE id = ${restauranteId}`;
      await record(c, "ajustes.logo.quitar", "restaurante", restauranteId);
      return c.json({ logo_url: null });
    },
  );

  app.put(
    "/:slug/ajustes/horario",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
      if (denied) return denied;
      const body = await parse(c, z.object({ dias: weekSchema }));
      if (!body) return invalid(c, "dias");
      const problem = firstScheduleError(body.dias);
      if (problem) return invalid(c, problem.dia, problem.error);
      const restauranteId = c.get("restaurant").id;
      await sql.begin(async (tx) => {
        const existing = await tx<DayRow[]>`
        SELECT id, dia FROM public.horarios WHERE restaurante_id = ${restauranteId} FOR UPDATE
      `;
        for (const day of body.dias) {
          // Se conserva la fila (y cómo escribe el día) para no romper lo que lee n8n.
          const row = existing.find((candidate) => sameWeekday(candidate.dia, day.dia));
          if (row) {
            await tx`
            UPDATE public.horarios
            SET    disponible = ${day.disponible}, apertura_1 = ${day.apertura_1}::time,
                   cierre_1 = ${day.cierre_1}::time, apertura_2 = ${day.apertura_2}::time,
                   cierre_2 = ${day.cierre_2}::time
            WHERE  id = ${row.id} AND restaurante_id = ${restauranteId}
          `;
          } else {
            await tx`
            INSERT INTO public.horarios
              (restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
            VALUES (${restauranteId}, ${day.dia}, ${day.disponible}, ${day.apertura_1}::time,
                    ${day.cierre_1}::time, ${day.apertura_2}::time, ${day.cierre_2}::time)
          `;
          }
        }
      });
      await record(c, "ajustes.horario", "restaurante", restauranteId, { dias: body.dias });
      return c.json({ ok: true });
    },
  );

  // ---------------------------------------------------------------------------------- festivos

  app.post(
    "/:slug/ajustes/festivos",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const body = await parse(c, holidaySchema);
      if (!body || Number.isNaN(Date.parse(`${body.fecha}T00:00:00Z`))) return invalid(c, "fecha");
      if (body.sucursal_id === null) {
        const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
        if (denied) return denied;
      } else if (!(await visibleBranchIds(c)).includes(body.sucursal_id)) {
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      try {
        const [row] = await sql<{ id: number }[]>`
        INSERT INTO public.festivo (restaurante_id, sucursal_id, fecha, nombre, cerrado)
        VALUES (${c.get("restaurant").id}, ${body.sucursal_id}, ${body.fecha}::date, ${body.nombre},
                ${body.cerrado})
        RETURNING id
      `;
        await record(c, "ajustes.festivo.crear", "festivo", row?.id ?? null, body);
        return c.json({ id: row?.id }, 201);
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_date" });
        }
        throw error;
      }
    },
  );

  app.delete(
    "/:slug/ajustes/festivos/:id",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const id = Number(c.req.param("id"));
      if (!Number.isSafeInteger(id) || id < 1) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      const [row] = await sql<{ sucursal_id: number | null }[]>`
        SELECT sucursal_id FROM public.festivo WHERE id = ${id} AND restaurante_id = ${restauranteId}
      `;
      if (!row) return fail(c, 404, API_ERROR.NotFound);
      if (row.sucursal_id === null) {
        const denied = await requireAllBranches(c, PERMISSION.SettingsUpdate);
        if (denied) return denied;
      } else if (!(await visibleBranchIds(c)).includes(row.sucursal_id)) {
        return fail(c, 404, API_ERROR.NotFound);
      }
      await sql`DELETE FROM public.festivo WHERE id = ${id} AND restaurante_id = ${restauranteId}`;
      await record(c, "ajustes.festivo.borrar", "festivo", id);
      return c.json({ id });
    },
  );

  // ------------------------------------------------------------------------------------ locales

  app.patch(
    "/:slug/ajustes/locales/:id",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const branchId = Number(c.req.param("id"));
      const body = await parse(c, branchSchema);
      if (!Number.isSafeInteger(branchId) || !body) return invalid(c);
      if (!(await visibleBranchIds(c)).includes(branchId)) {
        await record(
          c,
          "ajustes.local",
          "sucursal",
          branchId,
          { motivo: "branch_out_of_scope" },
          "denegado",
        );
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      if (
        (body.lat === undefined) !== (body.lng === undefined) ||
        (body.lat === null) !== (body.lng === null)
      ) {
        return invalid(c, "lat", "lat_lng_together");
      }
      const restauranteId = c.get("restaurant").id;
      const has = (key: keyof typeof body) => Object.hasOwn(body, key);
      const [current] = await sql<
        { es_principal: boolean; acepta_recogida: boolean; acepta_reparto: boolean }[]
      >`
        SELECT es_principal, acepta_recogida, acepta_reparto FROM public.sucursal
        WHERE  id = ${branchId} AND restaurante_id = ${restauranteId}
      `;
      if (!current) return fail(c, 404, API_ERROR.BranchNotAvailable);
      // La principal recibe los pedidos sin local (n8n): no se puede desactivar.
      if (body.activo === false && current.es_principal)
        return invalid(c, "activo", "principal_required");
      if (
        (body.recogida ?? current.acepta_recogida) === false &&
        (body.reparto ?? current.acepta_reparto) === false
      ) {
        return invalid(c, "recogida", "no_service");
      }
      try {
        await sql`
          UPDATE public.sucursal
          SET    nombre          = COALESCE(${body.nombre ?? null}, nombre),
                 direccion       = CASE WHEN ${has("direccion")} THEN ${body.direccion ?? null} ELSE direccion END,
                 telefono        = CASE WHEN ${has("telefono")} THEN ${body.telefono ?? null} ELSE telefono END,
                 lat             = CASE WHEN ${has("lat")} THEN ${body.lat ?? null}::numeric ELSE lat END,
                 lng             = CASE WHEN ${has("lng")} THEN ${body.lng ?? null}::numeric ELSE lng END,
                 activo          = COALESCE(${body.activo ?? null}::boolean, activo),
                 acepta_recogida = COALESCE(${body.recogida ?? null}::boolean, acepta_recogida),
                 acepta_reparto  = COALESCE(${body.reparto ?? null}::boolean, acepta_reparto),
                 forzar_abierto  = CASE WHEN ${has("apertura_manual")}
                                        THEN ${body.apertura_manual === undefined ? null : overrideToBool(body.apertura_manual)}::boolean
                                        ELSE forzar_abierto END,
                 updated_at      = now()
          WHERE  id = ${branchId} AND restaurante_id = ${restauranteId}
        `;
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
        }
        throw error;
      }
      await record(c, "ajustes.local", "sucursal", branchId, body);
      return c.json({ id: branchId });
    },
  );

  /** Horario propio de un local. `dias: null` = vuelve a usar el del restaurante. */
  app.put(
    "/:slug/ajustes/locales/:id/horario",
    requirePermission(deps, PERMISSION.SettingsUpdate),
    async (c) => {
      const branchId = Number(c.req.param("id"));
      const body = await parse(c, branchScheduleSchema);
      if (!Number.isSafeInteger(branchId) || !body) return invalid(c, "dias");
      if (!(await visibleBranchIds(c)).includes(branchId)) {
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      if (body.dias) {
        const problem = firstScheduleError(body.dias);
        if (problem) return invalid(c, problem.dia, problem.error);
      }
      await sql.begin(async (tx) => {
        await tx`DELETE FROM public.sucursal_horario WHERE sucursal_id = ${branchId}`;
        for (const day of body.dias ?? []) {
          await tx`
            INSERT INTO public.sucursal_horario
              (sucursal_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
            VALUES (${branchId}, ${day.dia}, ${day.disponible}, ${day.apertura_1}::time,
                    ${day.cierre_1}::time, ${day.apertura_2}::time, ${day.cierre_2}::time)
          `;
        }
      });
      await record(c, "ajustes.local.horario", "sucursal", branchId, {
        propio: body.dias !== null,
      });
      return c.json({ id: branchId });
    },
  );
}
