import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Mailer } from "../src/context";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(
  user: User | null,
  method: string,
  path: string,
  body?: unknown,
  app: TestContext["app"] = ctx.app,
) {
  const response = await app.request(path, {
    method,
    headers: {
      ...(user ? auth(user) : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const newRestaurant = (overrides: Record<string, unknown> = {}) => ({
  nombre: "Bar Nuevo",
  slug: "bar-nuevo",
  zona_horaria: "Atlantic/Canary",
  plan: "basico",
  local: { nombre: "Bar Nuevo Centro", direccion: "Calle de prueba 1", telefono: "+34900000000" },
  propietario_email: "Dueno@Nuevo.test",
  ...overrides,
});

async function modules(restauranteId: number) {
  return ctx.sql<{ modulo_code: string; estado: string; origen: string }[]>`
    SELECT modulo_code, estado, origen FROM public.restaurante_modulo
    WHERE  restaurante_id = ${restauranteId} ORDER BY modulo_code
  `;
}

describe.skipIf(!TEST_DATABASE_URL)("panel interno de Konnecttia (/plataforma)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo) VALUES
        (${USERS.platformAdmin.userId}::uuid, ${USERS.platformAdmin.email}, 'admin', true),
        (${USERS.platformSupport.userId}::uuid, ${USERS.platformSupport.email}, 'soporte', true),
        (${USERS.platformInactive.userId}::uuid, ${USERS.platformInactive.email}, 'admin', false)
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("acceso", () => {
    it("sin sesión: 401; con sesión que no es del equipo: 403", async () => {
      expect((await call(null, "GET", "/plataforma/yo")).status).toBe(401);
      expect((await call(null, "GET", "/plataforma/restaurantes")).status).toBe(401);
      // Propietarios de restaurantes y miembros dados de baja no entran.
      for (const user of ["ownerA", "ownerB", "viewerA", "newcomer", "platformInactive"] as const) {
        expect((await call(user, "GET", "/plataforma/yo")).status, user).toBe(403);
        expect((await call(user, "GET", "/plataforma/restaurantes")).status, user).toBe(403);
        expect((await call(user, "GET", "/plataforma/restaurantes/101")).status, user).toBe(403);
        expect((await call(user, "POST", "/plataforma/restaurantes", newRestaurant())).status).toBe(
          403,
        );
      }
    });

    it("/yo devuelve email y rol", async () => {
      expect(await call("platformAdmin", "GET", "/plataforma/yo")).toEqual({
        status: 200,
        body: { email: USERS.platformAdmin.email, rol: "admin" },
      });
      expect((await call("platformSupport", "GET", "/plataforma/yo")).body.rol).toBe("soporte");
    });

    it("soporte solo lee: toda escritura es 403 y queda auditada", async () => {
      const writes: [string, string, unknown][] = [
        ["POST", "/plataforma/restaurantes", newRestaurant({ slug: "soporte-no" })],
        ["PUT", "/plataforma/restaurantes/101/plan", { plan: "basico" }],
        ["PUT", "/plataforma/restaurantes/101/modulos/analytics", { estado: "suspendido" }],
        ["PUT", "/plataforma/restaurantes/101/metodos-pago", { metodos: ["efectivo"] }],
      ];
      for (const [method, path, payload] of writes) {
        const result = await call("platformSupport", method, path, payload);
        expect(result.status, path).toBe(403);
        expect(result.body.reason).toBe("platform_role_insufficient");
      }
      expect((await call("platformSupport", "GET", "/plataforma/restaurantes")).status).toBe(200);
      expect((await call("platformSupport", "GET", "/plataforma/restaurantes/101")).status).toBe(
        200,
      );
      const [{ total } = { total: 0 }] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.auditoria
        WHERE  actor_tipo = 'plataforma' AND resultado = 'denegado'
          AND  actor_id = ${USERS.platformSupport.userId}
      `;
      expect(total).toBe(writes.length);
      // Nada cambió.
      const [row] = await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'soporte-no'`;
      expect(row).toBeUndefined();
    });
  });

  describe("lectura", () => {
    it("lista restaurantes con plan, locales, equipo y actividad; el buscador filtra", async () => {
      await ctx.sql`
        INSERT INTO public.pedidos (restaurante_id, telefono, estado, created_at) VALUES
          (101, '+34600000001', 'entregado', '2026-10-25 10:00:00'::text::timestamp),
          (101, '+34600000001', 'entregado', '2026-10-01 10:00:00'::text::timestamp),
          (101, '+34600000001', 'en_curso',  '2026-11-02 10:00:00'::text::timestamp)
      `;
      const all = await call("platformAdmin", "GET", "/plataforma/restaurantes");
      expect(all.status).toBe(200);
      expect(all.body.planes.map((plan: { code: string }) => plan.code)).toEqual([
        "basico",
        "premium",
      ]);
      const names = all.body.restaurantes.map((r: { slug: string }) => r.slug);
      expect(names).toEqual(expect.arrayContaining(["prueba-a", "prueba-b", "prueba-c"]));
      const a = all.body.restaurantes.find((r: { slug: string }) => r.slug === "prueba-a");
      expect(a).toMatchObject({
        id: 101,
        nombre: "Cafetería de prueba A",
        plan: "premium",
        locales: 1,
        miembros: 2,
        // Un carrito (en_curso) no cuenta y el de octubre queda fuera de los 30 días.
        pedidos_30d: 1,
      });
      expect(a.ultimo_pedido).toMatch(/^2026-10-25T10:00:00/);
      const c = all.body.restaurantes.find((r: { slug: string }) => r.slug === "prueba-c");
      expect(c.locales).toBe(3);

      const filtered = await call("platformAdmin", "GET", "/plataforma/restaurantes?q=PRUEBA-b");
      expect(filtered.body.restaurantes.map((r: { slug: string }) => r.slug)).toEqual(["prueba-b"]);
      const byName = await call("platformAdmin", "GET", "/plataforma/restaurantes?q=dos%20locales");
      expect(byName.body.restaurantes.map((r: { id: number }) => r.id)).toEqual([103]);
      // Un % del buscador es texto, no un comodín.
      const wild = await call("platformAdmin", "GET", "/plataforma/restaurantes?q=%25");
      expect(wild.body.restaurantes).toEqual([]);
    });

    it("la ficha trae plan, módulos frente al catálogo, métodos, locales y equipo", async () => {
      const result = await call("platformAdmin", "GET", "/plataforma/restaurantes/102");
      expect(result.status).toBe(200);
      expect(result.body.restaurante).toMatchObject({ id: 102, slug: "prueba-b" });
      expect(result.body.plan).toMatchObject({ code: "basico" });
      expect(result.body.planes.map((p: { code: string }) => p.code)).toEqual([
        "basico",
        "premium",
      ]);
      const byCode = Object.fromEntries(
        result.body.modulos.map((m: { code: string }) => [m.code, m]),
      );
      expect(byCode.delivery).toMatchObject({
        estado: "activo",
        origen: "plan",
        en_plan: true,
        gestionable: true,
      });
      expect(byCode.tables).toMatchObject({ estado: null, origen: null, en_plan: false });
      expect(byCode["core.orders"].gestionable).toBe(false);
      expect(byCode["payments.online"].gestionable).toBe(false);
      expect(result.body.metodos_pago).toEqual({
        catalogo: ["efectivo", "tarjeta", "transferencia", "bizum"],
        permitidos: null,
        activos: ["efectivo"],
      });
      expect(result.body.locales.map((l: { principal: boolean }) => l.principal)).toEqual([
        true,
        false,
      ]);
      expect(result.body.equipo).toEqual([
        expect.objectContaining({ roles: [expect.objectContaining({ code: "owner" })] }),
      ]);
      expect((await call("platformAdmin", "GET", "/plataforma/restaurantes/999999")).status).toBe(
        404,
      );
      expect((await call("platformAdmin", "GET", "/plataforma/restaurantes/abc")).status).toBe(404);
    });
  });

  describe("alta de restaurante", () => {
    it("crea restaurante, local principal, plan, módulos e invitación del propietario", async () => {
      const sent: { to: string; text: string }[] = [];
      const mailer: Mailer = { send: async (message) => void sent.push(message) };
      const app = ctx.appWith({ mailer, panelUrl: "https://panel.test/" });
      const result = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant(),
        app,
      );
      expect(result.status).toBe(201);
      const id = result.body.id as number;
      expect(result.body).toMatchObject({ slug: "bar-nuevo", plan: "basico" });
      expect(result.body.modulos).toEqual(["customers", "delivery"]);

      const [restaurant] = await ctx.sql`
        SELECT nombre, slug, zona_horaria, direccion, telefono, payment_methods,
               metodos_pago_permitidos
        FROM   public.restaurante WHERE id = ${id}
      `;
      expect(restaurant).toMatchObject({
        nombre: "Bar Nuevo",
        slug: "bar-nuevo",
        zona_horaria: "Atlantic/Canary",
        direccion: "Calle de prueba 1",
        telefono: "+34900000000",
        // Sin IBAN ni teléfono de Bizum aún: solo los métodos que no necesitan datos.
        payment_methods: ["efectivo", "tarjeta"],
        metodos_pago_permitidos: null,
      });
      const branches = await ctx.sql`
        SELECT nombre, es_principal, direccion, telefono FROM public.sucursal WHERE restaurante_id = ${id}
      `;
      expect(branches).toEqual([
        {
          nombre: "Bar Nuevo Centro",
          es_principal: true,
          direccion: "Calle de prueba 1",
          telefono: "+34900000000",
        },
      ]);
      const [plan] =
        await ctx.sql`SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${id}`;
      expect(plan?.plan_code).toBe("basico");
      expect(await modules(id)).toEqual([
        expect.objectContaining({ modulo_code: "customers", estado: "activo", origen: "plan" }),
        expect.objectContaining({ modulo_code: "delivery", estado: "activo", origen: "plan" }),
      ]);

      // Invitación con el rol plantilla Propietario, para ese email y todos los locales.
      const [invite] = await ctx.sql`
        SELECT i.email, i.sucursal_ids, i.created_by::text AS created_by, i.used_at, r.code AS rol
        FROM   public.restaurant_invites i JOIN public.rol r ON r.id = i.rol_id
        WHERE  i.restaurante_id = ${id}
      `;
      expect(invite).toEqual({
        email: "dueno@nuevo.test",
        sucursal_ids: [],
        created_by: USERS.platformAdmin.userId,
        used_at: null,
        rol: "owner",
      });
      expect(result.body.invitacion).toMatchObject({
        email: "dueno@nuevo.test",
        email_enviado: true,
        enlace: `https://panel.test/panel/unirse/${result.body.invitacion.token}`,
      });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe("dueno@nuevo.test");
      expect(sent[0]?.text).toContain(result.body.invitacion.enlace);

      // La persona invitada entra con ese enlace y queda como propietaria.
      const accepted = await ctx.app.request(
        `/me/invitaciones/${result.body.invitacion.token}/aceptar`,
        {
          method: "POST",
          headers: { ...auth("newcomer"), "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: "Dueña" }),
        },
      );
      // El email de la invitación no es el del usuario de prueba: se rechaza (es personal).
      expect(accepted.status).toBe(409);

      const [audited] = await ctx.sql`
        SELECT actor_tipo, actor_id, restaurante_id, accion, resultado, detalle
        FROM   public.auditoria WHERE accion = 'plataforma.restaurante.crear' AND restaurante_id = ${id}
      `;
      expect(audited).toMatchObject({
        actor_tipo: "plataforma",
        actor_id: USERS.platformAdmin.userId,
        resultado: "ok",
      });
      expect(audited?.detalle).toMatchObject({ slug: "bar-nuevo", plan: "basico" });

      // El restaurante nuevo ya se ve en la lista y en su carta pública.
      const list = await call("platformAdmin", "GET", "/plataforma/restaurantes?q=bar-nuevo");
      expect(list.body.restaurantes[0]).toMatchObject({
        id,
        plan: "basico",
        locales: 1,
        miembros: 0,
        pedidos_30d: 0,
        ultimo_pedido: null,
      });
    });

    it("sin mailer ni URL conocida no envía email y devuelve el token", async () => {
      const result = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "sin-correo", nombre: "Sin Correo", plan: "premium" }),
      );
      expect(result.status).toBe(201);
      expect(result.body.invitacion).toMatchObject({ email_enviado: false, enlace: null });
      expect(result.body.invitacion.token).toMatch(/^[0-9a-f-]{36}$/);
      // Premium trae sus 8 módulos de plan.
      expect(await modules(result.body.id)).toHaveLength(8);
    });

    it("rechaza slug duplicado, reservado o con mal formato", async () => {
      const post = (slug: string) =>
        call("platformAdmin", "POST", "/plataforma/restaurantes", newRestaurant({ slug }));
      const duplicated = await post("prueba-a");
      expect(duplicated.status).toBe(409);
      expect(duplicated.body.reason).toBe("slug_taken");
      for (const reserved of [
        "panel",
        "interno",
        "api",
        "admin",
        "www",
        "plataforma",
        "privacidad",
      ]) {
        const result = await post(reserved);
        expect(result.status, reserved).toBe(422);
        expect(result.body.reason).toBe("slug_reserved");
      }
      expect((await post("Con Mayusculas")).body.reason).toBe("slug_invalid_format");
      expect((await post("ab")).body.reason).toBe("slug_too_short");
      // Los rechazos no dejan nada a medias.
      const [row] =
        await ctx.sql`SELECT count(*)::int AS n FROM public.restaurante WHERE slug = 'panel'`;
      expect(row?.n).toBe(0);
    });

    it("rechaza zona horaria, plan y cuerpo inválidos", async () => {
      const post = (overrides: Record<string, unknown>) =>
        call(
          "platformAdmin",
          "POST",
          "/plataforma/restaurantes",
          newRestaurant({ slug: "x-valido", ...overrides }),
        );
      expect((await post({ zona_horaria: "Canarias" })).body.reason).toBe("invalid_time_zone");
      expect((await post({ plan: "gold" })).body.reason).toBe("unknown_plan");
      expect((await post({ propietario_email: "no-es-email" })).status).toBe(400);
      expect((await post({ nombre: "  " })).status).toBe(400);
      expect((await post({ local: { nombre: "" } })).status).toBe(400);
    });
  });

  describe("alta completa y carta", () => {
    const week = [
      ["Lunes", "08:00", "23:00"],
      ["Martes", "08:00", "23:00"],
      ["Miércoles", "08:00", "23:00"],
      ["Jueves", "08:00", "23:00"],
      ["Viernes", "08:00", "23:00"],
      ["Sábado", "09:00", "23:00"],
      ["Domingo", "09:00", "23:00"],
    ].map(([dia, apertura, cierre]) => ({ dia, disponible: true, apertura, cierre }));

    const full = (overrides: Record<string, unknown> = {}) =>
      newRestaurant({
        slug: "alta-completa",
        nombre: "Alta Completa",
        plan: "premium",
        ubicacion: { lat: 28.9780689, lng: -13.5697294 },
        horario: week,
        recogida_minutos: 30,
        zona_reparto: { radio_km: 5, tarifa: 2, minimo: 30, minutos: 30 },
        metodos_pago: ["efectivo", "tarjeta"],
        ...overrides,
      });

    it("crea ubicación, horario, recogida, zona de reparto y métodos de cobro", async () => {
      const result = await call("platformAdmin", "POST", "/plataforma/restaurantes", full());
      expect(result.status).toBe(201);
      const id = result.body.id as number;
      const [restaurant] = await ctx.sql<
        { lat: string; long: string; payment_methods: string[]; pickup_enabled: boolean }[]
      >`SELECT lat, long, payment_methods, pickup_enabled FROM public.restaurante WHERE id = ${id}`;
      expect(Number(restaurant?.lat)).toBeCloseTo(28.9780689, 6);
      expect(Number(restaurant?.long)).toBeCloseTo(-13.5697294, 6);
      expect(restaurant?.payment_methods).toEqual(["efectivo", "tarjeta"]);
      const [branch] = await ctx.sql<{ lat: string; acepta_reparto: boolean }[]>`
        SELECT lat, acepta_reparto FROM public.sucursal WHERE restaurante_id = ${id} AND es_principal
      `;
      expect(Number(branch?.lat)).toBeCloseTo(28.9780689, 6);
      expect(branch?.acepta_reparto).toBe(true);
      const days = await ctx.sql<{ dia: string; apertura_1: string; cierre_1: string }[]>`
        SELECT dia, apertura_1::text, cierre_1::text FROM public.horarios
        WHERE restaurante_id = ${id} ORDER BY id
      `;
      expect(days).toHaveLength(7);
      expect(days[5]).toMatchObject({
        dia: "Sábado",
        apertura_1: "09:00:00",
        cierre_1: "23:00:00",
      });
      const [zone] = await ctx.sql<
        {
          fee: string;
          min_order_amount: string;
          radius_km: string;
          estimated_minutes_max: number;
        }[]
      >`SELECT fee, min_order_amount, radius_km, estimated_minutes_max
        FROM public.delivery_zone WHERE restaurante_id = ${id}`;
      expect(zone).toMatchObject({ estimated_minutes_max: 30 });
      expect(Number(zone?.fee)).toBe(2);
      expect(Number(zone?.min_order_amount)).toBe(30);
      expect(Number(zone?.radius_km)).toBe(5);
      const [config] = await ctx.sql<{ config_value: string }[]>`
        SELECT config_value FROM public.restaurante_config
        WHERE restaurante_id = ${id} AND config_key = 'pickup_eta_minutes'
      `;
      expect(config?.config_value).toBe("30");
      const [log] = await ctx.sql<{ detalle: { completo: Record<string, unknown> } }[]>`
        SELECT detalle FROM public.auditoria
        WHERE restaurante_id = ${id} AND accion = 'plataforma.restaurante.crear'
      `;
      expect(log?.detalle.completo).toMatchObject({ ubicacion: true, horario: 7, reparto: true });
    });

    it("un día cerrado no guarda horas; sin los campos opcionales no crea nada extra", async () => {
      const closed = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        full({
          slug: "dia-cerrado",
          horario: [{ dia: "Lunes", disponible: false }],
          zona_reparto: undefined,
        }),
      );
      expect(closed.status).toBe(201);
      const [monday] = await ctx.sql<{ disponible: boolean; apertura_1: string | null }[]>`
        SELECT disponible, apertura_1::text FROM public.horarios WHERE restaurante_id = ${closed.body.id}
      `;
      expect(monday).toEqual({ disponible: false, apertura_1: null });
      const basic = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "basico-2" }),
      );
      const [counts] = await ctx.sql<{ dias: number; zonas: number }[]>`
        SELECT (SELECT count(*)::int FROM public.horarios WHERE restaurante_id = ${basic.body.id}) AS dias,
               (SELECT count(*)::int FROM public.delivery_zone WHERE restaurante_id = ${basic.body.id}) AS zonas
      `;
      expect(counts).toEqual({ dias: 0, zonas: 0 });
    });

    it("rechaza horario repetido o incompleto, zona sin ubicación y métodos que piden datos", async () => {
      const post = (overrides: Record<string, unknown>) =>
        call(
          "platformAdmin",
          "POST",
          "/plataforma/restaurantes",
          full({ slug: "x-invalido", ...overrides }),
        );
      expect((await post({ horario: [week[0], week[0]] })).status).toBe(400);
      expect((await post({ horario: [{ dia: "Lunes", disponible: true }] })).status).toBe(400);
      expect(
        (
          await post({
            horario: [{ dia: "Lunes", disponible: true, apertura: "8:00", cierre: "23:00" }],
          })
        ).status,
      ).toBe(400);
      expect((await post({ ubicacion: undefined })).status).toBe(400);
      expect((await post({ reparto: false })).status).toBe(400);
      expect((await post({ metodos_pago: ["transferencia"] })).status).toBe(400);
      expect(
        (await post({ zona_reparto: { radio_km: 0, tarifa: 2, minimo: 30, minutos: 30 } })).status,
      ).toBe(400);
      const [none] = await ctx.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM public.restaurante WHERE slug = 'x-invalido'`;
      expect(none?.n).toBe(0);
    });

    const csv = [
      "categoria;producto;descripcion;variante;precio;por_defecto",
      "Arepas;Arepa frita;Maíz frito;;3,00;",
      "Salchipapas;Salchipapas;Con salchicha;Mini;4,50;",
      "Salchipapas;Salchipapas;;XL;10,00;",
    ].join("\n");

    it("importa la carta: categorías, productos, variantes y precio base", async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "con-carta" }),
      );
      const id = created.body.id as number;
      const before = await call("platformSupport", "GET", `/plataforma/restaurantes/${id}`);
      expect(before.body.carta).toEqual({ categorias: 0, productos: 0 });
      const simulated = await call(
        "platformAdmin",
        "POST",
        `/plataforma/restaurantes/${id}/carta/importar?simular=1`,
        { texto: csv },
      );
      expect(simulated.status).toBe(200);
      expect(simulated.body).toMatchObject({
        simulacion: true,
        categorias: 2,
        productos: 2,
        precios: 3,
      });
      expect(
        (await call("platformSupport", "GET", `/plataforma/restaurantes/${id}`)).body.carta
          .productos,
      ).toBe(0);

      const result = await call(
        "platformAdmin",
        "POST",
        `/plataforma/restaurantes/${id}/carta/importar`,
        { texto: csv },
      );
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({
        simulacion: false,
        categorias: 2,
        productos: 2,
        precios: 3,
      });
      const rows = await ctx.sql<
        {
          categoria: string;
          producto: string;
          base: string;
          variante: string;
          precio: string;
          def: boolean;
        }[]
      >`
        SELECT mc.name AS categoria, mi.name AS producto, mi.base_price AS base,
               mv.variant_name AS variante, mv.price AS precio, mv.is_default AS def
        FROM   public.menu_category mc
        JOIN   public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
        JOIN   public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
        WHERE  mc.restaurante_id = ${id} ORDER BY mc.sort_order, mv.sort_order
      `;
      expect(
        rows.map((r) => [r.categoria, r.variante, Number(r.precio), Number(r.base), r.def]),
      ).toEqual([
        ["Arepas", "Única", 3, 3, true],
        ["Salchipapas", "Mini", 4.5, 4.5, true],
        ["Salchipapas", "XL", 10, 4.5, false],
      ]);
      const after = await call("platformSupport", "GET", `/plataforma/restaurantes/${id}`);
      expect(after.body.carta).toEqual({ categorias: 2, productos: 2 });
      const [log] = await ctx.sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM public.auditoria WHERE restaurante_id = ${id} AND accion = 'plataforma.carta.importar'`;
      expect(log?.n).toBe(1);
    });

    it("no pisa una carta existente, valida el texto y solo la importa un admin", async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "carta-dos" }),
      );
      const url = `/plataforma/restaurantes/${created.body.id}/carta/importar`;
      const bad = await call("platformAdmin", "POST", url, { texto: "A;P;;;gratis\n;Q;;;2" });
      expect(bad.status).toBe(422);
      expect(bad.body.reason).toBe("invalid_menu");
      expect(bad.body.errores.map((e: { line: number; code: string }) => [e.line, e.code])).toEqual(
        [
          [1, "invalid_price"],
          [2, "missing_category"],
        ],
      );
      expect((await call("platformAdmin", "POST", url, {})).status).toBe(400);
      expect((await call("platformSupport", "POST", url, { texto: csv })).status).toBe(403);
      expect((await call("platformAdmin", "POST", url, { texto: csv })).status).toBe(201);
      const again = await call("platformAdmin", "POST", url, { texto: csv });
      expect(again.status).toBe(409);
      expect(again.body.reason).toBe("menu_already_loaded");
      expect(
        (
          await call("platformAdmin", "POST", "/plataforma/restaurantes/999999/carta/importar", {
            texto: csv,
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("roles por restaurante", () => {
    let restauranteId: number;
    const url = () => `/plataforma/restaurantes/${restauranteId}/roles`;

    beforeAll(async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "con-roles", nombre: "Con Roles", plan: "basico" }),
      );
      restauranteId = created.body.id;
    });

    it("lista plantillas y roles propios con su uso, y el catálogo marca los módulos inactivos", async () => {
      const result = await call("platformSupport", "GET", url());
      expect(result.status).toBe(200);
      const codes = result.body.roles.map((role: { code: string }) => role.code);
      expect(codes).toEqual(expect.arrayContaining(["owner", "manager"]));
      expect(
        result.body.roles.every(
          (role: { plantilla: boolean; editable: boolean }) => role.editable === !role.plantilla,
        ),
      ).toBe(true);
      const groups = result.body.catalogo as {
        modulo: string;
        activo: boolean;
        permisos: { code: string }[];
      }[];
      expect(groups.find((group) => group.modulo === "core.orders")?.activo).toBe(true);
      // El plan básico no trae las mesas.
      expect(groups.find((group) => group.modulo === "tables")?.activo).toBe(false);
      expect(
        (await call("platformAdmin", "GET", "/plataforma/restaurantes/999999/roles")).status,
      ).toBe(404);
    });

    it("crea, edita y borra un rol propio, con auditoría", async () => {
      const created = await call("platformAdmin", "POST", url(), {
        nombre: "Cajero de noche",
        permisos: ["orders.view", "orders.change_status"],
      });
      expect(created.status).toBe(201);
      const roleId = created.body.id as number;
      const [row] = await ctx.sql<
        { code: string; es_plantilla: boolean; restaurante_id: number }[]
      >`
        SELECT code, es_plantilla, restaurante_id FROM public.rol WHERE id = ${roleId}
      `;
      expect(row).toMatchObject({
        code: "r_cajero_de_noche",
        es_plantilla: false,
        restaurante_id: restauranteId,
      });

      const edited = await call("platformAdmin", "PUT", `${url()}/${roleId}`, {
        nombre: "Cajero nocturno",
        permisos: ["orders.view"],
      });
      expect(edited.status).toBe(200);
      const perms = await ctx.sql<
        { permiso_code: string }[]
      >`SELECT permiso_code FROM public.rol_permiso WHERE rol_id = ${roleId}`;
      expect(perms.map((p) => p.permiso_code)).toEqual(["orders.view"]);

      expect((await call("platformAdmin", "DELETE", `${url()}/${roleId}`)).status).toBe(200);
      const actions = await ctx.sql<{ accion: string }[]>`
        SELECT accion FROM public.auditoria
        WHERE restaurante_id = ${restauranteId} AND accion LIKE 'plataforma.rol.%' ORDER BY id
      `;
      expect(actions.map((a) => a.accion)).toEqual([
        "plataforma.rol.crear",
        "plataforma.rol.editar",
        "plataforma.rol.borrar",
      ]);
    });

    it("rechaza nombres repetidos, permisos desconocidos, plantillas y a soporte", async () => {
      const ok = await call("platformAdmin", "POST", url(), {
        nombre: "Ayudante",
        permisos: ["orders.view"],
      });
      expect(ok.status).toBe(201);
      const duplicate = await call("platformAdmin", "POST", url(), {
        nombre: "ayudante",
        permisos: ["orders.view"],
      });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.reason).toBe("duplicate_name");
      const template = await call("platformAdmin", "POST", url(), {
        nombre: "Propietario",
        permisos: ["orders.view"],
      });
      expect(template.status).toBe(409);
      expect(
        (await call("platformAdmin", "POST", url(), { nombre: "X1", permisos: ["no.existe"] }))
          .status,
      ).toBe(400);
      expect(
        (await call("platformAdmin", "POST", url(), { nombre: "X2", permisos: [] })).status,
      ).toBe(400);
      expect(
        (
          await call("platformSupport", "POST", url(), {
            nombre: "Otro",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(403);

      const [owner] = await ctx.sql<
        { id: number }[]
      >`SELECT id FROM public.rol WHERE code = 'owner' AND restaurante_id IS NULL`;
      const onTemplate = await call("platformAdmin", "PUT", `${url()}/${owner?.id}`, {
        nombre: "Dueño",
        permisos: ["orders.view"],
      });
      expect(onTemplate.status).toBe(422);
      expect(onTemplate.body.reason).toBe("template_role");
      expect((await call("platformAdmin", "DELETE", `${url()}/${owner?.id}`)).status).toBe(422);
      expect(
        (
          await call("platformAdmin", "PUT", `${url()}/999999`, {
            nombre: "Zz",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(404);
    });

    it("no se puede tocar el rol de otro restaurante ni borrar uno en uso o con invitaciones", async () => {
      const other = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "otro-roles", nombre: "Otro" }),
      );
      const foreign = await call(
        "platformAdmin",
        "POST",
        `/plataforma/restaurantes/${other.body.id}/roles`,
        { nombre: "Ajeno", permisos: ["orders.view"] },
      );
      expect(
        (
          await call("platformAdmin", "PUT", `${url()}/${foreign.body.id}`, {
            nombre: "Robado",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(404);
      expect((await call("platformAdmin", "DELETE", `${url()}/${foreign.body.id}`)).status).toBe(
        404,
      );

      const used = await call("platformAdmin", "POST", url(), {
        nombre: "En uso",
        permisos: ["orders.view"],
      });
      await ctx.sql`
        WITH m AS (
          INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email)
          VALUES ('00000000-0000-0000-0000-0000000000aa'::uuid, ${restauranteId}, 'viewer', 'uso@test.local')
          RETURNING id)
        INSERT INTO public.membresia_rol (membership_id, rol_id) SELECT id, ${used.body.id}::bigint FROM m
      `;
      const blocked = await call("platformAdmin", "DELETE", `${url()}/${used.body.id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.reason).toBe("role_in_use");
      const edit = await call("platformAdmin", "PUT", `${url()}/${used.body.id}`, {
        nombre: "En uso",
        permisos: ["orders.view", "orders.change_status"],
      });
      expect(edit.body.miembros_afectados).toBe(1);

      const invited = await call("platformAdmin", "POST", url(), {
        nombre: "Invitado",
        permisos: ["orders.view"],
      });
      await ctx.sql`
        INSERT INTO public.restaurant_invites (restaurante_id, rol, rol_id, sucursal_ids, email, created_by, expires_at)
        VALUES (${restauranteId}, 'viewer', ${invited.body.id}, '{}'::bigint[], 'inv@test.local', '00000000-0000-0000-0000-0000000000aa'::uuid, (now() AT TIME ZONE 'UTC') + interval '3 days')
      `;
      const pending = await call("platformAdmin", "DELETE", `${url()}/${invited.body.id}`);
      expect(pending.status).toBe(409);
      expect(pending.body.reason).toBe("pending_invites");
    });
  });

  describe("plantillas de Konnecttia", () => {
    const BASE = ["owner", "manager", "staff", "viewer", "waiter", "driver"];
    const list = () => call("platformSupport", "GET", "/plataforma/plantillas");
    const create = (nombre: string, permisos = ["orders.view", "orders.create"]) =>
      call("platformAdmin", "POST", "/plataforma/plantillas", { nombre, permisos });

    it("lista las seis base (editables, no borrables) y el catálogo de permisos por módulo", async () => {
      const result = await list();
      expect(result.status).toBe(200);
      const base = result.body.plantillas.filter((t: { base: boolean }) => t.base);
      expect(base.map((t: { code: string }) => t.code)).toEqual(expect.arrayContaining(BASE));
      expect(base.every((t: { editable: boolean }) => t.editable)).toBe(true);
      expect(base.every((t: { borrable: boolean }) => !t.borrable)).toBe(true);
      const orders = result.body.catalogo.find(
        (group: { modulo: string }) => group.modulo === "core.orders",
      );
      expect(orders.permisos[0]).toMatchObject({ code: "orders.view" });
    });

    it("solo el equipo de Konnecttia entra; soporte lee pero no escribe", async () => {
      expect((await call("ownerA", "GET", "/plataforma/plantillas")).status).toBe(403);
      expect((await call(null, "GET", "/plataforma/plantillas")).status).toBe(401);
      const denied = await call("platformSupport", "POST", "/plataforma/plantillas", {
        nombre: "Nada",
        permisos: ["orders.view"],
      });
      expect(denied.status).toBe(403);
    });

    it("crea, ve desde un restaurante, edita y borra una plantilla, con auditoría global", async () => {
      const created = await create("Cajero Konnecttia");
      expect(created.status).toBe(201);
      const id = created.body.id as number;
      const mine = (await list()).body.plantillas.find((t: { id: number }) => t.id === id);
      expect(mine).toMatchObject({
        code: "t_cajero_konnecttia",
        base: false,
        editable: true,
        permisos: ["orders.create", "orders.view"],
        miembros: 0,
      });

      // Todos los restaurantes la ven como plantilla y el propietario puede personalizarla.
      const roles = await call("ownerA", "GET", "/panel/prueba-a/equipo/roles");
      expect(roles.body.roles.find((r: { id: number }) => r.id === id)).toMatchObject({
        plantilla: true,
        editable: false,
        personalizable: true,
      });

      const edited = await call("platformAdmin", "PUT", `/plataforma/plantillas/${id}`, {
        nombre: "Cajero Konnecttia",
        permisos: ["orders.view", "orders.create", "orders.change_status"],
      });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ id, miembros_afectados: 0 });
      expect((await call("platformAdmin", "DELETE", `/plataforma/plantillas/${id}`)).status).toBe(
        200,
      );
      const trail = await ctx.sql<{ accion: string; restaurante_id: number | null }[]>`
        SELECT accion, restaurante_id FROM public.auditoria
        WHERE  recurso_tipo = 'rol_plantilla' AND recurso_id = ${String(id)} ORDER BY id
      `;
      expect(trail.map((row) => row.accion)).toEqual([
        "plataforma.plantilla.crear",
        "plataforma.plantilla.editar",
        "plataforma.plantilla.borrar",
      ]);
      expect(trail.every((row) => row.restaurante_id === null)).toBe(true);
    });

    it("valida el cuerpo y rechaza nombres repetidos (plantillas y roles de restaurantes)", async () => {
      expect((await create("x")).status).toBe(400);
      expect((await create("Bien", [])).status).toBe(400);
      expect((await create("Bien", ["no.existe"])).status).toBe(400);
      expect((await create("consulta")).body.reason).toBe("duplicate_name");
      const own = await call("ownerA", "POST", "/panel/prueba-a/equipo/roles", {
        nombre: "Rol de la casa",
        permisos: ["orders.view"],
      });
      expect(own.status).toBe(201);
      expect((await create("rol de la casa")).body.reason).toBe("duplicate_name");
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${own.body.id}`);
      // Con el mismo nombre dos veces, la segunda falla.
      const first = await create("Turno de noche");
      expect(first.status).toBe(201);
      expect((await create("Turno de noche")).status).toBe(409);
      await call("platformAdmin", "DELETE", `/plataforma/plantillas/${first.body.id}`);
    });

    it("las seis base no se borran y Propietario conserva equipo y ajustes", async () => {
      const all = (await list()).body.plantillas as { id: number; code: string }[];
      for (const code of ["owner", "viewer"]) {
        const base = all.find((t) => t.code === code);
        const del = await call("platformAdmin", "DELETE", `/plataforma/plantillas/${base?.id}`);
        expect(del.status).toBe(422);
        expect(del.body.reason).toBe("base_template");
      }
      const owner = all.find((t) => t.code === "owner");
      const locked = await call("platformAdmin", "PUT", `/plataforma/plantillas/${owner?.id}`, {
        nombre: "Propietario",
        permisos: ["orders.view"],
      });
      expect(locked.status).toBe(422);
      expect(locked.body.reason).toBe("owner_locked");
      expect(
        (
          await call("platformAdmin", "PUT", "/plataforma/plantillas/999999", {
            nombre: "Nada",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(404);
    });

    it("una base admite quitar y añadir permisos, conserva el nombre y se audita", async () => {
      const before = (await list()).body.plantillas as {
        id: number;
        code: string;
        nombre: string;
        permisos: string[];
        por_defecto: string[];
        editable: boolean;
        borrable: boolean;
      }[];
      const viewer = before.find((t) => t.code === "viewer");
      if (!viewer) throw new Error("falta viewer");
      expect(viewer.editable).toBe(true);
      expect(viewer.borrable).toBe(false);
      const changed = [...viewer.permisos.filter((p) => p !== "tables.view"), "customers.view"];
      try {
        const put = await call("platformAdmin", "PUT", `/plataforma/plantillas/${viewer.id}`, {
          nombre: "Otro nombre",
          permisos: changed,
        });
        expect(put.status).toBe(200);
        const after = (await list()).body.plantillas.find(
          (t: { code: string }) => t.code === "viewer",
        );
        expect(after.nombre).toBe(viewer.nombre);
        expect([...after.permisos].sort()).toEqual([...changed].sort());
      } finally {
        await call("platformAdmin", "PUT", `/plataforma/plantillas/${viewer.id}`, {
          nombre: viewer.nombre,
          permisos: viewer.por_defecto,
        });
      }
    });

    it("al editar dice a cuánta gente afecta y no borra una plantilla en uso", async () => {
      const created = await create("Plantilla de apoyo");
      expect(created.body).toMatchObject({ id: expect.any(Number) });
      const id = created.body.id as number;
      const [member] = await ctx.sql<{ id: number }[]>`
        SELECT id::int AS id FROM public.local_memberships
        WHERE  user_id = '00000000-0000-0000-0000-0000000000a2'
      `;
      await ctx.sql`INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${member?.id ?? 0}, ${id})`;
      const edited = await call("platformAdmin", "PUT", `/plataforma/plantillas/${id}`, {
        nombre: "Plantilla de apoyo",
        permisos: ["orders.view"],
      });
      expect(edited.body.miembros_afectados).toBe(1);
      expect((await list()).body.plantillas.find((t: { id: number }) => t.id === id)).toMatchObject(
        {
          miembros: 1,
          restaurantes: 1,
        },
      );
      const blocked = await call("platformAdmin", "DELETE", `/plataforma/plantillas/${id}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.reason).toBe("role_in_use");

      await ctx.sql`DELETE FROM public.membresia_rol WHERE rol_id = ${id}`;
      const invite = await call("ownerA", "POST", "/panel/prueba-a/equipo/invitaciones", {
        rol_id: id,
        email: null,
        sucursal_ids: [],
      });
      expect(invite.status).toBe(201);
      expect(
        (await call("platformAdmin", "DELETE", `/plataforma/plantillas/${id}`)).body.reason,
      ).toBe("pending_invites");
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/invitaciones/${invite.body.id}`);
      expect((await call("platformAdmin", "DELETE", `/plataforma/plantillas/${id}`)).status).toBe(
        200,
      );
    });
  });

  describe("plan y módulos", () => {
    it("cambiar de plan conserva los complementos y las cortesías", async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({ slug: "cambia-plan", nombre: "Cambia Plan", plan: "premium" }),
      );
      const id = created.body.id as number;
      const base = `/plataforma/restaurantes/${id}`;
      // Complemento y cortesía: el agente necesita antes el canal de WhatsApp.
      expect(
        (
          await call("platformAdmin", "PUT", `${base}/modulos/whatsapp.channel`, {
            estado: "activo",
            origen: "complemento",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("platformAdmin", "PUT", `${base}/modulos/whatsapp.agent`, {
            estado: "activo",
            origen: "cortesia",
          })
        ).status,
      ).toBe(200);

      const down = await call("platformAdmin", "PUT", `${base}/plan`, { plan: "basico" });
      expect(down.status).toBe(200);
      expect(down.body).toMatchObject({ plan: "basico", anterior: "premium" });
      expect(down.body.modulos_quitados).toEqual([
        "analytics",
        "locations.multi",
        "menu_i18n",
        "news_reviews",
        "scheduled_orders",
        "tables",
      ]);
      expect(down.body.modulos_anadidos).toEqual([]);
      expect((await modules(id)).map((m) => `${m.modulo_code}:${m.origen}`)).toEqual([
        "customers:plan",
        "delivery:plan",
        "whatsapp.agent:cortesia",
        "whatsapp.channel:complemento",
      ]);

      const up = await call("platformAdmin", "PUT", `${base}/plan`, { plan: "premium" });
      expect(up.body.modulos_anadidos).toHaveLength(6);
      expect((await modules(id)).map((m) => m.modulo_code)).toContain("whatsapp.agent");
      const [plan] =
        await ctx.sql`SELECT plan_code FROM public.restaurante_plan WHERE restaurante_id = ${id}`;
      expect(plan?.plan_code).toBe("premium");
      expect((await call("platformAdmin", "PUT", `${base}/plan`, { plan: "oro" })).status).toBe(
        422,
      );
      expect(
        (
          await call("platformAdmin", "PUT", "/plataforma/restaurantes/999999/plan", {
            plan: "basico",
          })
        ).status,
      ).toBe(404);
    });

    it("respeta depende_de al activar y al suspender", async () => {
      const base = "/plataforma/restaurantes/102";
      const put = (code: string, payload: unknown) =>
        call("platformAdmin", "PUT", `${base}/modulos/${code}`, payload);

      // Sin el canal de WhatsApp no se activa el agente.
      const noChannel = await put("whatsapp.agent", { estado: "activo", origen: "complemento" });
      expect(noChannel.status).toBe(422);
      expect(noChannel.body).toMatchObject({
        reason: "dependency_missing",
        modulos: ["whatsapp.channel"],
      });

      expect((await put("whatsapp.channel", { estado: "activo" })).body.reason).toBe(
        "origin_required",
      );
      expect(
        (await put("whatsapp.channel", { estado: "activo", origen: "complemento" })).status,
      ).toBe(200);
      expect(
        (await put("whatsapp.agent", { estado: "activo", origen: "complemento" })).status,
      ).toBe(200);

      // No se suspende el canal mientras el agente lo use.
      const blocked = await put("whatsapp.channel", { estado: "suspendido" });
      expect(blocked.status).toBe(409);
      expect(blocked.body).toMatchObject({ reason: "has_dependents", modulos: ["whatsapp.agent"] });
      expect((await put("whatsapp.agent", { estado: "suspendido" })).status).toBe(200);
      expect((await put("whatsapp.channel", { estado: "cancelado" })).status).toBe(200);
      const states = await modules(102);
      expect(states.find((m) => m.modulo_code === "whatsapp.channel")?.estado).toBe("cancelado");
      expect(states.find((m) => m.modulo_code === "whatsapp.agent")?.estado).toBe("suspendido");

      // Se reactiva el agente solo con el canal activo de nuevo.
      expect((await put("whatsapp.agent", { estado: "activo" })).status).toBe(422);
      expect((await put("whatsapp.channel", { estado: "activo" })).status).toBe(200);
      expect((await put("whatsapp.agent", { estado: "activo" })).status).toBe(200);
    });

    it("no gestiona módulos básicos, futuros ni desconocidos; un módulo del plan no cambia de origen", async () => {
      const base = "/plataforma/restaurantes/102";
      const put = (code: string, payload: unknown) =>
        call("platformAdmin", "PUT", `${base}/modulos/${code}`, payload);
      expect((await put("core.orders", { estado: "suspendido" })).body.reason).toBe(
        "module_not_manageable",
      );
      expect(
        (await put("payments.online", { estado: "activo", origen: "cortesia" })).body.reason,
      ).toBe("module_not_manageable");
      expect((await put("no.existe", { estado: "activo", origen: "cortesia" })).status).toBe(404);
      expect((await put("tables", { estado: "suspendido" })).body.reason).toBe("module_not_active");
      expect((await put("delivery", { estado: "activo", origen: "cortesia" })).body.reason).toBe(
        "module_in_plan",
      );
      expect((await put("delivery", { estado: "otro" })).status).toBe(400);
    });

    it("un módulo suspendido deja de dar acceso en el panel del restaurante", async () => {
      expect((await call("ownerB", "GET", "/panel/prueba-b/clientes")).status).toBe(200);
      await call("platformAdmin", "PUT", "/plataforma/restaurantes/102/modulos/customers", {
        estado: "suspendido",
      });
      expect((await call("ownerB", "GET", "/panel/prueba-b/clientes")).status).toBe(403);
      await call("platformAdmin", "PUT", "/plataforma/restaurantes/102/modulos/customers", {
        estado: "activo",
      });
      expect((await call("ownerB", "GET", "/panel/prueba-b/clientes")).status).toBe(200);
    });

    it("cada cambio queda en la auditoría con el restaurante afectado", async () => {
      const rows = await ctx.sql<{ accion: string; restaurante_id: number }[]>`
        SELECT accion, restaurante_id FROM public.auditoria
        WHERE  actor_tipo = 'plataforma' AND resultado = 'ok' AND restaurante_id = 102
        ORDER  BY id
      `;
      expect(rows.length).toBeGreaterThan(3);
      expect(rows.every((row) => row.accion.startsWith("plataforma."))).toBe(true);
    });
  });

  describe("métodos de pago permitidos (K)", () => {
    const path = "/plataforma/restaurantes/101/metodos-pago";

    it("limitan Ajustes, la carta pública y quitan lo que ya no se permite", async () => {
      // A tiene activos efectivo, tarjeta y transferencia.
      const result = await call("platformAdmin", "PUT", path, { metodos: ["efectivo", "tarjeta"] });
      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        permitidos: ["efectivo", "tarjeta"],
        activos: ["efectivo", "tarjeta"],
        metodos_quitados: ["transferencia"],
        sin_metodos_activos: false,
      });

      const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(settings.body.metodos_disponibles).toEqual(["efectivo", "tarjeta"]);
      expect(settings.body.restaurante.metodos_pago).toEqual(["efectivo", "tarjeta"]);

      // Guardar un método no permitido es 422 y no cambia nada.
      const denied = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
        metodos_pago: ["efectivo", "bizum"],
        datos_bancarios: { bizum: "600000000" },
      });
      expect(denied.status).toBe(422);
      expect(denied.body.reason).toBe("payment_method_not_allowed");
      const ok = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
        metodos_pago: ["tarjeta"],
      });
      expect(ok.status).toBe(200);

      const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as {
        restaurante: { metodos_pago: string[] };
      };
      expect(menu.restaurante.metodos_pago).toEqual(["tarjeta"]);

      const card = await call("platformAdmin", "GET", "/plataforma/restaurantes/101");
      expect(card.body.metodos_pago).toMatchObject({
        permitidos: ["efectivo", "tarjeta"],
        activos: ["tarjeta"],
      });
    });

    it("un método no permitido cargado por SQL tampoco aparece en la carta ni en el checkout", async () => {
      await ctx.sql`
        UPDATE public.restaurante SET payment_methods = '["efectivo", "bizum"]'::jsonb WHERE id = 101
      `;
      const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as {
        restaurante: { metodos_pago: string[] };
      };
      expect(menu.restaurante.metodos_pago).toEqual(["efectivo"]);
      const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(settings.body.restaurante.metodos_pago).toEqual(["efectivo"]);
    });

    it("null permite todos de nuevo y avisa si el restaurante se queda sin métodos", async () => {
      const reset = await call("platformAdmin", "PUT", path, { metodos: null });
      expect(reset.status).toBe(200);
      expect(reset.body.permitidos).toBeNull();
      const settings = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(settings.body.metodos_disponibles).toEqual([
        "efectivo",
        "tarjeta",
        "transferencia",
        "bizum",
      ]);

      // B solo tenía efectivo: permitir solo tarjeta lo deja sin métodos activos.
      const empty = await call(
        "platformAdmin",
        "PUT",
        "/plataforma/restaurantes/102/metodos-pago",
        { metodos: ["tarjeta"] },
      );
      expect(empty.body).toMatchObject({
        activos: [],
        metodos_quitados: ["efectivo"],
        sin_metodos_activos: true,
      });
    });

    it("valida la lista", async () => {
      for (const metodos of [[], ["cheque"], ["efectivo", "efectivo"], "efectivo", ["online"]]) {
        expect(
          (await call("platformAdmin", "PUT", path, { metodos })).status,
          JSON.stringify(metodos),
        ).toBe(400);
      }
      expect(
        (
          await call("platformAdmin", "PUT", "/plataforma/restaurantes/999999/metodos-pago", {
            metodos: null,
          })
        ).status,
      ).toBe(404);
    });
  });
});
