import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;
// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

/** El reloj fijo de la API en las pruebas (harness.ts). */
const NOW = new Date("2026-11-03T13:00:00Z");
const DAY_MS = 86_400_000;
const CONTACT = "hola@konnecttia.test";

let ipCounter = 0;
const nextIp = () => `10.1.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

async function call(
  user: User | null,
  method: string,
  path: string,
  body?: unknown,
  options: { app?: TestContext["app"]; ip?: string } = {},
) {
  const response = await (options.app ?? ctx.app).request(path, {
    method,
    headers: {
      ...(user ? auth(user) : {}),
      // Cada llamada sale de una IP distinta salvo que la prueba fije una (límite por IP).
      "x-real-ip": options.ip ?? nextIp(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const signup = (overrides: Record<string, unknown> = {}) => ({
  nombre: "Mi Bar",
  slug: "mi-bar",
  zona_horaria: "Atlantic/Canary",
  local: { nombre: "Mi Bar Centro", direccion: "Calle de prueba 1", telefono: "+34900000001" },
  recogida: true,
  reparto: true,
  miembro_nombre: "Ana Prueba",
  acepta_legal: true,
  ...overrides,
});

/**
 * Pedido web con el reloj indicado. El cuerpo es válido en forma (los ids de la carta ni existen
 * en la prueba): lo que importa es si el restaurante acepta pedidos, que se comprueba primero.
 */
const webOrderWith = async (slug: string, now: Date) => {
  const response = await ctx.appWith({ now: () => now }).request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200)}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Lucía",
      telefono: "+34611000000",
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      email: "cliente@test.local",
      items: [{ menu_item_id: 1, menu_variant_id: 1, quantity: 1 }],
    }),
  });
  return { status: response.status, body: (await response.json()) as Json };
};

async function restaurantId(slug: string): Promise<number> {
  const [row] = await ctx.sql<
    { id: number }[]
  >`SELECT id FROM public.restaurante WHERE slug = ${slug}`;
  if (!row) throw new Error(`No existe ${slug}`);
  return row.id;
}

const putConfig = (values: Record<string, unknown>) =>
  call("platformAdmin", "PUT", "/plataforma/config", values);

describe.skipIf(!TEST_DATABASE_URL)("alta autoservicio con prueba", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo) VALUES
        (${USERS.platformAdmin.userId}::uuid, ${USERS.platformAdmin.email}, 'admin', true),
        (${USERS.platformSupport.userId}::uuid, ${USERS.platformSupport.email}, 'soporte', true)
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("apagada por defecto", () => {
    it("la configuración pública dice que está cerrada y sin límites", async () => {
      const result = await call(null, "GET", "/alta/config");
      expect(result).toEqual({
        status: 200,
        body: {
          activa: false,
          requiere_aprobacion: false,
          dias: null,
          max_pedidos: null,
          contacto: null,
        },
      });
    });

    it("sin sesión 401; con sesión, 403 alta_closed y no se crea nada", async () => {
      expect((await call(null, "POST", "/alta", signup())).status).toBe(401);
      const result = await call("altaUno", "POST", "/alta", signup());
      expect(result.status).toBe(403);
      expect(result.body.reason).toBe("alta_closed");
      expect(await restaurantId("prueba-a")).toBe(101);
      const rows = await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'mi-bar'`;
      expect(rows.length).toBe(0);
    });

    it("los restaurantes de siempre (sin prueba) aceptan pedidos", async () => {
      const menu = await call(null, "GET", "/public/prueba-a/menu");
      expect(menu.body.restaurante.acepta_pedidos).toBe(true);
      const [{ ok } = { ok: false }] = await ctx.sql<{ ok: boolean }[]>`
        SELECT public.fn_restaurante_acepta_pedidos(101) AS ok
      `;
      expect(ok).toBe(true);
    });
  });

  describe("configuración de la plataforma", () => {
    it("solo el equipo la ve, y solo un admin la escribe", async () => {
      expect((await call(null, "GET", "/plataforma/config")).status).toBe(401);
      expect((await call("ownerA", "GET", "/plataforma/config")).status).toBe(403);
      const read = await call("platformSupport", "GET", "/plataforma/config");
      expect(read.status).toBe(200);
      expect(Object.keys(read.body.config).sort()).toEqual([
        "alta_autoservicio_activa",
        "alta_contacto_email",
        "alta_requiere_aprobacion",
        "prueba_dias",
        "prueba_max_pedidos",
      ]);
      expect(read.body.config.alta_autoservicio_activa).toBe(false);
      const denied = await call("platformSupport", "PUT", "/plataforma/config", {
        alta_autoservicio_activa: true,
      });
      expect(denied.status).toBe(403);
      expect((await call("ownerA", "PUT", "/plataforma/config", {})).status).toBe(403);
    });

    it("rechaza claves desconocidas, valores inválidos y cuerpos vacíos", async () => {
      for (const bad of [
        {},
        { clave_inventada: true },
        { alta_autoservicio_activa: "si" },
        { prueba_dias: 0 },
        { prueba_dias: 1.5 },
        { prueba_max_pedidos: -3 },
        { alta_contacto_email: "no-es-un-email" },
      ]) {
        const result = await putConfig(bad);
        expect(result.status, JSON.stringify(bad)).toBe(400);
      }
      const read = await call("platformAdmin", "GET", "/plataforma/config");
      expect(read.body.config.alta_autoservicio_activa).toBe(false);
    });

    it("un admin la cambia y queda auditado", async () => {
      const result = await putConfig({
        alta_autoservicio_activa: true,
        prueba_dias: 14,
        prueba_max_pedidos: 5,
        alta_contacto_email: "Hola@Konnecttia.test",
      });
      expect(result.status).toBe(200);
      expect(result.body.config).toMatchObject({
        alta_autoservicio_activa: true,
        alta_requiere_aprobacion: false,
        prueba_dias: 14,
        prueba_max_pedidos: 5,
        alta_contacto_email: CONTACT,
      });
      const [{ total } = { total: 0 }] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.auditoria
        WHERE  accion = 'plataforma.config.cambiar' AND actor_tipo = 'plataforma' AND resultado = 'ok'
      `;
      expect(total).toBe(1);
      expect((await call(null, "GET", "/alta/config")).body).toEqual({
        activa: true,
        requiere_aprobacion: false,
        dias: 14,
        max_pedidos: 5,
        contacto: CONTACT,
      });
    });

    it("null borra un límite (sin límite)", async () => {
      expect(
        (await putConfig({ prueba_max_pedidos: null })).body.config.prueba_max_pedidos,
      ).toBeNull();
      await putConfig({ prueba_max_pedidos: 5 });
    });
  });

  describe("comprobación de la dirección web", () => {
    it("disponible, ocupada, reservada y mal formada", async () => {
      expect((await call(null, "GET", "/alta/slug?valor=mi-bar-libre")).body).toEqual({
        disponible: true,
      });
      expect((await call(null, "GET", "/alta/slug?valor=prueba-a")).body).toEqual({
        disponible: false,
        motivo: "slug_taken",
      });
      expect((await call(null, "GET", "/alta/slug?valor=panel")).body.motivo).toBe("slug_reserved");
      expect((await call(null, "GET", "/alta/slug?valor=alta")).body.motivo).toBe("slug_reserved");
      expect((await call(null, "GET", "/alta/slug?valor=ab")).body.motivo).toBe("slug_too_short");
      expect((await call(null, "GET", "/alta/slug?valor=Mi_Bar")).body.motivo).toBe(
        "slug_invalid_format",
      );
      expect((await call(null, "GET", "/alta/slug")).body.disponible).toBe(false);
    });

    it("tiene límite por IP", async () => {
      const app = ctx.appWith({});
      let last = 0;
      for (let i = 0; i < 31; i++) {
        last = (
          await call(null, "GET", "/alta/slug?valor=otro-bar", undefined, {
            app,
            ip: "203.0.113.9",
          })
        ).status;
      }
      expect(last).toBe(429);
    });
  });

  describe("crear la prueba", () => {
    it("exige el email verificado (falla cerrado si no hay dato)", async () => {
      for (const user of ["altaSinVerificar", "altaSinDato"] as const) {
        const result = await call(user, "POST", "/alta", signup({ slug: "sin-verificar" }));
        expect(result.status, user).toBe(403);
        expect(result.body.reason).toBe("email_not_verified");
      }
      expect(
        (await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'sin-verificar'`).length,
      ).toBe(0);
    });

    it("valida el cuerpo, la zona horaria, el slug y que haya recogida o reparto", async () => {
      expect((await call("altaUno", "POST", "/alta", { nombre: "x" })).status).toBe(400);
      expect(
        (await call("altaUno", "POST", "/alta", signup({ zona_horaria: "Marte/Olimpo" }))).body
          .reason,
      ).toBe("invalid_time_zone");
      expect((await call("altaUno", "POST", "/alta", signup({ slug: "panel" }))).body.reason).toBe(
        "slug_reserved",
      );
      expect((await call("altaUno", "POST", "/alta", signup({ slug: "Mi Bar" }))).body.reason).toBe(
        "slug_invalid_format",
      );
      const none = await call(
        "altaUno",
        "POST",
        "/alta",
        signup({ recogida: false, reparto: false }),
      );
      expect(none.status).toBe(422);
      expect(none.body.reason).toBe("fulfillment_required");
      expect((await ctx.sql`SELECT 1 FROM public.restaurante_prueba`).length).toBe(0);
    });

    it("un slug ocupado da 409 slug_taken", async () => {
      const result = await call("altaUno", "POST", "/alta", signup({ slug: "prueba-a" }));
      expect(result.status).toBe(409);
      expect(result.body.reason).toBe("slug_taken");
    });

    it("crea restaurante, local, plan, módulos, propietario y prueba", async () => {
      const result = await call("altaUno", "POST", "/alta", signup({ reparto: false }));
      expect(result).toEqual({ status: 201, body: { slug: "mi-bar", estado: "activa" } });
      const id = await restaurantId("mi-bar");

      const [restaurant] = await ctx.sql<
        {
          nombre: string;
          zona_horaria: string;
          payment_methods: string[];
          pickup_enabled: boolean;
          delivery_enabled: boolean;
          plan: string;
        }[]
      >`
        SELECT r.nombre, r.zona_horaria, r.payment_methods, r.pickup_enabled, r.delivery_enabled,
               rp.plan_code AS plan
        FROM   public.restaurante r JOIN public.restaurante_plan rp ON rp.restaurante_id = r.id
        WHERE  r.id = ${id}
      `;
      expect(restaurant).toMatchObject({
        nombre: "Mi Bar",
        zona_horaria: "Atlantic/Canary",
        payment_methods: ["efectivo", "tarjeta"],
        pickup_enabled: true,
        delivery_enabled: false,
        plan: "prueba",
      });
      const [branch] = await ctx.sql<
        {
          nombre: string;
          es_principal: boolean;
          acepta_recogida: boolean;
          acepta_reparto: boolean;
        }[]
      >`
        SELECT nombre, es_principal, acepta_recogida, acepta_reparto
        FROM   public.sucursal WHERE restaurante_id = ${id}
      `;
      expect(branch).toMatchObject({
        nombre: "Mi Bar Centro",
        es_principal: true,
        acepta_recogida: true,
        acepta_reparto: false,
      });

      // Mismos módulos que premium, con origen «plan».
      const modules = await ctx.sql<{ modulo_code: string; origen: string }[]>`
        SELECT modulo_code, origen FROM public.restaurante_modulo
        WHERE  restaurante_id = ${id} ORDER BY modulo_code
      `;
      const premium = await ctx.sql<{ modulo_code: string }[]>`
        SELECT modulo_code FROM public.plan_modulo WHERE plan_code = 'premium' ORDER BY modulo_code
      `;
      expect(modules.map((m) => m.modulo_code)).toEqual(premium.map((m) => m.modulo_code));
      expect(new Set(modules.map((m) => m.origen))).toEqual(new Set(["plan"]));

      // Propietario directo (sin invitación), con su nombre.
      const members = await ctx.sql<
        { user_id: string; rol: string; nombre: string | null; email: string }[]
      >`
        SELECT m.user_id::text, m.rol, m.nombre, m.email FROM public.local_memberships m
        WHERE  m.restaurante_id = ${id}
      `;
      expect(members).toEqual([
        {
          user_id: USERS.altaUno.userId,
          rol: "owner",
          nombre: "Ana Prueba",
          email: USERS.altaUno.email,
        },
      ]);
      const roles = await ctx.sql<{ code: string; es_plantilla: boolean }[]>`
        SELECT r.code, r.es_plantilla FROM public.membresia_rol mr
        JOIN   public.local_memberships m ON m.id = mr.membership_id
        JOIN   public.rol r ON r.id = mr.rol_id
        WHERE  m.restaurante_id = ${id}
      `;
      expect(roles).toEqual([{ code: "owner", es_plantilla: true }]);
      expect(
        (await ctx.sql`SELECT 1 FROM public.restaurant_invites WHERE restaurante_id = ${id}`)
          .length,
      ).toBe(0);

      // La prueba copia los límites de la configuración de hoy.
      const [trial] = await ctx.sql<
        {
          estado: string;
          user_id: string;
          email: string;
          inicio: Date;
          fin: Date;
          max_pedidos: number;
        }[]
      >`
        SELECT estado, user_id::text, email, inicio, fin, max_pedidos
        FROM   public.restaurante_prueba WHERE restaurante_id = ${id}
      `;
      expect(trial?.estado).toBe("activa");
      expect(trial?.user_id).toBe(USERS.altaUno.userId);
      expect(trial?.email).toBe(USERS.altaUno.email);
      expect(trial?.inicio.toISOString()).toBe(NOW.toISOString());
      expect(trial?.fin.toISOString()).toBe(new Date(NOW.getTime() + 14 * DAY_MS).toISOString());
      expect(trial?.max_pedidos).toBe(5);

      const [audit] = await ctx.sql<{ actor_id: string; detalle: Json }[]>`
        SELECT actor_id, detalle FROM public.auditoria
        WHERE  accion = 'alta.crear' AND restaurante_id = ${id}
      `;
      expect(audit?.actor_id).toBe(USERS.altaUno.userId);
      expect(audit?.detalle).toMatchObject({ slug: "mi-bar", plan: "prueba", estado: "activa" });
    });

    it("sin aceptar los documentos legales no se crea nada; al aceptar queda registrado", async () => {
      const without = await call(
        "altaDos",
        "POST",
        "/alta",
        signup({ slug: "sin-legal", acepta_legal: false }),
      );
      expect(without.status).toBe(400);
      expect(without.body.field).toBe("acepta_legal");
      expect(
        (await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'sin-legal'`).length,
      ).toBe(0);

      const rows = await ctx.sql<{ documento: string; version: string; email: string }[]>`
        SELECT a.documento, a.version, a.email
        FROM   public.aceptacion_legal a JOIN public.restaurante r ON r.id = a.restaurante_id
        WHERE  r.slug = 'mi-bar' ORDER BY a.documento`;
      expect(rows.map((row) => row.documento)).toEqual(["encargado", "terminos"]);
      expect(rows.every((row) => row.version.length > 0 && row.email.includes("@"))).toBe(true);
    });

    it("una prueba por usuario: la segunda da 409 already_has_trial", async () => {
      const result = await call("altaUno", "POST", "/alta", signup({ slug: "mi-segundo-bar" }));
      expect(result.status).toBe(409);
      expect(result.body.reason).toBe("already_has_trial");
      expect(
        (await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'mi-segundo-bar'`).length,
      ).toBe(0);
    });

    it("el slug que ya tomó la prueba anterior queda ocupado", async () => {
      const result = await call("altaDos", "POST", "/alta", signup({ slug: "mi-bar" }));
      expect(result.status).toBe(409);
      expect(result.body.reason).toBe("slug_taken");
    });

    it("con captcha configurado lo exige", async () => {
      const seen: (string | undefined)[] = [];
      const app = ctx.appWith({
        verifyCaptcha: async (token) => {
          seen.push(token);
          return token === "bueno";
        },
      });
      const bad = await call("altaDos", "POST", "/alta", signup({ slug: "bar-captcha" }), { app });
      expect(bad.status).toBe(422);
      expect(bad.body.reason).toBe("captcha_failed");
      const good = await call(
        "altaDos",
        "POST",
        "/alta",
        signup({ slug: "bar-captcha", captcha_token: "bueno" }),
        { app },
      );
      expect(good.status).toBe(201);
      expect(seen).toEqual([undefined, "bueno"]);
    });

    it("tiene límite por IP", async () => {
      const app = ctx.appWith({});
      let last = 0;
      for (let i = 0; i < 6; i++) {
        last = (await call("altaUno", "POST", "/alta", signup(), { app, ip: "203.0.113.50" }))
          .status;
      }
      expect(last).toBe(429);
    });
  });

  describe("la prueba en el panel", () => {
    it("/acceso trae el estado de la prueba; los restaurantes de siempre, null", async () => {
      const mine = await call("altaUno", "GET", "/panel/mi-bar/acceso");
      expect(mine.status).toBe(200);
      expect(mine.body.prueba).toEqual({
        estado: "activa",
        dias_restantes: 14,
        pedidos_restantes: 5,
        acepta_pedidos: true,
        contacto: CONTACT,
      });
      expect(mine.body.roles.map((r: { code: string }) => r.code)).toEqual(["owner"]);
      expect((await call("ownerA", "GET", "/panel/prueba-a/acceso")).body.prueba).toBeNull();
    });

    it("un restaurante no ve el panel del otro", async () => {
      expect((await call("altaUno", "GET", "/panel/prueba-a/acceso")).status).toBe(403);
      expect((await call("ownerA", "GET", "/panel/mi-bar/acceso")).status).toBe(403);
      expect((await call("altaUno", "GET", "/panel/mi-bar/primeros-pasos")).status).toBe(200);
      expect((await call("ownerA", "GET", "/panel/mi-bar/primeros-pasos")).status).toBe(403);
    });

    it("primeros pasos: lo que falta y lo que ya está", async () => {
      const id = await restaurantId("mi-bar");
      const first = await call("altaUno", "GET", "/panel/mi-bar/primeros-pasos");
      // Sin reparto (se creó con reparto: false): no hay paso de zonas.
      expect(first.body.pasos).toEqual({
        logo: false,
        carta: false,
        horario: false,
        pagos: true,
        zonas: null,
        equipo: false,
      });
      await ctx.sql`UPDATE public.restaurante SET logo_url = 'https://ejemplo.test/logo.png' WHERE id = ${id}`;
      await ctx.sql`
        INSERT INTO public.menu_category (name, sort_order, restaurante_id) VALUES ('Bocadillos', 1, ${id})
      `;
      await ctx.sql`
        INSERT INTO public.menu_item (menu_category_id, name, restaurante_id, is_active)
        SELECT menu_category_id, 'Bocadillo', ${id}, true FROM public.menu_category WHERE restaurante_id = ${id}
      `;
      await ctx.sql`
        INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
        VALUES (${id}, 'lunes', true, '09:00', '17:00')
      `;
      const [role] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.rol WHERE code = 'owner' AND restaurante_id IS NULL
      `;
      const after = await call("altaUno", "GET", "/panel/mi-bar/primeros-pasos");
      expect(after.body.pasos).toMatchObject({
        logo: true,
        carta: true,
        horario: true,
        equipo: false,
      });
      await ctx.sql`
        INSERT INTO public.restaurant_invites (restaurante_id, rol, rol_id, sucursal_ids, email, created_by, expires_at)
        SELECT ${id}, 'viewer', ${role?.id ?? 0}, '{}'::bigint[], 'equipo@test.local',
               ${USERS.altaUno.userId}::uuid, now() + interval '7 days'
      `;
      expect((await call("altaUno", "GET", "/panel/mi-bar/primeros-pasos")).body.pasos.equipo).toBe(
        true,
      );
    });
  });

  describe("vencimiento", () => {
    it("vigente: la carta y los pedidos funcionan", async () => {
      const menu = await call(null, "GET", "/public/mi-bar/menu");
      expect(menu.body.restaurante.acepta_pedidos).toBe(true);
      const order = await webOrderWith("mi-bar", NOW);
      // La carta de la prueba está casi vacía: el pedido falla por otra razón, no por la prueba.
      expect(order.body.reason).not.toBe("restaurant_unavailable");
    });

    it("por días: pasado el fin, ni la web ni el panel toman pedidos; los datos se conservan", async () => {
      const later = new Date(NOW.getTime() + 15 * DAY_MS);
      const order = await webOrderWith("mi-bar", later);
      expect(order.status).toBe(422);
      expect(order.body.reason).toBe("restaurant_unavailable");

      const lateApp = ctx.appWith({ now: () => later });
      const menu = await call(null, "GET", "/public/mi-bar/menu", undefined, { app: lateApp });
      expect(menu.body.restaurante.acepta_pedidos).toBe(false);

      const access = await call("altaUno", "GET", "/panel/mi-bar/acceso", undefined, {
        app: lateApp,
      });
      expect(access.status).toBe(200);
      expect(access.body.prueba).toMatchObject({
        estado: "activa",
        dias_restantes: 0,
        acepta_pedidos: false,
      });

      // El pedido manual del panel es uso del producto: también se bloquea.
      const manual = await ctx.appWith({ now: () => later }).request("/panel/mi-bar/orders", {
        method: "POST",
        headers: {
          ...auth("altaUno"),
          "Content-Type": "application/json",
          "Idempotency-Key": "manual-prueba-vencida-1",
        },
        body: JSON.stringify({
          canal: "telefono",
          nombre: "Cliente",
          telefono: "+34611000000",
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          items: [{ menu_item_id: 1, menu_variant_id: 1, quantity: 1 }],
        }),
      });
      expect(manual.status).toBe(422);
      expect(((await manual.json()) as Json).reason).toBe("restaurant_unavailable");

      // El panel y los datos siguen ahí.
      expect(
        (await call("altaUno", "GET", "/panel/mi-bar/primeros-pasos", undefined, { app: lateApp }))
          .status,
      ).toBe(200);
      const [{ total } = { total: 0 }] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.menu_item WHERE restaurante_id = ${await restaurantId("mi-bar")}
      `;
      expect(total).toBe(1);
    });

    it("ampliar días la reactiva desde hoy", async () => {
      const id = await restaurantId("mi-bar");
      const later = new Date(NOW.getTime() + 15 * DAY_MS);
      const result = await call(
        "platformAdmin",
        "PUT",
        `/plataforma/pruebas/${id}`,
        { accion: "ampliar", dias: 7 },
        { app: ctx.appWith({ now: () => later }) },
      );
      expect(result.status).toBe(200);
      // Venció el día 14: se suma a hoy (día 15), no al fin viejo.
      expect(result.body.prueba.fin).toBe(new Date(later.getTime() + 7 * DAY_MS).toISOString());
      expect(result.body.prueba.acepta_pedidos).toBe(true);
      const order = await webOrderWith("mi-bar", later);
      expect(order.body.reason).not.toBe("restaurant_unavailable");
    });

    it("por pedidos: los reales agotan el máximo; carritos, expirados y cancelados no cuentan", async () => {
      const id = await restaurantId("mi-bar");
      // Máximo 5 y ya hay 0 reales: cuatro reales + tres que no cuentan siguen aceptando.
      for (const estado of [
        "recibido",
        "confirmado",
        "entregado",
        "pendiente_pago",
        "en_curso",
        "expirado",
        "cancelado",
      ]) {
        await ctx.sql`
          INSERT INTO public.pedidos (restaurante_id, telefono, estado) VALUES (${id}, '+34600000009', ${estado})
        `;
      }
      let access = await call("altaUno", "GET", "/panel/mi-bar/acceso");
      expect(access.body.prueba.pedidos_restantes).toBe(1);
      expect(access.body.prueba.acepta_pedidos).toBe(true);
      const early = await webOrderWith("mi-bar", NOW);
      expect(early.body.reason).not.toBe("restaurant_unavailable");

      await ctx.sql`INSERT INTO public.pedidos (restaurante_id, telefono, estado) VALUES (${id}, '+34600000009', 'listo')`;
      access = await call("altaUno", "GET", "/panel/mi-bar/acceso");
      expect(access.body.prueba.pedidos_restantes).toBe(0);
      expect(access.body.prueba.acepta_pedidos).toBe(false);
      const blocked = await webOrderWith("mi-bar", NOW);
      expect(blocked.status).toBe(422);
      expect(blocked.body.reason).toBe("restaurant_unavailable");
      expect((await call(null, "GET", "/public/mi-bar/menu")).body.restaurante.acepta_pedidos).toBe(
        false,
      );

      const more = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "ampliar",
        pedidos: 3,
      });
      expect(more.status).toBe(200);
      expect(more.body.prueba.max_pedidos).toBe(8);
      expect(more.body.prueba.pedidos_restantes).toBe(3);
      expect((await webOrderWith("mi-bar", NOW)).body.reason).not.toBe("restaurant_unavailable");
    });
  });

  describe("aprobación manual", () => {
    it("la prueba nace pendiente y no acepta pedidos hasta que Konnecttia la aprueba", async () => {
      expect((await putConfig({ alta_requiere_aprobacion: true })).status).toBe(200);
      const created = await call(
        "altaTres",
        "POST",
        "/alta",
        signup({ nombre: "Bar Tres", slug: "bar-tres" }),
      );
      expect(created.body).toEqual({ slug: "bar-tres", estado: "pendiente" });
      const id = await restaurantId("bar-tres");

      const access = await call("altaTres", "GET", "/panel/bar-tres/acceso");
      expect(access.body.prueba.estado).toBe("pendiente");
      expect(access.body.prueba.acepta_pedidos).toBe(false);
      const order = await webOrderWith("bar-tres", NOW);
      expect(order.status).toBe(422);
      expect(order.body.reason).toBe("restaurant_unavailable");
      expect(
        (await call(null, "GET", "/public/bar-tres/menu")).body.restaurante.acepta_pedidos,
      ).toBe(false);

      const list = await call("platformSupport", "GET", "/plataforma/pruebas");
      expect(list.status).toBe(200);
      const row = list.body.pruebas.find((p: Json) => p.restaurante_id === id);
      expect(row).toMatchObject({ estado: "pendiente", slug: "bar-tres", acepta_pedidos: false });
      // Pendientes primero.
      expect(list.body.pruebas[0].estado).toBe("pendiente");
      expect(list.body.planes.map((p: { code: string }) => p.code)).toEqual(["basico", "premium"]);

      // Soporte solo lee.
      const denied = await call("platformSupport", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "aprobar",
      });
      expect(denied.status).toBe(403);
      expect(
        (await call("altaTres", "PUT", `/plataforma/pruebas/${id}`, { accion: "aprobar" })).status,
      ).toBe(403);

      // Aprobar la hace activa y la prueba empieza ahora (misma duración concedida).
      const approvedAt = new Date(NOW.getTime() + 2 * DAY_MS);
      const approved = await call(
        "platformAdmin",
        "PUT",
        `/plataforma/pruebas/${id}`,
        { accion: "aprobar" },
        { app: ctx.appWith({ now: () => approvedAt }) },
      );
      expect(approved.status).toBe(200);
      expect(approved.body.prueba).toMatchObject({
        estado: "activa",
        inicio: approvedAt.toISOString(),
        fin: new Date(approvedAt.getTime() + 14 * DAY_MS).toISOString(),
        acepta_pedidos: true,
      });
      expect((await webOrderWith("bar-tres", approvedAt)).body.reason).not.toBe(
        "restaurant_unavailable",
      );

      // Una activa no se «aprueba» otra vez.
      const again = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "aprobar",
      });
      expect(again.status).toBe(409);
      expect(again.body.reason).toBe("invalid_state");
      const [{ total } = { total: 0 }] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.auditoria
        WHERE  accion = 'plataforma.prueba.aprobar' AND restaurante_id = ${id}
      `;
      expect(total).toBe(1);
    });

    it("rechazar bloquea los pedidos y conserva los datos; se puede reconsiderar", async () => {
      const created = await call(
        "altaCuatro",
        "POST",
        "/alta",
        signup({ nombre: "Bar Cuatro", slug: "bar-cuatro" }),
      );
      expect(created.body.estado).toBe("pendiente");
      const id = await restaurantId("bar-cuatro");
      const rejected = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "rechazar",
      });
      expect(rejected.status).toBe(200);
      expect(rejected.body.prueba).toMatchObject({ estado: "rechazada", acepta_pedidos: false });
      expect((await webOrderWith("bar-cuatro", NOW)).body.reason).toBe("restaurant_unavailable");
      expect((await call("altaCuatro", "GET", "/panel/bar-cuatro/acceso")).body.prueba.estado).toBe(
        "rechazada",
      );
      // No se puede ampliar una rechazada.
      const extend = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "ampliar",
        dias: 3,
      });
      expect(extend.status).toBe(409);
      // Reconsiderar: aprobar de nuevo.
      const back = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, {
        accion: "aprobar",
      });
      expect(back.body.prueba.estado).toBe("activa");
    });

    it("valida la acción y la prueba", async () => {
      const id = await restaurantId("bar-tres");
      for (const bad of [
        {},
        { accion: "borrar" },
        { accion: "ampliar" },
        { accion: "aprobar", dias: 3 },
        { accion: "ampliar", dias: 0 },
      ]) {
        expect(
          (await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, bad)).status,
          JSON.stringify(bad),
        ).toBe(400);
      }
      expect(
        (await call("platformAdmin", "PUT", "/plataforma/pruebas/101", { accion: "aprobar" }))
          .status,
      ).toBe(404);
      expect(
        (await call("platformAdmin", "PUT", "/plataforma/pruebas/abc", { accion: "aprobar" }))
          .status,
      ).toBe(404);
    });

    it("sin límite de días o de pedidos no hay nada que ampliar", async () => {
      await putConfig({
        prueba_dias: null,
        prueba_max_pedidos: null,
        alta_requiere_aprobacion: false,
      });
      await ctx.sql`DELETE FROM public.restaurante_prueba WHERE user_id = ${USERS.altaDos.userId}::uuid`;
      const created = await call(
        "altaDos",
        "POST",
        "/alta",
        signup({ nombre: "Bar Libre", slug: "bar-libre" }),
      );
      expect(created.body.estado).toBe("activa");
      const id = await restaurantId("bar-libre");
      const [row] = await ctx.sql<{ fin: Date | null; max_pedidos: number | null }[]>`
        SELECT fin, max_pedidos FROM public.restaurante_prueba WHERE restaurante_id = ${id}
      `;
      expect(row).toEqual({ fin: null, max_pedidos: null });
      const access = await call("altaDos", "GET", "/panel/bar-libre/acceso");
      expect(access.body.prueba).toMatchObject({
        dias_restantes: null,
        pedidos_restantes: null,
        acepta_pedidos: true,
      });
      for (const body of [
        { accion: "ampliar", dias: 3 },
        { accion: "ampliar", pedidos: 3 },
      ]) {
        const result = await call("platformAdmin", "PUT", `/plataforma/pruebas/${id}`, body);
        expect(result.status).toBe(422);
      }
      // Muchos años después sigue aceptando.
      const far = new Date(NOW.getTime() + 3650 * DAY_MS);
      expect((await webOrderWith("bar-libre", far)).body.reason).not.toBe("restaurant_unavailable");
    });
  });

  describe("conversión", () => {
    it("el plan «prueba» no se asigna a mano: solo lo da el alta y se sale de él al convertir", async () => {
      const id = await restaurantId("mi-bar");
      const change = await call("platformAdmin", "PUT", `/plataforma/restaurantes/${id}/plan`, {
        plan: "prueba",
      });
      expect(change.status).toBe(422);
      expect(change.body.reason).toBe("unknown_plan");
      const create = await call("platformAdmin", "POST", "/plataforma/restaurantes", {
        nombre: "Bar Manual",
        slug: "bar-manual",
        zona_horaria: "Atlantic/Canary",
        plan: "prueba",
        local: { nombre: "Bar Manual" },
        propietario_email: "dueno@manual.test",
      });
      expect(create.status).toBe(422);
      expect(
        (await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'bar-manual'`).length,
      ).toBe(0);
    });

    it("pasa a un plan de pago, sincroniza los módulos de origen plan y deja de tener límites", async () => {
      const id = await restaurantId("mi-bar");
      // Vencida por pedidos para comprobar que convertir la reactiva.
      await ctx.sql`UPDATE public.restaurante_prueba SET max_pedidos = 1 WHERE restaurante_id = ${id}`;
      expect((await webOrderWith("mi-bar", NOW)).body.reason).toBe("restaurant_unavailable");
      // Un complemento dado a mano se respeta.
      await ctx.sql`
        INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
        VALUES (${id}, 'notify.sms', 'complemento')
      `;

      expect(
        (
          await call("platformSupport", "POST", `/plataforma/pruebas/${id}/convertir`, {
            plan: "basico",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("platformAdmin", "POST", `/plataforma/pruebas/${id}/convertir`, {
            plan: "prueba",
          })
        ).body.reason,
      ).toBe("unknown_plan");
      expect(
        (
          await call("platformAdmin", "POST", `/plataforma/pruebas/${id}/convertir`, {
            plan: "inventado",
          })
        ).body.reason,
      ).toBe("unknown_plan");
      expect(
        (await call("platformAdmin", "POST", `/plataforma/pruebas/${id}/convertir`, {})).status,
      ).toBe(400);
      expect(
        (
          await call("platformAdmin", "POST", "/plataforma/pruebas/101/convertir", {
            plan: "basico",
          })
        ).status,
      ).toBe(404);

      const result = await call("platformAdmin", "POST", `/plataforma/pruebas/${id}/convertir`, {
        plan: "basico",
      });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ estado: "convertida", plan: "basico" });
      expect(result.body.modulos_quitados).toEqual(
        expect.arrayContaining(["tables", "analytics", "locations.multi"]),
      );

      const [plan] = await ctx.sql<{ plan_code: string }[]>`
        SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${id}
      `;
      expect(plan?.plan_code).toBe("basico");
      const modules = await ctx.sql<{ modulo_code: string; origen: string }[]>`
        SELECT modulo_code, origen FROM public.restaurante_modulo WHERE restaurante_id = ${id}
      `;
      const basic = await ctx.sql<{ modulo_code: string }[]>`
        SELECT modulo_code FROM public.plan_modulo WHERE plan_code = 'basico'
      `;
      expect(
        modules
          .filter((m) => m.origen === "plan")
          .map((m) => m.modulo_code)
          .sort(),
      ).toEqual(basic.map((m) => m.modulo_code).sort());
      expect(modules.find((m) => m.modulo_code === "notify.sms")?.origen).toBe("complemento");

      // Convertida: sin límites y sin banner.
      expect(
        (await webOrderWith("mi-bar", new Date(NOW.getTime() + 400 * DAY_MS))).body.reason,
      ).not.toBe("restaurant_unavailable");
      expect((await call("altaUno", "GET", "/panel/mi-bar/acceso")).body.prueba).toBeNull();
      const again = await call("platformAdmin", "POST", `/plataforma/pruebas/${id}/convertir`, {
        plan: "premium",
      });
      expect(again.status).toBe(409);
      const [{ total } = { total: 0 }] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.auditoria
        WHERE  accion = 'plataforma.prueba.convertir' AND restaurante_id = ${id}
      `;
      expect(total).toBe(1);
      const listed = await call("platformAdmin", "GET", "/plataforma/pruebas");
      expect(listed.body.pruebas.find((p: Json) => p.restaurante_id === id)).toMatchObject({
        estado: "convertida",
        plan: "basico",
        acepta_pedidos: true,
      });
    });
  });
});
