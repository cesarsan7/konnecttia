import { MODULE_KIND, ROLE_TEMPLATE } from "@konnecttia/access";
import {
  DEFERRED_PAYMENT_METHODS,
  type ImportedCategory,
  PAYMENT_METHODS,
} from "@konnecttia/domain";
import type { TransactionSql } from "postgres";
import type { Sql } from "../lib/db";

type Tx = TransactionSql<{ bigint: number }>;

/** `restaurante_modulo.estado`. */
export const MODULE_STATE = {
  Active: "activo",
  Suspended: "suspendido",
  Cancelled: "cancelado",
} as const;
export type ModuleState = (typeof MODULE_STATE)[keyof typeof MODULE_STATE];

/** `restaurante_modulo.origen`. */
export const MODULE_ORIGIN = {
  Plan: "plan",
  Addon: "complemento",
  Courtesy: "cortesia",
} as const;
export type ModuleOrigin = (typeof MODULE_ORIGIN)[keyof typeof MODULE_ORIGIN];

/** Origen que Konnecttia puede dar a mano (el de plan lo pone la asignación del plan). */
export const MANUAL_ORIGINS = [MODULE_ORIGIN.Addon, MODULE_ORIGIN.Courtesy] as const;

/** El slug ya lo usa otro restaurante (se comprueba dentro de la transacción de alta). */
export class SlugTaken extends Error {}

/**
 * Métodos de cobro de un restaurante recién creado: solo los que no necesitan datos
 * (transferencia y Bizum piden IBAN o teléfono); el dueño añade los demás en Ajustes.
 */
export const INITIAL_PAYMENT_METHODS: readonly string[] = PAYMENT_METHODS.filter(
  (method) => !DEFERRED_PAYMENT_METHODS.has(method),
);

export type NewRestaurant = {
  readonly nombre: string;
  readonly slug: string;
  readonly zonaHoraria: string;
  readonly plan: string;
  readonly local: {
    readonly nombre: string;
    readonly direccion?: string | undefined;
    readonly telefono?: string | undefined;
  };
  /** Si el restaurante ofrece recogida / reparto. Sin indicar: el valor por defecto de la tabla. */
  readonly recogida?: boolean | undefined;
  readonly reparto?: boolean | undefined;
  /** Ubicación del local principal (el trigger de 0003 la copia al restaurante). */
  readonly ubicacion?: { readonly lat: number; readonly lng: number } | undefined;
  /** Horario general: un turno por día. Sin indicar, no se crean filas (el local queda sin horario). */
  readonly horario?: readonly NewScheduleDay[] | undefined;
  /** Minutos hasta que un pedido para recoger está listo (`pickup_eta_minutes`). */
  readonly recogidaMinutos?: number | undefined;
  /** Zona de reparto circular desde el local principal. */
  readonly zonaReparto?: NewDeliveryZone | undefined;
  /** Métodos de cobro iniciales. Sin indicar: `INITIAL_PAYMENT_METHODS`. */
  readonly metodosPago?: readonly string[] | undefined;
};

export type NewScheduleDay = {
  readonly dia: string;
  readonly disponible: boolean;
  readonly apertura: string | null;
  readonly cierre: string | null;
};

export type NewDeliveryZone = {
  readonly nombre: string;
  readonly radioKm: number;
  readonly tarifa: number;
  readonly minimo: number;
  readonly minutos: number;
};

/**
 * Alta de un restaurante (compartida por el panel interno y el alta autoservicio): restaurante
 * (solo lo pedido; el resto con el valor por defecto de la tabla), su local principal (lo crea el
 * trigger de 0003 con los datos del restaurante y aquí se le pone nombre), plan y copia de los
 * módulos del plan con origen `plan`. Lanza `SlugTaken` si el slug ya existe. Debe ejecutarse
 * dentro de una transacción.
 */
