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
