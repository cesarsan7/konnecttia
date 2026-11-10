import {
  ALL_PERMISSIONS,
  MODULE_KIND,
  MODULES,
  type ModuleCode,
  PERMISSION_LABEL,
  PERMISSION_MODULE,
  ROLE_TEMPLATE,
  resolveActiveModules,
} from "@konnecttia/access";
import {
  COUNTRIES,
  checkRestaurantSlug,
  countryOrDefault,
  isValidTimeZone,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_METHODS,
  PLATFORM_ROLE,
  parseMenuImport,
  WEEKDAYS_ES,
} from "@konnecttia/domain";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { INVITE_DAYS, inviteLink, panelBase, sendInviteEmail } from "../lib/invite-link";
import { displayName } from "../lib/member-name";
import { requirePlatform } from "../middleware/platform";
import { audit } from "../repositories/access";
import {
  applyPlan,
  changeModule,
  createRestaurant,
  importMenu,
  knownTimeZone,
  MANUAL_ORIGINS,
  MenuAlreadyLoaded,
  MODULE_STATE,
  planExists,
  readCodeSettings,
  SlugTaken,
  saveCodeSettings,
} from "../repositories/platform";
import { isOrphan } from "../repositories/platform-team";
import {
  cloneRestaurantData,
  deleteRestaurant,
  removeRestaurantFiles,
  restaurantExists,
} from "../repositories/restaurant-lifecycle";
import {
  insertRole,
  replaceRole,
  roleNameTaken,
  roleSchema,
  roleUsage,
} from "../repositories/roles";
import { TRIAL_PLAN } from "../repositories/trial";
import { legacyRole, rolesOf } from "./panel-team";
import { registerPlatformTeamRoutes } from "./plataforma-equipo";
import { registerPlatformTemplateRoutes } from "./plataforma-plantillas";
import { registerPlatformTrialRoutes } from "./plataforma-pruebas";

/**
 * Panel interno de Konnecttia (ADR 0009, pieza 8 y K). Toda ruta exige pertenecer al equipo de
 * Konnecttia (`plataforma_miembro`): «soporte» lee y «admin» además escribe. Toda escritura queda
 * en la auditoría con actor «plataforma» y el restaurante afectado. No da acceso al panel de un
 * restaurante: para eso hay que ser miembro suyo.
 */

type Ctx = Context<AppEnv>;

/** Ventana de actividad que muestra la lista de restaurantes. */
const ACTIVITY_DAYS = 30;
/** Máximo de restaurantes que devuelve la lista. */
const LIST_LIMIT = 500;
/** Pedidos que no cuentan como actividad: carritos, carritos caducados y cancelados. */
const NOT_ACTIVITY = [ORDER_STATUS.InCart, ORDER_STATUS.Expired, ORDER_STATUS.Cancelled];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Un turno por día. Con `disponible` hacen falta apertura y cierre; un cierre menor cruza medianoche. */
const scheduleDaySchema = z
  .object({
    dia: z.enum(WEEKDAYS_ES),
    disponible: z.boolean(),
    apertura: z.string().regex(TIME).nullable().optional(),
    cierre: z.string().regex(TIME).nullable().optional(),
  })
  .refine((day) => !day.disponible || (Boolean(day.apertura) && Boolean(day.cierre)), {
    path: ["apertura"],
  });

const deliveryZoneSchema = z.object({
  radio_km: z.number().min(0.1).max(100),
  tarifa: z.number().min(0).max(100),
  minimo: z.number().min(0).max(1000),
  minutos: z.number().int().min(1).max(240),
});

/** Canales del código de verificación que ofrece el panel interno (el SMS está descartado). */
const CODE_CHANNEL = { WhatsApp: "whatsapp", Off: "apagado" } as const;

const createSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120),
    slug: z.string().trim().max(100),
    zona_horaria: z.string().trim().min(1).max(64),
    pais: z.enum(COUNTRIES.map((country) => country.code) as [string, ...string[]]).optional(),
    plan: z.string().trim().min(1).max(40),
    local: z.object({
      nombre: z.string().trim().min(1).max(120),
      direccion: z.string().trim().max(200).optional(),
      telefono: z.string().trim().max(30).optional(),
    }),
    propietario_email: z.string().trim().toLowerCase().email().max(255),
    // Alta completa (todo opcional): ubicación, servicios, horario, reparto y cobro iniciales.
    ubicacion: z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .optional(),
    recogida: z.boolean().optional(),
    reparto: z.boolean().optional(),
    horario: z.array(scheduleDaySchema).min(1).max(WEEKDAYS_ES.length).optional(),
    recogida_minutos: z.number().int().min(1).max(240).optional(),
    zona_reparto: deliveryZoneSchema.optional(),
    // Transferencia y Bizum piden IBAN o teléfono: los configura el propietario en Ajustes.
    metodos_pago: z
      .array(z.enum([PAYMENT_METHOD.Cash, PAYMENT_METHOD.Card]))
      .min(1)
      .max(2)
      .refine((list) => new Set(list).size === list.length)
      .optional(),
    /** Código de verificación del checkout web (capa 3, ADR 0011). Sin indicar: apagado. */
    codigo_verificacion: z.enum([CODE_CHANNEL.WhatsApp, CODE_CHANNEL.Off]).optional(),
    /** Crear «a partir de» otro restaurante: qué se copia (ver `cloneRestaurantData`). */
    clonar_de: z
      .object({
        restaurante_id: z.number().int().positive(),
        carta: z.boolean(),
        horario: z.boolean(),
        reparto: z.boolean(),
        ajustes: z.boolean(),
      })
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.horario &&
      new Set(input.horario.map((day) => day.dia)).size !== input.horario.length
    ) {
      ctx.addIssue({ code: "custom", path: ["horario"], message: "día repetido" });
    }
    if (input.zona_reparto && !input.ubicacion) {
      ctx.addIssue({ code: "custom", path: ["ubicacion"], message: "la zona necesita ubicación" });
    }
    if (input.zona_reparto && input.reparto === false) {
      ctx.addIssue({ code: "custom", path: ["zona_reparto"], message: "sin reparto" });
    }
  });

const codeSettingsSchema = z.object({
  canal: z.enum([CODE_CHANNEL.WhatsApp, CODE_CHANNEL.Off]),
  /** Importe desde el que se pide código. null = valor por defecto (30 €); ausente = no cambia. */
  umbral_eur: z.number().min(0).max(100_000).nullable().optional(),
  /** Gasto máximo mensual en códigos. null = valor por defecto (10 €); ausente = no cambia. */
  tope_mensual_eur: z.number().min(0).max(1_000).nullable().optional(),
});

const importMenuSchema = z.object({ texto: z.string().max(300_000) });

const planSchema = z.object({ plan: z.string().trim().min(1).max(40) });

const moduleSchema = z.union([
  z.object({
    estado: z.literal(MODULE_STATE.Active),
    origen: z.enum(MANUAL_ORIGINS).optional(),
  }),
  z.object({ estado: z.enum([MODULE_STATE.Suspended, MODULE_STATE.Cancelled]) }),
]);

const paymentSchema = z.object({
  metodos: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1)
    .max(PAYMENT_METHODS.length)
    .refine((list) => new Set(list).size === list.length)
    .nullable(),
});

async function body<T extends z.ZodType>(c: Ctx, schema: T) {
  return schema.safeParse(await c.req.json().catch(() => null));
}

const invalid = (c: Ctx, field?: string) =>
  fail(c, 400, API_ERROR.InvalidBody, field ? { field } : {});

const unprocessable = (c: Ctx, reason: string, extra: Record<string, unknown> = {}) =>
  fail(c, 422, API_ERROR.Unprocessable, { reason, ...extra });