export async function createRestaurant(
  tx: Tx,
  input: NewRestaurant,
  now: Date,
): Promise<{ id: number; branchId: number; modules: string[] }> {
  const taken = await tx`SELECT 1 FROM public.restaurante WHERE slug = ${input.slug}`;
  if (taken.length > 0) throw new SlugTaken();
  const [restaurant] = await tx<{ id: number }[]>`
    INSERT INTO public.restaurante
      (nombre, slug, zona_horaria, direccion, telefono, lat, long, payment_methods,
       pickup_enabled, delivery_enabled)
    VALUES (${input.nombre}, ${input.slug}, ${input.zonaHoraria},
            ${input.local.direccion || null}, ${input.local.telefono || null},
            ${input.ubicacion?.lat ?? null}, ${input.ubicacion?.lng ?? null},
            ${tx.json([...(input.metodosPago ?? INITIAL_PAYMENT_METHODS)])},
            COALESCE(${input.recogida ?? null}::boolean, true),
            COALESCE(${input.reparto ?? null}::boolean, true))
    RETURNING id
  `;
  if (!restaurant) throw new Error("No se pudo crear el restaurante");
  const [branch] = await tx<{ id: number }[]>`
    UPDATE public.sucursal
    SET    nombre = ${input.local.nombre},
           acepta_recogida = COALESCE(${input.recogida ?? null}::boolean, acepta_recogida),
           acepta_reparto = COALESCE(${input.reparto ?? null}::boolean, acepta_reparto)
    WHERE  restaurante_id = ${restaurant.id} AND es_principal
    RETURNING id
  `;
  if (!branch) throw new Error("No se creó el local principal");
  for (const day of input.horario ?? []) {
    await tx`
      INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
      VALUES (${restaurant.id}, ${day.dia}, ${day.disponible},
              ${day.disponible ? day.apertura : null}::time, ${day.disponible ? day.cierre : null}::time)
    `;
  }
  if (input.recogidaMinutos !== undefined) {
    await tx`
      INSERT INTO public.restaurante_config (config_key, config_value, description, restaurante_id)
      VALUES ('pickup_eta_minutes', ${String(input.recogidaMinutos)},
              'Minutos hasta que un pedido para recoger está listo', ${restaurant.id})
    `;
  }
  if (input.zonaReparto) {
    const zone = input.zonaReparto;
    await tx`
      INSERT INTO public.delivery_zone
        (zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max,
         restaurante_id, sucursal_id, lat_center, lng_center, radius_km, tipo_tarifa, is_active)
      SELECT ${zone.nombre}, ${zone.tarifa}, ${zone.minimo}, ${zone.minutos}, ${zone.minutos},
             s.restaurante_id, s.id, s.lat, s.lng, ${zone.radioKm}, 'fija', true
      FROM   public.sucursal s WHERE s.id = ${branch.id}
    `;
  }
  await applyPlan(tx, restaurant.id, input.plan, now);
  const modules = await tx<{ modulo_code: string }[]>`
    SELECT modulo_code FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restaurant.id} ORDER BY modulo_code
  `;
  return { id: restaurant.id, branchId: branch.id, modules: modules.map((row) => row.modulo_code) };
}

/** Rol de la columna antigua `local_memberships.rol` (la lee el dashboard antiguo). */
export function legacyRoleOf(templateCode: string | null): "owner" | "manager" | "viewer" {
  if (templateCode === ROLE_TEMPLATE.Owner) return "owner";
  if (templateCode === ROLE_TEMPLATE.Manager) return "manager";
  return "viewer";
}

/**
 * Hace propietario de un restaurante a un usuario sin pasar por una invitación: membresía con la
 * plantilla de rol Propietario y acceso a todos los locales (igual que al aceptar una invitación).
 */
export async function addOwner(
  tx: Tx,
  input: {
    readonly restauranteId: number;
    readonly userId: string;
    readonly email: string | null;
    readonly nombre: string | null;
    readonly apodo: string | null;
  },
): Promise<number> {
  const [role] = await tx<{ id: number }[]>`
    SELECT id FROM public.rol WHERE code = ${ROLE_TEMPLATE.Owner} AND restaurante_id IS NULL
  `;
  if (!role) throw new Error("Falta la plantilla de rol Propietario");
  const [membership] = await tx<{ id: number }[]>`
    INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre, apodo)
    VALUES (${input.userId}::uuid, ${input.restauranteId}, ${legacyRoleOf(ROLE_TEMPLATE.Owner)},
            ${input.email}, ${input.nombre}, ${input.apodo})
    RETURNING id
  `;
  if (!membership) throw new Error("No se pudo crear la membresía");
  await tx`INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${membership.id}, ${role.id})`;
  return membership.id;
}

/** ¿Existe esa zona horaria en PostgreSQL? (la validación de formato va en el dominio). */
export async function knownTimeZone(sql: Sql | Tx, name: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM pg_timezone_names WHERE name = ${name}`;
  return rows.length > 0;
}

export async function planExists(sql: Sql | Tx, planCode: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM public.plan WHERE code = ${planCode}`;
  return rows.length > 0;
}

