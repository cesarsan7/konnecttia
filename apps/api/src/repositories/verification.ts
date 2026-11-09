import { FULFILLMENT, type Fulfillment } from "@konnecttia/domain";
import type { AppDeps } from "../context";
import type { Sql } from "../lib/db";
import { generateCode, hashCode, hashesMatch } from "../lib/verification-code";
import { isPhoneBlocked } from "./antifraud";
import { CONFIG_KEY, type Restaurant } from "./restaurants";

/**
 * Antifraude capa 3 (ADR 0011): código de verificación del teléfono, solo cuando el pedido web
 * tiene riesgo. Los tiempos usan el reloj de la base (now()) para ser coherentes con las
 * restricciones de `verificacion_codigo`.
 */

export const CODE_RULES = {
  ttlMinutes: 10,
  maxAttempts: 5,
  /** Una vez verificado, el código sirve para un pedido durante este tiempo. */
  verifiedValidMinutes: 30,
  resendSeconds: 60,
  maxPerHour: 5,
  defaultMonthlyCapEur: 10,
  defaultAmountThresholdEur: 30,
  /** Tarifa de WhatsApp (autenticación, España): 0,0166 € por mensaje. */
  whatsappCostEur: 0.0166,
} as const;

export const RISK_REASON = {
  NewPhone: "telefono_nuevo",
  CashDelivery: "efectivo_reparto",
  HighAmount: "importe_alto",
} as const;
export type RiskReason = (typeof RISK_REASON)[keyof typeof RISK_REASON];

/** Pagos que ya garantizan el cobro: con el tope de gasto alcanzado no necesitan código. */
const GUARANTEED_PAYMENT = new Set(["tarjeta", "online"]);
const CASH = "efectivo";

export type CodeSettings = {
  /** null = capa 3 apagada para este restaurante (el SMS está descartado por ahora). */
  readonly channel: "whatsapp" | null;
  readonly monthlyCapEur: number;
  readonly amountThresholdEur: number;
};