export function plataformaRoutes(deps: AppDeps) {
  const { sql } = deps;
  const app = new Hono<AppEnv>();
  const reader = requirePlatform(deps, PLATFORM_ROLE.Support);
  const writer = requirePlatform(deps, PLATFORM_ROLE.Admin);

  const record = (
    c: Ctx,
    restauranteId: number,
    accion: string,
    recursoTipo: string,
    recursoId: string | number | null,
    detalle: Record<string, unknown> = {},
  ) =>
    audit(sql, {
      restauranteId,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado: "ok",
      detalle,
      requestId: c.get("requestId"),
    });

  /** Id numérico de la URL de un restaurante que existe, o null. */
  const restaurantFromUrl = async (c: Ctx) => {
    const id = Number(c.req.param("id"));
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    const [row] = await sql<{ id: number; nombre: string; slug: string | null }[]>`
      SELECT id, nombre, slug FROM public.restaurante WHERE id = ${id}
    `;
    return row ?? null;
  };

  // ------------------------------------------------------------------------------------ yo

  app.get("/yo", reader, (c) => {
    const { email, rol } = c.get("platform");
    return c.json({ email, rol });
  });

  // ---------------------------------------------------------------------------- restaurantes

  app.get("/restaurantes", reader, async (c) => {
    const q = (c.req.query("q") ?? "").trim().toLowerCase().slice(0, 100);
    const rows = await sql<
      {
        id: number;
        nombre: string;
        slug: string | null;
        plan: string | null;
        creado: string | null;
        locales: number;
        miembros: number;
        pedidos_30d: number;
        ultimo_pedido: string | null;
      }[]
    >`
      SELECT r.id, r.nombre, r.slug, rp.plan_code AS plan,
             r.created_at AT TIME ZONE 'UTC' AS creado,
             (SELECT count(*) FROM public.sucursal s WHERE s.restaurante_id = r.id)::int AS locales,
             (SELECT count(*) FROM public.local_memberships m WHERE m.restaurante_id = r.id)::int AS miembros,
             (SELECT count(*) FROM public.pedidos p
              WHERE  p.restaurante_id = r.id AND p.estado NOT IN ${sql(NOT_ACTIVITY)}
                AND  p.created_at >= (${deps.now()}::timestamptz AT TIME ZONE 'UTC')
                                     - make_interval(days => ${ACTIVITY_DAYS}))::int AS pedidos_30d,
             (SELECT max(p.created_at) AT TIME ZONE 'UTC' FROM public.pedidos p
              WHERE  p.restaurante_id = r.id AND p.estado NOT IN ${sql(NOT_ACTIVITY)}) AS ultimo_pedido
      FROM   public.restaurante r
      LEFT   JOIN public.restaurante_plan rp ON rp.restaurante_id = r.id
      WHERE  ${q} = '' OR position(${q} in lower(r.nombre)) > 0
                       OR position(${q} in lower(COALESCE(r.slug, ''))) > 0
      ORDER  BY lower(r.nombre), r.id
      LIMIT  ${LIST_LIMIT}
    `;
    const planes = await sql<{ code: string; nombre: string }[]>`
      SELECT code, nombre FROM public.plan WHERE code <> ${TRIAL_PLAN} ORDER BY code
    `;
    return c.json({ restaurantes: rows, planes });
  });

  app.get("/restaurantes/:id", reader, async (c) => {
    const found = await restaurantFromUrl(c);
    if (!found) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const id = found.id;
    const [restaurants, plans, plan, modules, branches, members, invites] = await Promise.all([
      sql<
        {
          id: number;
          nombre: string;
          slug: string | null;
          zona_horaria: string | null;
          pais_code: string | null;
          direccion: string | null;
          telefono: string | null;
          creado: string | null;
          payment_methods: unknown;
          metodos_pago_permitidos: unknown;
        }[]
      >`
        SELECT id, nombre, slug, zona_horaria, pais_code, direccion, telefono,
               created_at AT TIME ZONE 'UTC' AS creado, payment_methods, metodos_pago_permitidos
        FROM   public.restaurante WHERE id = ${id}
      `,
      sql<{ code: string; nombre: string }[]>`
        SELECT code, nombre FROM public.plan WHERE code <> ${TRIAL_PLAN} ORDER BY code
      `,
      sql<{ plan_code: string; nombre: string; desde: string }[]>`
        SELECT rp.plan_code, p.nombre, rp.desde
        FROM   public.restaurante_plan rp JOIN public.plan p ON p.code = rp.plan_code
        WHERE  rp.restaurante_id = ${id}
      `,
      sql<
        {
          code: string;
          nombre: string;
          tipo: string;
          depende_de: string[];
          estado: string | null;
          origen: string | null;
          en_plan: boolean;
        }[]
      >`
        SELECT m.code, m.nombre, m.tipo, m.depende_de, rm.estado, rm.origen,
               EXISTS (SELECT 1 FROM public.plan_modulo pm
                       JOIN   public.restaurante_plan rp ON rp.plan_code = pm.plan_code
                       WHERE  rp.restaurante_id = ${id} AND pm.modulo_code = m.code) AS en_plan
        FROM   public.modulo m
        LEFT   JOIN public.restaurante_modulo rm
               ON rm.modulo_code = m.code AND rm.restaurante_id = ${id}
        ORDER  BY m.created_at, m.code
      `,
      sql<
        {
          id: number;
          nombre: string;
          slug: string;
          direccion: string | null;
          telefono: string | null;
          principal: boolean;
          activo: boolean;
        }[]
      >`
        SELECT id, nombre, slug, direccion, telefono, es_principal AS principal, activo
        FROM   public.sucursal WHERE restaurante_id = ${id}
        ORDER  BY es_principal DESC, nombre
      `,
      sql<
        {
          id: number;
          email: string | null;
          nombre: string | null;
          apodo: string | null;
          created_at: string;
          roles: { id: number; code: string; nombre: string }[];
        }[]
      >`
        SELECT m.id, m.email, m.nombre, m.apodo, m.created_at,
               COALESCE((SELECT json_agg(json_build_object('id', r.id, 'code', r.code, 'nombre', r.nombre) ORDER BY r.id)
                         FROM public.membresia_rol mr JOIN public.rol r ON r.id = mr.rol_id
                         WHERE mr.membership_id = m.id), '[]') AS roles
        FROM   public.local_memberships m
        WHERE  m.restaurante_id = ${id}
        ORDER  BY m.created_at, m.id
      `,
      sql<{ id: number; email: string | null; rol: string | null; expires_at: string }[]>`
        SELECT i.id, i.email, rl.nombre AS rol, i.expires_at AT TIME ZONE 'UTC' AS expires_at
        FROM   public.restaurant_invites i
        LEFT   JOIN public.rol rl ON rl.id = i.rol_id
        WHERE  i.restaurante_id = ${id} AND i.used_at IS NULL AND i.revocada_at IS NULL
          AND  i.rol_id IS NOT NULL
          AND  i.expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')
        ORDER  BY i.id DESC
      `,
    ]);
    const restaurant = restaurants[0];
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const [menu] = await sql<{ categorias: number; productos: number }[]>`
      SELECT (SELECT count(*)::int FROM public.menu_category WHERE restaurante_id = ${id}) AS categorias,
             (SELECT count(*)::int FROM public.menu_item WHERE restaurante_id = ${id}) AS productos
    `;
    const active = Array.isArray(restaurant.payment_methods)
      ? restaurant.payment_methods.filter((m): m is string => typeof m === "string")
      : [];
    const allowed = Array.isArray(restaurant.metodos_pago_permitidos)
      ? restaurant.metodos_pago_permitidos.filter((m): m is string => typeof m === "string")
      : null;
    const [orderCount] = await sql<{ total: number }[]>`
      SELECT count(*)::int AS total FROM public.pedidos WHERE restaurante_id = ${id}
    `;
    return c.json({
      restaurante: {
        id: restaurant.id,
        nombre: restaurant.nombre,
        slug: restaurant.slug,
        zona_horaria: restaurant.zona_horaria,
        pais: countryOrDefault(restaurant.pais_code).code,
        direccion: restaurant.direccion,
        telefono: restaurant.telefono,
        creado: restaurant.creado,
      },
      plan: plan[0]
        ? { code: plan[0].plan_code, nombre: plan[0].nombre, desde: plan[0].desde }
        : null,
      planes: plans,
      modulos: modules.map((module) => ({
        ...module,
        // Los básicos siempre están; los futuros aún no se pueden activar.
        gestionable: module.tipo !== MODULE_KIND.Core && module.tipo !== MODULE_KIND.Future,
      })),
      metodos_pago: {
        catalogo: PAYMENT_METHODS,
        /** null = todos los que existan. */
        permitidos: allowed,
        activos: active,
      },
      carta: { categorias: menu?.categorias ?? 0, productos: menu?.productos ?? 0 },
      antifraude_codigo: {
        ...(await readCodeSettings(sql, id)),
        // Sin proveedor y secreto en la API, el código no se envía aunque el canal esté activo.
        api_configurada: Boolean(deps.sendCode && deps.codeSecret),
      },
      locales: branches,
      equipo: members.map(({ apodo, ...member }) => ({
        ...member,
        apodo,
        mostrar: displayName(apodo, member.nombre),
      })),
      pedidos_total: orderCount?.total ?? 0,
      invitaciones_pendientes: invites,
    });
  });

  app.post("/restaurantes", writer, async (c) => {
    const parsed = await body(c, createSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const input = parsed.data;
    const slugProblem = checkRestaurantSlug(input.slug);
    if (slugProblem) return unprocessable(c, slugProblem, { field: "slug" });
    if (!isValidTimeZone(input.zona_horaria)) {
      return unprocessable(c, "invalid_time_zone", { field: "zona_horaria" });
    }
    if (!(await knownTimeZone(sql, input.zona_horaria)))
      return unprocessable(c, "invalid_time_zone", { field: "zona_horaria" });
    // «prueba» solo la da el alta autoservicio, que crea sus límites; se sale de ella al convertir.
    if (input.plan === TRIAL_PLAN || !(await planExists(sql, input.plan))) {
      return unprocessable(c, "unknown_plan", { field: "plan" });
    }
    const cloneFrom = input.clonar_de;
    if (cloneFrom && !(await restaurantExists(sql, cloneFrom.restaurante_id))) {
      return unprocessable(c, "unknown_source", { field: "clonar_de.restaurante_id" });
    }
    const [ownerRole] = await sql<{ id: number; nombre: string }[]>`
      SELECT id, nombre FROM public.rol WHERE code = ${ROLE_TEMPLATE.Owner} AND restaurante_id IS NULL
    `;
    if (!ownerRole) throw new Error("Falta la plantilla de rol Propietario");

    let created: {
      id: number;
      branchId: number;
      invite: { id: number; token: string; expires_at: string };
      modules: string[];
      copied: Awaited<ReturnType<typeof cloneRestaurantData>> | null;
    };
    try {
      created = await sql.begin(async (tx) => {
        const restaurant = await createRestaurant(
          tx,
          {
            nombre: input.nombre,
            slug: input.slug,
            zonaHoraria: input.zona_horaria,
            pais: input.pais,
            plan: input.plan,
            local: input.local,
            recogida: input.recogida,
            reparto: input.reparto,
            ubicacion: input.ubicacion,
            horario: input.horario?.map((day) => ({
              dia: day.dia,
              disponible: day.disponible,
              apertura: day.apertura ?? null,
              cierre: day.cierre ?? null,
            })),
            recogidaMinutos: input.recogida_minutos,
            zonaReparto: input.zona_reparto && {
              nombre: `${input.local.nombre} (${input.zona_reparto.radio_km} km)`,
              radioKm: input.zona_reparto.radio_km,
              tarifa: input.zona_reparto.tarifa,
              minimo: input.zona_reparto.minimo,
              minutos: input.zona_reparto.minutos,
            },
            metodosPago: input.metodos_pago,
            codigoVerificacion:
              input.codigo_verificacion === CODE_CHANNEL.WhatsApp ? CODE_CHANNEL.WhatsApp : null,
          },
          deps.now(),
        );
        const copied = cloneFrom
          ? await cloneRestaurantData(
              tx,
              cloneFrom.restaurante_id,
              restaurant.id,
              restaurant.branchId,
              cloneFrom,
            )
          : null;
        const [invite] = await tx<{ id: number; token: string; expires_at: string }[]>`
          INSERT INTO public.restaurant_invites
            (restaurante_id, rol, rol_id, sucursal_ids, email, created_by, expires_at)
          VALUES (${restaurant.id}, ${legacyRole(ROLE_TEMPLATE.Owner)}, ${ownerRole.id}, '{}'::bigint[],
                  ${input.propietario_email}, ${c.get("platform").userId}::uuid,
                  (${deps.now()}::timestamptz AT TIME ZONE 'UTC') + make_interval(days => ${INVITE_DAYS}))
          RETURNING id, token::text AS token, expires_at AT TIME ZONE 'UTC' AS expires_at
        `;
        if (!invite) throw new Error("No se pudo crear la invitación");
        return { ...restaurant, invite, copied };
      });
    } catch (error) {
      if (error instanceof SlugTaken || (error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "slug_taken", field: "slug" });
      }
      throw error;
    }

    const emailSent = await sendInviteEmail(deps, {
      origin: c.req.header("Origin"),
      to: input.propietario_email,
      restaurante: input.nombre,
      rol: ownerRole.nombre,
      token: created.invite.token,
    });
    await record(c, created.id, "plataforma.restaurante.crear", "restaurante", created.id, {
      slug: input.slug,
      plan: input.plan,
      zona_horaria: input.zona_horaria,
      local: input.local.nombre,
      propietario_email: input.propietario_email,
      modulos: created.modules,
      email_enviado: emailSent,
      clonado: cloneFrom
        ? {
            origen_id: cloneFrom.restaurante_id,
            partes: {
              carta: cloneFrom.carta,
              horario: cloneFrom.horario,
              reparto: cloneFrom.reparto,
              ajustes: cloneFrom.ajustes,
            },
            copiado: created.copied,
          }
        : null,
      completo: {
        ubicacion: Boolean(input.ubicacion),
        horario: input.horario?.length ?? 0,
        reparto: Boolean(input.zona_reparto),
        recogida_minutos: input.recogida_minutos ?? null,
        metodos_pago: input.metodos_pago ?? null,
        codigo_verificacion: input.codigo_verificacion ?? CODE_CHANNEL.Off,
      },
    });
    const base = panelBase(deps, c.req.header("Origin"));
    return c.json(
      {
        id: created.id,
        slug: input.slug,
        local_id: created.branchId,
        plan: input.plan,
        modulos: created.modules,
        invitacion: {
          id: created.invite.id,
          email: input.propietario_email,
          token: created.invite.token,
          expires_at: created.invite.expires_at,
          // null si la API no conoce la URL del panel: la interfaz lo arma con su propio origen.
          enlace: base ? inviteLink(base, created.invite.token) : null,
          email_enviado: emailSent,
        },
      },
      201,
    );
  });

  // -------------------------------------------------------------------------------- borrado

  /**
   * Borra un restaurante y todo lo suyo. Irreversible: hay que repetir su enlace (`slug`) en
   * `confirmar`. Solo `admin`. Queda un registro en la auditoría (sin restaurante, que ya no existe).
   */
  app.delete("/restaurantes/:id", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, z.object({ confirmar: z.string().trim().min(1).max(120) }));
    if (!parsed.success) return invalid(c, "confirmar");
    const expected = restaurant.slug ?? String(restaurant.id);
    if (parsed.data.confirmar !== expected) {
      return unprocessable(c, "confirmation_mismatch", { field: "confirmar" });
    }
    // Personas con acceso a este restaurante: tras borrarlo se mira cuáles se quedan sin ningún uso.
    const members = await sql<{ user_id: string; email: string | null }[]>`
      SELECT DISTINCT user_id::text AS user_id, email FROM public.local_memberships
      WHERE  restaurante_id = ${restaurant.id}
    `;
    const removed = await sql.begin((tx) => deleteRestaurant(tx, restaurant.id));
    const sinUso: { user_id: string; email: string | null }[] = [];
    for (const member of members) {
      const account = {
        id: member.user_id,
        email: member.email,
        createdAt: "",
        lastSignInAt: null,
      };
      if (await isOrphan(sql, account)) sinUso.push(member);
    }
    // Archivos en Storage (mejor esfuerzo, ya con la base limpia): si fallan no deshace el borrado,
    // queda anotado en la auditoría para limpiarlos a mano.
    const archivos = await removeRestaurantFiles(deps, restaurant.id);
    await audit(sql, {
      restauranteId: null,
      actorTipo: "plataforma",
      actorId: c.get("platform").userId,
      accion: "plataforma.restaurante.borrar",
      recursoTipo: "restaurante",
      recursoId: String(restaurant.id),
      resultado: "ok",
      detalle: {
        slug: restaurant.slug,
        nombre: restaurant.nombre,
        ...removed,
        archivos,
        cuentas_sin_uso: sinUso.length,
      },
      requestId: c.get("requestId"),
    });
    // Las cuentas de Supabase NO se borran solas: la persona puede tener otro restaurante o volver.
    // Las que se quedan sin ningún uso se avisan y se borran, si se quiere, desde «Equipo».
    return c.json({
      id: restaurant.id,
      eliminado: true,
      ...removed,
      archivos,
      cuentas_sin_uso: sinUso,
    });
  });

  // ----------------------------------------------------------------------------------- carta

  /**
   * Importa la carta de un restaurante que aún no tiene ninguna, desde texto tabulado (ver
   * `parseMenuImport`). Con `?simular=1` solo valida y devuelve el resumen, sin escribir.
   */
  app.post("/restaurantes/:id/carta/importar", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, importMenuSchema);
    if (!parsed.success) return invalid(c, "texto");
    const menu = parseMenuImport(parsed.data.texto);
    if (!menu.ok) return unprocessable(c, "invalid_menu", { errores: menu.errors });
    const summary = {
      categorias: menu.categorias.length,
      productos: menu.categorias.reduce((total, cat) => total + cat.productos.length, 0),
      precios: menu.categorias.reduce(
        (total, cat) => total + cat.productos.reduce((n, item) => n + item.variantes.length, 0),
        0,
      ),
    };
    if (c.req.query("simular") === "1") return c.json({ simulacion: true, ...summary });
    try {
      await sql.begin((tx) => importMenu(tx, restaurant.id, menu.categorias));
    } catch (error) {
      if (error instanceof MenuAlreadyLoaded) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "menu_already_loaded" });
      }
      throw error;
    }
    await record(
      c,
      restaurant.id,
      "plataforma.carta.importar",
      "restaurante",
      restaurant.id,
      summary,
    );
    return c.json({ simulacion: false, ...summary }, 201);
  });

  // ----------------------------------------------------------------------------------- roles

  /** Rol propio de ese restaurante (las plantillas no se editan desde aquí: pieza V). */
  const ownRoleFromUrl = async (c: Ctx, restauranteId: number) => {
    const roleId = Number(c.req.param("rolId"));
    if (!Number.isSafeInteger(roleId) || roleId < 1) return null;
    return (await rolesOf(sql, restauranteId)).find((role) => role.id === roleId) ?? null;
  };

  app.get("/restaurantes/:id/roles", reader, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const [roles, usage, contracted] = await Promise.all([
      rolesOf(sql, restaurant.id),
      sql<{ rol_id: number; miembros: number; invitaciones: number }[]>`
        SELECT r.id AS rol_id,
               (SELECT count(*)::int FROM public.membresia_rol mr
                JOIN   public.local_memberships m ON m.id = mr.membership_id
                WHERE  mr.rol_id = r.id AND m.restaurante_id = ${restaurant.id}) AS miembros,
               (SELECT count(*)::int FROM public.restaurant_invites i
                WHERE  i.rol_id = r.id AND i.restaurante_id = ${restaurant.id}
                  AND  i.used_at IS NULL AND i.revocada_at IS NULL
                  AND  i.expires_at > (${deps.now()}::timestamptz AT TIME ZONE 'UTC')) AS invitaciones
        FROM   public.rol r
        WHERE  r.restaurante_id IS NULL OR r.restaurante_id = ${restaurant.id}
      `,
      sql<{ modulo_code: string }[]>`
        SELECT modulo_code FROM public.restaurante_modulo
        WHERE  restaurante_id = ${restaurant.id} AND estado = ${MODULE_STATE.Active}
      `,
    ]);
    const active = resolveActiveModules(contracted.map((row) => row.modulo_code as ModuleCode));
    const byRole = new Map(usage.map((row) => [row.rol_id, row]));
    return c.json({
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        nombre: role.nombre,
        plantilla: role.plantilla,
        permisos: role.permisos,
        miembros: byRole.get(role.id)?.miembros ?? 0,
        invitaciones: byRole.get(role.id)?.invitaciones ?? 0,
        editable: !role.plantilla,
      })),
      // Todos los permisos por módulo. `activo`: el restaurante tiene ese módulo contratado; un
      // permiso de un módulo inactivo se guarda pero no da acceso hasta que se active.
      catalogo: MODULES.map((module) => ({
        modulo: module.code,
        nombre: module.name,
        activo: active.has(module.code),
        permisos: ALL_PERMISSIONS.filter((code) => PERMISSION_MODULE[code] === module.code).map(
          (code) => ({ code, nombre: PERMISSION_LABEL[code] }),
        ),
      })).filter((group) => group.permisos.length > 0),
    });
  });

  app.post("/restaurantes/:id/roles", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, roleSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const input = parsed.data;
    if (await roleNameTaken(sql, restaurant.id, input.nombre, null)) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    let id: number;
    try {
      id = await sql.begin((tx) => insertRole(tx, restaurant.id, input.nombre, input.permisos));
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
      }
      throw error;
    }
    await record(c, restaurant.id, "plataforma.rol.crear", "rol", id, {
      nombre: input.nombre,
      permisos: input.permisos,
    });
    return c.json({ id }, 201);
  });

  app.put("/restaurantes/:id/roles/:rolId", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const role = await ownRoleFromUrl(c, restaurant.id);
    if (!role) return fail(c, 404, API_ERROR.NotFound);
    if (role.plantilla) return unprocessable(c, "template_role");
    const parsed = await body(c, roleSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const input = parsed.data;
    if (await roleNameTaken(sql, restaurant.id, input.nombre, role.id)) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "duplicate_name" });
    }
    await sql.begin((tx) => replaceRole(tx, role.id, input.nombre, input.permisos));
    const usage = await roleUsage(sql, role.id, deps.now());
    await record(c, restaurant.id, "plataforma.rol.editar", "rol", role.id, {
      nombre: input.nombre,
      antes: role.permisos,
      despues: input.permisos,
      miembros_afectados: usage.miembros,
    });
    return c.json({ id: role.id, miembros_afectados: usage.miembros });
  });

  app.delete("/restaurantes/:id/roles/:rolId", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const role = await ownRoleFromUrl(c, restaurant.id);
    if (!role) return fail(c, 404, API_ERROR.NotFound);
    if (role.plantilla) return unprocessable(c, "template_role");
    const usage = await roleUsage(sql, role.id, deps.now());
    if (usage.miembros > 0) return fail(c, 409, API_ERROR.Conflict, { reason: "role_in_use" });
    if (usage.invitaciones > 0) {
      return fail(c, 409, API_ERROR.Conflict, { reason: "pending_invites" });
    }
    await sql`DELETE FROM public.rol WHERE id = ${role.id} AND restaurante_id = ${restaurant.id}`;
    await record(c, restaurant.id, "plataforma.rol.borrar", "rol", role.id, {
      nombre: role.nombre,
    });
    return c.json({ id: role.id });
  });

  // ------------------------------------------------------------------------------------ plan

  app.put("/restaurantes/:id/plan", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, planSchema);
    if (!parsed.success) return invalid(c, "plan");
    if (parsed.data.plan === TRIAL_PLAN || !(await planExists(sql, parsed.data.plan))) {
      return unprocessable(c, "unknown_plan", { field: "plan" });
    }
    const result = await sql.begin(async (tx) => {
      const [before] = await tx<{ plan_code: string }[]>`
        SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${restaurant.id} FOR UPDATE
      `;
      const sync = await applyPlan(tx, restaurant.id, parsed.data.plan, deps.now());
      return { anterior: before?.plan_code ?? null, ...sync };
    });
    await record(c, restaurant.id, "plataforma.plan.cambiar", "plan", parsed.data.plan, {
      anterior: result.anterior,
      nuevo: parsed.data.plan,
      modulos_anadidos: result.added,
      modulos_quitados: result.removed,
    });
    return c.json({
      plan: parsed.data.plan,
      anterior: result.anterior,
      modulos_anadidos: result.added,
      modulos_quitados: result.removed,
    });
  });

  // --------------------------------------------------------------------------------- módulos

  app.put("/restaurantes/:id/modulos/:code", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const code = c.req.param("code");
    const parsed = await body(c, moduleSchema);
    if (!parsed.success) return invalid(c, "estado");
    const result = await sql.begin((tx) =>
      changeModule(tx, restaurant.id, code, parsed.data, deps.now()),
    );
    if (!result.ok) {
      const extra = result.modules ? { modulos: result.modules } : {};
      return result.status === 404
        ? fail(c, 404, API_ERROR.NotFound, { reason: result.reason })
        : result.status === 409
          ? fail(c, 409, API_ERROR.Conflict, { reason: result.reason, ...extra })
          : unprocessable(c, result.reason, extra);
    }
    await record(c, restaurant.id, "plataforma.modulo.cambiar", "modulo", code, {
      estado: result.estado,
      origen: result.origen,
    });
    return c.json({ modulo: code, estado: result.estado, origen: result.origen });
  });

  // -------------------------------------------------------------------------- métodos de pago

  app.put("/restaurantes/:id/metodos-pago", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, paymentSchema);
    if (!parsed.success) return invalid(c, "metodos");
    const allowed = parsed.data.metodos;

    const result = await sql.begin(async (tx) => {
      const [current] = await tx<{ payment_methods: unknown; metodos_pago_permitidos: unknown }[]>`
        SELECT payment_methods, metodos_pago_permitidos
        FROM   public.restaurante WHERE id = ${restaurant.id} FOR UPDATE
      `;
      const active = Array.isArray(current?.payment_methods)
        ? current.payment_methods.filter((m): m is string => typeof m === "string")
        : [];
      // Con una lista, lo que el restaurante tenía activo y ya no se permite se quita también.
      const permitted: readonly string[] | null = allowed;
      const kept =
        permitted === null ? active : active.filter((method) => permitted.includes(method));
      const removed = active.filter((method) => !kept.includes(method));
      await tx`
        UPDATE public.restaurante
        SET    metodos_pago_permitidos = ${allowed === null ? null : tx.json(allowed)}::jsonb,
               payment_methods         = ${tx.json(kept)}::jsonb
        WHERE  id = ${restaurant.id}
      `;
      return { kept, removed };
    });
    await record(
      c,
      restaurant.id,
      "plataforma.metodos_pago.cambiar",
      "restaurante",
      restaurant.id,
      {
        permitidos: allowed,
        metodos_quitados: result.removed,
      },
    );
    return c.json({
      permitidos: allowed,
      activos: result.kept,
      metodos_quitados: result.removed,
      // El restaurante se queda sin ningún método: no podrá cobrar hasta elegir uno permitido.
      sin_metodos_activos: result.kept.length === 0,
    });
  });

  // ------------------------------------------------------- antifraude: código de verificación

  app.put("/restaurantes/:id/antifraude-codigo", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, codeSettingsSchema);
    if (!parsed.success) return invalid(c, parsed.error.issues[0]?.path.join("."));
    const input = parsed.data;
    await sql.begin((tx) =>
      saveCodeSettings(tx, restaurant.id, {
        channel: input.canal === CODE_CHANNEL.WhatsApp ? CODE_CHANNEL.WhatsApp : null,
        ...(input.umbral_eur !== undefined ? { amountThresholdEur: input.umbral_eur } : {}),
        ...(input.tope_mensual_eur !== undefined ? { monthlyCapEur: input.tope_mensual_eur } : {}),
      }),
    );
    await record(
      c,
      restaurant.id,
      "plataforma.antifraude_codigo.cambiar",
      "restaurante",
      restaurant.id,
      {
        canal: input.canal,
        ...(input.umbral_eur !== undefined ? { umbral_eur: input.umbral_eur } : {}),
        ...(input.tope_mensual_eur !== undefined
          ? { tope_mensual_eur: input.tope_mensual_eur }
          : {}),
      },
    );
    return c.json({
      ...(await readCodeSettings(sql, restaurant.id)),
      api_configurada: Boolean(deps.sendCode && deps.codeSecret),
    });
  });

  registerPlatformTrialRoutes(app, deps);
  registerPlatformTemplateRoutes(app, deps);
  registerPlatformTeamRoutes(app, deps);

  return app;
}