/**
 * Asigna un plan a un restaurante y sincroniza sus módulos:
 * - Los de origen `plan` que el plan nuevo ya no incluye se quitan.
 * - Los que el plan nuevo incluye y faltan se añaden con origen `plan`.
 * - Los de origen `complemento` o `cortesia` no se tocan, ni tampoco el estado (suspendido,
 *   cancelado) de los que ya existen.
 */
export async function applyPlan(
  tx: Tx,
  restauranteId: number,
  planCode: string,
  now: Date,
): Promise<{ added: string[]; removed: string[] }> {
  await tx`
    INSERT INTO public.restaurante_plan (restaurante_id, plan_code, desde)
    VALUES (${restauranteId}, ${planCode}, ${now})
    ON CONFLICT (restaurante_id)
    DO UPDATE SET plan_code = EXCLUDED.plan_code, desde = EXCLUDED.desde
  `;
  const removed = await tx<{ modulo_code: string }[]>`
    DELETE FROM public.restaurante_modulo rm
    WHERE  rm.restaurante_id = ${restauranteId} AND rm.origen = ${MODULE_ORIGIN.Plan}
      AND  rm.modulo_code NOT IN (SELECT modulo_code FROM public.plan_modulo WHERE plan_code = ${planCode})
    RETURNING rm.modulo_code
  `;
  const added = await tx<{ modulo_code: string }[]>`
    INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen, activado_at, updated_at)
    SELECT ${restauranteId}::int4, pm.modulo_code, ${MODULE_ORIGIN.Plan}::text,
           ${now}::timestamptz, ${now}::timestamptz
    FROM   public.plan_modulo pm
    WHERE  pm.plan_code = ${planCode}
    ON CONFLICT (restaurante_id, modulo_code) DO NOTHING
    RETURNING modulo_code
  `;
  return {
    added: added.map((row) => row.modulo_code).sort(),
    removed: removed.map((row) => row.modulo_code).sort(),
  };
}

export type ModuleChange =
  | { readonly estado: typeof MODULE_STATE.Active; readonly origen?: ModuleOrigin | undefined }
  | { readonly estado: typeof MODULE_STATE.Suspended | typeof MODULE_STATE.Cancelled };

export type ModuleChangeResult =
  | { readonly ok: true; readonly estado: ModuleState; readonly origen: ModuleOrigin }
  | {
      readonly ok: false;
      readonly status: 404 | 409 | 422;
      readonly reason:
        | "module_not_found"
        | "module_not_manageable"
        | "module_not_active"
        | "module_in_plan"
        | "origin_required"
        | "dependency_missing"
        | "has_dependents";
      readonly modules?: string[];
    };

/**
 * Activa, suspende o cancela un módulo de un restaurante respetando `modulo.depende_de`:
 * - Solo se gestionan módulos de plan o complemento (los básicos siempre están; los futuros no).
 * - Activar exige que sus dependencias estén activas (los básicos cuentan siempre como activos).
 * - Suspender o cancelar se rechaza mientras otro módulo activo dependa de él.
 */
