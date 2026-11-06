import { MODULE_KIND, ROLE_TEMPLATE } from "@konnecttia/access";
import {
  checkRestaurantSlug,
  DEFERRED_PAYMENT_METHODS,
  isValidTimeZone,
  ORDER_STATUS,
  PAYMENT_METHODS,
  PLATFORM_ROLE,
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
  MANUAL_ORIGINS,
  MODULE_STATE,
  planExists,
} from "../repositories/platform";
import { legacyRole } from "./panel-team";

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

const createSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(100),
  zona_horaria: z.string().trim().min(1).max(64),
  plan: z.string().trim().min(1).max(40),
  local: z.object({
    nombre: z.string().trim().min(1).max(120),
    direccion: z.string().trim().max(200).optional(),
    telefono: z.string().trim().max(30).optional(),
  }),
  propietario_email: z.string().trim().toLowerCase().email().max(255),
});

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
      SELECT code, nombre FROM public.plan ORDER BY code
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
          direccion: string | null;
          telefono: string | null;
          creado: string | null;
          payment_methods: unknown;
          metodos_pago_permitidos: unknown;
        }[]
      >`
        SELECT id, nombre, slug, zona_horaria, direccion, telefono,
               created_at AT TIME ZONE 'UTC' AS creado, payment_methods, metodos_pago_permitidos
        FROM   public.restaurante WHERE id = ${id}
      `,
      sql<{ code: string; nombre: string }[]>`SELECT code, nombre FROM public.plan ORDER BY code`,
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
    const active = Array.isArray(restaurant.payment_methods)
      ? restaurant.payment_methods.filter((m): m is string => typeof m === "string")
      : [];
    const allowed = Array.isArray(restaurant.metodos_pago_permitidos)
      ? restaurant.metodos_pago_permitidos.filter((m): m is string => typeof m === "string")
      : null;
    return c.json({
      restaurante: {
        id: restaurant.id,
        nombre: restaurant.nombre,
        slug: restaurant.slug,
        zona_horaria: restaurant.zona_horaria,
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
      locales: branches,
      equipo: members.map(({ apodo, ...member }) => ({
        ...member,
        apodo,
        mostrar: displayName(apodo, member.nombre),
      })),
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
    const [knownZone] = await sql`
      SELECT 1 FROM pg_timezone_names WHERE name = ${input.zona_horaria}
    `;
    if (!knownZone) return unprocessable(c, "invalid_time_zone", { field: "zona_horaria" });
    if (!(await planExists(sql, input.plan))) {
      return unprocessable(c, "unknown_plan", { field: "plan" });
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
    };
    try {
      created = await sql.begin(async (tx) => {
        const taken = await tx`SELECT 1 FROM public.restaurante WHERE slug = ${input.slug}`;
        if (taken.length > 0) throw new SlugTaken();
        // Solo lo pedido: el resto de columnas queda con el valor por defecto de la tabla. Un
        // trigger (0003) crea el local principal con estos datos. Cobro: solo los métodos que no
        // necesitan datos (transferencia y Bizum piden IBAN o teléfono); el dueño añade los demás.
        const [restaurant] = await tx<{ id: number }[]>`
          INSERT INTO public.restaurante (nombre, slug, zona_horaria, direccion, telefono, payment_methods)
          VALUES (${input.nombre}, ${input.slug}, ${input.zona_horaria},
                  ${input.local.direccion || null}, ${input.local.telefono || null},
                  ${tx.json(PAYMENT_METHODS.filter((method) => !DEFERRED_PAYMENT_METHODS.has(method)))})
          RETURNING id
        `;
        if (!restaurant) throw new Error("No se pudo crear el restaurante");
        const [branch] = await tx<{ id: number }[]>`
          UPDATE public.sucursal SET nombre = ${input.local.nombre}
          WHERE  restaurante_id = ${restaurant.id} AND es_principal
          RETURNING id
        `;
        if (!branch) throw new Error("No se creó el local principal");
        await applyPlan(tx, restaurant.id, input.plan, deps.now());
        const modules = await tx<{ modulo_code: string }[]>`
          SELECT modulo_code FROM public.restaurante_modulo
          WHERE  restaurante_id = ${restaurant.id} ORDER BY modulo_code
        `;
        const [invite] = await tx<{ id: number; token: string; expires_at: string }[]>`
          INSERT INTO public.restaurant_invites
            (restaurante_id, rol, rol_id, sucursal_ids, email, created_by, expires_at)
          VALUES (${restaurant.id}, ${legacyRole(ROLE_TEMPLATE.Owner)}, ${ownerRole.id}, '{}'::bigint[],
                  ${input.propietario_email}, ${c.get("platform").userId}::uuid,
                  (${deps.now()}::timestamptz AT TIME ZONE 'UTC') + make_interval(days => ${INVITE_DAYS}))
          RETURNING id, token::text AS token, expires_at AT TIME ZONE 'UTC' AS expires_at
        `;
        if (!invite) throw new Error("No se pudo crear la invitación");
        return {
          id: restaurant.id,
          branchId: branch.id,
          invite,
          modules: modules.map((row) => row.modulo_code),
        };
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

  // ------------------------------------------------------------------------------------ plan

  app.put("/restaurantes/:id/plan", writer, async (c) => {
    const restaurant = await restaurantFromUrl(c);
    if (!restaurant) return fail(c, 404, API_ERROR.RestaurantNotFound);
    const parsed = await body(c, planSchema);
    if (!parsed.success) return invalid(c, "plan");
    if (!(await planExists(sql, parsed.data.plan))) {
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

  return app;
}

class SlugTaken extends Error {}
