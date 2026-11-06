import {
  isTrialState,
  ORDER_STATUS,
  TRIAL_STATE,
  type TrialState,
  trialDaysLeft,
  trialOrdersLeft,
} from "@konnecttia/domain";
import type { Sql } from "../lib/db";

/** Plan que reciben los restaurantes creados desde el alta autoservicio (`plan.code`). */
export const TRIAL_PLAN = "prueba";

/** Claves de `plataforma_config` (la migración 0023 las siembra; no hay otras). */
export const PLATFORM_CONFIG_KEY = {
  SignupActive: "alta_autoservicio_activa",
  RequiresApproval: "alta_requiere_aprobacion",
  TrialDays: "prueba_dias",
  TrialMaxOrders: "prueba_max_pedidos",
  ContactEmail: "alta_contacto_email",
} as const;

export type PlatformConfigKey = (typeof PLATFORM_CONFIG_KEY)[keyof typeof PLATFORM_CONFIG_KEY];

export type PlatformConfig = {
  readonly signupActive: boolean;
  readonly requiresApproval: boolean;
  /** null = sin límite de días. */
  readonly trialDays: number | null;
  /** null = sin límite de pedidos. */
  readonly trialMaxOrders: number | null;
  readonly contactEmail: string | null;
};

const positiveInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

/**
 * Lee la configuración global de la plataforma. Un valor ausente o con un tipo inesperado se
 * trata como «apagado» / «sin límite» / «sin dato»: nunca abre el alta por error.
 */
export async function loadPlatformConfig(sql: Sql): Promise<PlatformConfig> {
  const rows = await sql<{ clave: string; valor: unknown }[]>`
    SELECT clave, valor FROM public.plataforma_config
  `;
  const values = new Map(rows.map((row) => [row.clave, row.valor]));
  const contact = values.get(PLATFORM_CONFIG_KEY.ContactEmail);
  return {
    signupActive: values.get(PLATFORM_CONFIG_KEY.SignupActive) === true,
    requiresApproval: values.get(PLATFORM_CONFIG_KEY.RequiresApproval) === true,
    trialDays: positiveInt(values.get(PLATFORM_CONFIG_KEY.TrialDays)),
    trialMaxOrders: positiveInt(values.get(PLATFORM_CONFIG_KEY.TrialMaxOrders)),
    contactEmail: typeof contact === "string" && contact.trim() !== "" ? contact.trim() : null,
  };
}

/**
 * ¿Acepta pedidos el restaurante? Una sola regla, en `fn_restaurante_acepta_pedidos` (0023), para
 * que la API y n8n coincidan. `now` permite probar el vencimiento con un reloj fijo.
 */
export async function restaurantAcceptsOrders(
  sql: Sql,
  restauranteId: number,
  now: Date,
): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }[]>`
    SELECT public.fn_restaurante_acepta_pedidos(${restauranteId}::integer, ${now}::timestamptz) AS ok
  `;
  return row?.ok !== false;
}

export type TrialInfo = {
  readonly restauranteId: number;
  readonly userId: string;
  readonly email: string | null;
  readonly estado: TrialState;
  readonly inicio: Date;
  readonly fin: Date | null;
  readonly maxPedidos: number | null;
  readonly pedidosUsados: number;
  readonly diasRestantes: number | null;
  readonly pedidosRestantes: number | null;
  readonly aceptaPedidos: boolean;
};

type TrialRow = {
  restaurante_id: number;
  user_id: string;
  email: string | null;
  estado: string;
  inicio: Date;
  fin: Date | null;
  max_pedidos: number | null;
  pedidos_usados: number;
  acepta: boolean;
};

function toTrial(row: TrialRow, now: Date): TrialInfo | null {
  if (!isTrialState(row.estado)) return null;
  return {
    restauranteId: row.restaurante_id,
    userId: row.user_id,
    email: row.email,
    estado: row.estado,
    inicio: row.inicio,
    fin: row.fin,
    maxPedidos: row.max_pedidos,
    pedidosUsados: row.pedidos_usados,
    diasRestantes: trialDaysLeft(row.fin, now),
    pedidosRestantes: trialOrdersLeft(row.max_pedidos, row.pedidos_usados),
    aceptaPedidos: row.acepta,
  };
}

/** Carritos, carritos caducados y cancelados no cuentan como pedidos de la prueba. */
const NOT_REAL_ORDER = [ORDER_STATUS.InCart, ORDER_STATUS.Expired, ORDER_STATUS.Cancelled];

/** Pruebas (todas, o la de un restaurante) con su consumo y si ahora aceptan pedidos. */
export async function loadTrials(
  sql: Sql,
  now: Date,
  restauranteId?: number,
): Promise<(TrialInfo & { nombre: string; slug: string | null; plan: string | null })[]> {
  const rows = await sql<
    (TrialRow & { nombre: string; slug: string | null; plan: string | null })[]
  >`
    SELECT p.restaurante_id, p.user_id, p.email, p.estado, p.inicio, p.fin, p.max_pedidos,
           r.nombre, r.slug, rp.plan_code AS plan,
           (SELECT count(*) FROM public.pedidos o
            WHERE  o.restaurante_id = p.restaurante_id
              AND  o.estado NOT IN ${sql(NOT_REAL_ORDER)})::int AS pedidos_usados,
           public.fn_restaurante_acepta_pedidos(p.restaurante_id, ${now}::timestamptz) AS acepta
    FROM   public.restaurante_prueba p
    JOIN   public.restaurante r ON r.id = p.restaurante_id
    LEFT   JOIN public.restaurante_plan rp ON rp.restaurante_id = p.restaurante_id
    WHERE  ${restauranteId ?? null}::integer IS NULL OR p.restaurante_id = ${restauranteId ?? null}
    ORDER  BY (p.estado = ${TRIAL_STATE.Pending}) DESC, p.inicio DESC, p.restaurante_id DESC
  `;
  return rows.flatMap((row) => {
    const trial = toTrial(row, now);
    return trial ? [{ ...trial, nombre: row.nombre, slug: row.slug, plan: row.plan }] : [];
  });
}

/** La prueba de un restaurante, o null si no la tiene (restaurantes de siempre). */
export async function loadTrial(
  sql: Sql,
  restauranteId: number,
  now: Date,
): Promise<TrialInfo | null> {
  const [trial] = await loadTrials(sql, now, restauranteId);
  return trial ?? null;
}