function decimalFrom(config: ReadonlyMap<string, string>, key: string, fallback: number): number {
  const raw = config.get(key);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function codeSettings(config: ReadonlyMap<string, string>): CodeSettings {
  return {
    channel: config.get(CONFIG_KEY.AntifraudCodeChannel) === "whatsapp" ? "whatsapp" : null,
    monthlyCapEur: decimalFrom(
      config,
      CONFIG_KEY.AntifraudCodeMonthlyCap,
      CODE_RULES.defaultMonthlyCapEur,
    ),
    amountThresholdEur: decimalFrom(
      config,
      CONFIG_KEY.AntifraudCodeAmountThreshold,
      CODE_RULES.defaultAmountThresholdEur,
    ),
  };
}

/** ¿Puede esta API enviar códigos? Sin proveedor y secreto, la capa 3 no se aplica. */
export function codesAvailable(deps: AppDeps): boolean {
  return Boolean(deps.sendCode && deps.codeSecret);
}

async function normalizedPhone(sql: Sql, phone: string): Promise<string> {
  const [row] = await sql<{ telefono: string }[]>`
    SELECT public.fn_telefono_normalizado(${phone}) AS telefono
  `;
  return row?.telefono ?? "";
}

async function isKnownPhone(sql: Sql, restaurantId: number, phone: string): Promise<boolean> {
  const [row] = await sql<{ conocido: boolean }[]>`
    SELECT public.fn_telefono_conocido(${restaurantId}::int4, ${phone}) AS conocido
  `;
  return row?.conocido === true;
}

/**
 * Por qué este pedido necesita código, o null si no lo necesita. El cliente con un pedido
 * entregado antes solo lo repite si el importe llega al umbral; un teléfono nuevo, siempre.
 */
export async function riskReason(
  sql: Sql,
  restaurantId: number,
  phone: string,
  order: {
    readonly fulfillment: Fulfillment;
    readonly paymentMethod: string;
    readonly totalEur: number;
  },
  settings: CodeSettings,
): Promise<RiskReason | null> {
  const known = await isKnownPhone(sql, restaurantId, phone);
  const highAmount = order.totalEur >= settings.amountThresholdEur;
  if (known) return highAmount ? RISK_REASON.HighAmount : null;
  if (order.fulfillment === FULFILLMENT.Delivery && order.paymentMethod === CASH) {
    return RISK_REASON.CashDelivery;
  }
  return highAmount ? RISK_REASON.HighAmount : RISK_REASON.NewPhone;
}

async function monthSpendEur(sql: Sql, restaurantId: number): Promise<number> {
  const [row] = await sql<{ gasto: string }[]>`
    SELECT public.fn_codigo_gasto_mes(${restaurantId}::int4, now()) AS gasto
  `;
  return Number(row?.gasto ?? 0);
}

/** ¿Se alcanzó el tope mensual? Con el tope a 0 siempre. */
export async function capReached(
  sql: Sql,
  restaurantId: number,
  settings: CodeSettings,
): Promise<boolean> {
  return (
    (await monthSpendEur(sql, restaurantId)) + CODE_RULES.whatsappCostEur > settings.monthlyCapEur
  );
}

/**
 * Consume la verificación de un teléfono para crear un pedido: la más reciente verificada, sin
 * usar y dentro de su plazo. Una sola vez (UPDATE atómico): dos pedidos no comparten un código.
 */
export async function consumeVerification(
  sql: Sql,
  restaurantId: number,
  phone: string,
): Promise<boolean> {
  const rows = await sql`
    UPDATE public.verificacion_codigo
    SET    consumido_at = now()
    WHERE  id = (
      SELECT id FROM public.verificacion_codigo
      WHERE  restaurante_id = ${restaurantId}
        AND  telefono = public.fn_telefono_normalizado(${phone})
        AND  verificado_at IS NOT NULL
        AND  consumido_at IS NULL
        AND  verificado_at > now() - make_interval(mins => ${CODE_RULES.verifiedValidMinutes})
      ORDER  BY created_at DESC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  return rows.length > 0;
}

export type GateResult =
  | { readonly pass: true }
  | {
      readonly pass: false;
      readonly kind: "required" | "unavailable";
      readonly reason: RiskReason;
    };

/**
 * Control del pedido web: ¿puede crearse con lo que el cliente ya verificó? Se llama con el
 * total calculado por el servidor, justo antes de crear el pedido.
 */
export async function checkOrderGate(
  deps: AppDeps,
  restaurantId: number,
  config: ReadonlyMap<string, string>,
  order: {
    readonly phone: string;
    readonly fulfillment: Fulfillment;
    readonly paymentMethod: string;
    readonly totalCents: number;
  },
): Promise<GateResult> {
  if (!codesAvailable(deps)) return { pass: true };
  const settings = codeSettings(config);
  if (!settings.channel) return { pass: true };
  const reason = await riskReason(
    deps.sql,
    restaurantId,
    order.phone,
    {
      fulfillment: order.fulfillment,
      paymentMethod: order.paymentMethod,
      totalEur: order.totalCents / 100,
    },
    settings,
  );
  if (!reason) return { pass: true };
  if (await consumeVerification(deps.sql, restaurantId, order.phone)) return { pass: true };
  if (await capReached(deps.sql, restaurantId, settings)) {
    // Tope alcanzado: no se envían más códigos. El cobro garantizado pasa; el resto, no en seco,
    // sino con un mensaje para pagar con tarjeta o llamar al local.
    return GUARANTEED_PAYMENT.has(order.paymentMethod)
      ? { pass: true }
      : { pass: false, kind: "unavailable", reason };
  }
  return { pass: false, kind: "required", reason };
}

export type RequestCodeResult =
  | { readonly kind: "not_required" }
  | { readonly kind: "not_accepted" }
  | { readonly kind: "unavailable"; readonly reason: RiskReason }
  | { readonly kind: "wait"; readonly retryAfterSeconds: number }
  | { readonly kind: "limit" }
  | { readonly kind: "failed" }
  | {
      readonly kind: "sent";
      readonly channel: "whatsapp";
      readonly reason: RiskReason;
      readonly expiresInSeconds: number;
      readonly resendInSeconds: number;
    };

/** Cuántos códigos se enviaron a este teléfono y hace cuánto fue el último. */
async function recentSends(sql: Sql, restaurantId: number, phone: string) {
  const [row] = await sql<{ ultima_hora: number; segundos: number | null }[]>`
    SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS ultima_hora,
           floor(extract(epoch FROM now() - max(created_at)))::int AS segundos
    FROM   public.verificacion_codigo
    WHERE  restaurante_id = ${restaurantId}
      AND  telefono = public.fn_telefono_normalizado(${phone})
  `;
  return { lastHour: row?.ultima_hora ?? 0, secondsSinceLast: row?.segundos ?? null };
}

/**
 * Envía un código si el pedido que describe el cliente tiene riesgo. El cliente puede mentir
 * sobre el pedido, pero solo consigue que se envíe un código a SU teléfono: el coste lo acotan
 * el captcha, el límite por IP, el reenvío cada 60 s, 5 por hora y el tope mensual. El control
 * real de que el pedido tiene código está en `checkOrderGate`, con el total del servidor.
 */
export async function requestCode(
  deps: AppDeps,
  restaurant: Restaurant,
  config: ReadonlyMap<string, string>,
  input: {
    readonly phone: string;
    readonly fulfillment: Fulfillment;
    readonly paymentMethod: string;
    readonly totalEur: number;
  },
): Promise<RequestCodeResult> {
  const { sql, sendCode, codeSecret } = deps;
  const settings = codeSettings(config);
  if (!sendCode || !codeSecret || !settings.channel) return { kind: "not_required" };
  // Mensaje neutro, como en el pedido: no se revela que el teléfono está bloqueado.
  if (await isPhoneBlocked(sql, restaurant.id, input.phone)) return { kind: "not_accepted" };

  const reason = await riskReason(
    sql,
    restaurant.id,
    input.phone,
    {
      fulfillment: input.fulfillment,
      paymentMethod: input.paymentMethod,
      totalEur: input.totalEur,
    },
    settings,
  );
  if (!reason) return { kind: "not_required" };

  if (await capReached(sql, restaurant.id, settings)) {
    return GUARANTEED_PAYMENT.has(input.paymentMethod)
      ? { kind: "not_required" }
      : { kind: "unavailable", reason };
  }

  const recent = await recentSends(sql, restaurant.id, input.phone);
  if (recent.secondsSinceLast !== null && recent.secondsSinceLast < CODE_RULES.resendSeconds) {
    return { kind: "wait", retryAfterSeconds: CODE_RULES.resendSeconds - recent.secondsSinceLast };
  }
  if (recent.lastHour >= CODE_RULES.maxPerHour) return { kind: "limit" };

  const phone = await normalizedPhone(sql, input.phone);
  const code = generateCode();
  // Se reserva el gasto antes de enviar: dos peticiones seguidas no se saltan el tope.
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO public.verificacion_codigo
      (restaurante_id, telefono, canal, motivo, codigo_hash, caduca_at, max_intentos, coste_eur)
    VALUES (
      ${restaurant.id}, ${phone}, ${settings.channel}, ${reason},
      ${hashCode(codeSecret, restaurant.id, phone, code)},
      now() + make_interval(mins => ${CODE_RULES.ttlMinutes}),
      ${CODE_RULES.maxAttempts}, ${CODE_RULES.whatsappCostEur}
    )
    RETURNING id
  `;
  const sent = await sendCode({ telefono: phone, codigo: code, restaurante: restaurant.nombre });
  if (!sent) {
    // No salió nada: no cuenta para el tope ni para el límite de reenvíos.
    await sql`DELETE FROM public.verificacion_codigo WHERE id = ${row?.id ?? 0}`;
    return { kind: "failed" };
  }
  return {
    kind: "sent",
    channel: settings.channel,
    reason,
    expiresInSeconds: CODE_RULES.ttlMinutes * 60,
    resendInSeconds: CODE_RULES.resendSeconds,
  };
}

export type ConfirmResult =
  | { readonly kind: "verified" }
  | { readonly kind: "wrong"; readonly attemptsLeft: number }
  | { readonly kind: "locked" }
  | { readonly kind: "expired" };

/**
 * Comprueba el código escrito contra el último enviado (sin caducar ni verificar). Cada fallo
 * cuenta un intento; con 5 fallos el código se bloquea y hay que pedir otro.
 */
export async function confirmCode(
  sql: Sql,
  secret: string,
  restaurantId: number,
  phone: string,
  code: string,
): Promise<ConfirmResult> {
  const normalized = await normalizedPhone(sql, phone);
  return sql.begin(async (tx) => {
    const [row] = await tx<
      { id: number; codigo_hash: string; intentos: number; max_intentos: number }[]
    >`
      SELECT id, codigo_hash, intentos, max_intentos
      FROM   public.verificacion_codigo
      WHERE  restaurante_id = ${restaurantId}
        AND  telefono = ${normalized}
        AND  verificado_at IS NULL
        AND  caduca_at > now()
      ORDER  BY created_at DESC
      LIMIT  1
      FOR UPDATE
    `;
    if (!row) return { kind: "expired" as const };
    if (row.intentos >= row.max_intentos) return { kind: "locked" as const };
    if (hashesMatch(row.codigo_hash, hashCode(secret, restaurantId, normalized, code))) {
      await tx`UPDATE public.verificacion_codigo SET verificado_at = now() WHERE id = ${row.id}`;
      return { kind: "verified" as const };
    }
    await tx`UPDATE public.verificacion_codigo SET intentos = intentos + 1 WHERE id = ${row.id}`;
    const left = row.max_intentos - row.intentos - 1;
    return left > 0 ? { kind: "wrong" as const, attemptsLeft: left } : { kind: "locked" as const };
  });
}