export async function changeModule(
  tx: Tx,
  restauranteId: number,
  code: string,
  change: ModuleChange,
  now: Date,
): Promise<ModuleChangeResult> {
  const [definition] = await tx<{ tipo: string; depende_de: string[] }[]>`
    SELECT tipo, depende_de FROM public.modulo WHERE code = ${code}
  `;
  if (!definition) return { ok: false, status: 404, reason: "module_not_found" };
  if (definition.tipo === MODULE_KIND.Core || definition.tipo === MODULE_KIND.Future) {
    return { ok: false, status: 422, reason: "module_not_manageable" };
  }

  const [current] = await tx<{ estado: ModuleState; origen: ModuleOrigin }[]>`
    SELECT estado, origen FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restauranteId} AND modulo_code = ${code}
    FOR UPDATE
  `;

  if (change.estado === MODULE_STATE.Active) {
    if (
      current?.origen === MODULE_ORIGIN.Plan &&
      change.origen &&
      change.origen !== current.origen
    ) {
      return { ok: false, status: 422, reason: "module_in_plan" };
    }
    const origin = current ? (change.origen ?? current.origen) : change.origen;
    if (!origin) return { ok: false, status: 422, reason: "origin_required" };

    const missing = await tx<{ code: string }[]>`
      SELECT d.code
      FROM   unnest(${definition.depende_de}::text[]) AS d(code)
      JOIN   public.modulo m ON m.code = d.code
      WHERE  m.tipo <> ${MODULE_KIND.Core}
        AND  NOT EXISTS (
               SELECT 1 FROM public.restaurante_modulo rm
               WHERE  rm.restaurante_id = ${restauranteId} AND rm.modulo_code = d.code
                 AND  rm.estado = ${MODULE_STATE.Active})
      ORDER  BY d.code
    `;
    if (missing.length > 0) {
      return {
        ok: false,
        status: 422,
        reason: "dependency_missing",
        modules: missing.map((row) => row.code),
      };
    }
    await tx`
      INSERT INTO public.restaurante_modulo
        (restaurante_id, modulo_code, estado, origen, activado_at, updated_at)
      VALUES (${restauranteId}, ${code}, ${MODULE_STATE.Active}, ${origin}, ${now}, ${now})
      ON CONFLICT (restaurante_id, modulo_code)
      DO UPDATE SET estado = EXCLUDED.estado, origen = EXCLUDED.origen,
                    activado_at = CASE WHEN public.restaurante_modulo.estado = ${MODULE_STATE.Active}
                                       THEN public.restaurante_modulo.activado_at
                                       ELSE EXCLUDED.activado_at END,
                    updated_at = EXCLUDED.updated_at
    `;
    return { ok: true, estado: MODULE_STATE.Active, origen: origin };
  }

  if (!current) return { ok: false, status: 404, reason: "module_not_active" };
  const dependents = await tx<{ modulo_code: string }[]>`
    SELECT rm.modulo_code
    FROM   public.restaurante_modulo rm
    JOIN   public.modulo m ON m.code = rm.modulo_code
    WHERE  rm.restaurante_id = ${restauranteId} AND rm.estado = ${MODULE_STATE.Active}
      AND  ${code} = ANY (m.depende_de)
    ORDER  BY rm.modulo_code
  `;
  if (dependents.length > 0) {
    return {
      ok: false,
      status: 409,
      reason: "has_dependents",
      modules: dependents.map((row) => row.modulo_code),
    };
  }
  await tx`
    UPDATE public.restaurante_modulo SET estado = ${change.estado}, updated_at = ${now}
    WHERE  restaurante_id = ${restauranteId} AND modulo_code = ${code}
  `;
  return { ok: true, estado: change.estado, origen: current.origen };
}

export class MenuAlreadyLoaded extends Error {}

/**
 * Carga una carta ya validada (`parseMenuImport`) en un restaurante que todavía no tiene
 * categorías. Falla con `MenuAlreadyLoaded` si ya hay carta: la importación nunca pisa datos.
 * Debe ejecutarse dentro de una transacción.
 */
export async function importMenu(
  tx: Tx,
  restauranteId: number,
  categories: readonly ImportedCategory[],
): Promise<{ categorias: number; productos: number; precios: number }> {
  await tx`SELECT id FROM public.restaurante WHERE id = ${restauranteId} FOR UPDATE`;
  const existing = await tx`
    SELECT 1 FROM public.menu_category WHERE restaurante_id = ${restauranteId} LIMIT 1
  `;
  if (existing.length > 0) throw new MenuAlreadyLoaded();
  let products = 0;
  let prices = 0;
  for (const [categoryIndex, category] of categories.entries()) {
    const [row] = await tx<{ id: number }[]>`
      INSERT INTO public.menu_category (name, sort_order, restaurante_id)
      VALUES (${category.nombre}, ${categoryIndex + 1}, ${restauranteId})
      RETURNING menu_category_id AS id
    `;
    if (!row) throw new Error("No se pudo crear la categoría");
    for (const [itemIndex, item] of category.productos.entries()) {
      const lowest = Math.min(...item.variantes.map((variant) => variant.precio));
      const [created] = await tx<{ id: number }[]>`
        INSERT INTO public.menu_item
          (menu_category_id, name, description, restaurante_id, base_price, sort_order)
        VALUES (${row.id}, ${item.nombre}, ${item.descripcion}, ${restauranteId},
                ${(lowest / 100).toFixed(2)}, ${itemIndex + 1})
        RETURNING menu_item_id AS id
      `;
      if (!created) throw new Error("No se pudo crear el producto");
      products += 1;
      for (const [variantIndex, variant] of item.variantes.entries()) {
        await tx`
          INSERT INTO public.menu_variant
            (menu_item_id, variant_name, price, is_default, restaurante_id, sort_order)
          VALUES (${created.id}, ${variant.nombre}, ${(variant.precio / 100).toFixed(2)},
                  ${variant.porDefecto}, ${restauranteId}, ${variantIndex + 1})
        `;
        prices += 1;
      }
    }
  }
  return { categorias: categories.length, productos: products, precios: prices };
}
