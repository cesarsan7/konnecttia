import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function roleId(code: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.rol WHERE code = ${code} AND restaurante_id IS NULL
  `;
  return row?.id ?? 0;
}

describe.skipIf(!TEST_DATABASE_URL)("equipo del restaurante", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lista miembros, roles asignables y locales", async () => {
    const result = await call("ownerA", "GET", "/panel/prueba-a/equipo");
    expect(result.status).toBe(200);
    expect(result.body.miembros).toEqual([
      expect.objectContaining({ email: null, eres_tu: true, locales: "todos" }),
      expect.objectContaining({
        eres_tu: false,
        roles: [expect.objectContaining({ code: "viewer" })],
      }),
    ]);
    expect(result.body.roles.map((role: { code: string }) => role.code)).toEqual([
      "owner",
      "manager",
      "staff",
      "viewer",
      "waiter",
      "driver",
    ]);
    expect(result.body.roles.every((role: { asignable: boolean }) => role.asignable)).toBe(true);
  });

  it("el rol de consulta no ve el equipo; otro restaurante tampoco", async () => {
    expect((await call("viewerA", "GET", "/panel/prueba-a/equipo")).status).toBe(403);
    expect((await call("ownerB", "GET", "/panel/prueba-a/equipo")).status).toBe(403);
  });

  describe("invitaciones", () => {
    it("envía la invitación por email si hay Resend, con el enlace del panel que invita", async () => {
      const sent: { to: string; subject: string; html: string; text: string }[] = [];
      const origin = "https://panel.example.test";
      const app = ctx.appWith({
        allowedOrigins: [origin],
        mailer: { send: async (message) => void sent.push(message) },
      });
      const invite = (email: string | null, headers: Record<string, string> = {}) =>
        roleId("staff").then((rol) =>
          app.request("/panel/prueba-c/equipo/invitaciones", {
            method: "POST",
            headers: { ...auth("ownerC"), "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ email, rol_id: rol, sucursal_ids: [] }),
          }),
        );
      const response = await invite("correo@test.local", { Origin: origin });
      const body = (await response.json()) as { token: string; email_enviado: boolean };
      expect(response.status).toBe(201);
      expect(body.email_enviado).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe("correo@test.local");
      expect(sent[0]?.text).toContain(`${origin}/panel/unirse/${body.token}`);
      expect(sent[0]?.html).toContain("Te han invitado a");

      // Sin email, o sin Origin permitido ni PANEL_PUBLIC_URL, no se envía nada.
      expect(
        ((await (await invite(null, { Origin: origin })).json()) as { email_enviado: boolean })
          .email_enviado,
      ).toBe(false);
      expect(
        (
          (await (await invite("otro@test.local", { Origin: "https://evil.test" })).json()) as {
            email_enviado: boolean;
          }
        ).email_enviado,
      ).toBe(false);
      expect(sent).toHaveLength(1);

      // Si Resend falla, la invitación sigue creada.
      const failing = ctx.appWith({
        panelUrl: origin,
        mailer: {
          send: async () => {
            throw new Error("Resend respondió 500");
          },
        },
      });
      const failed = await failing.request("/panel/prueba-c/equipo/invitaciones", {
        method: "POST",
        headers: { ...auth("ownerC"), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "fallo@test.local", rol_id: await roleId("staff") }),
      });
      expect(failed.status).toBe(201);
      expect(((await failed.json()) as { email_enviado: boolean }).email_enviado).toBe(false);
      await ctx.sql`
        UPDATE public.restaurant_invites SET revocada_at = now()
        WHERE  email IN ('correo@test.local', 'otro@test.local', 'fallo@test.local') OR (email IS NULL AND restaurante_id = 103)
      `;
    });

    it("invita con un enlace y el invitado entra con su rol y locales", async () => {
      const created = await call("ownerC", "POST", "/panel/prueba-c/equipo/invitaciones", {
        email: "Nuevo@Test.local",
        rol_id: await roleId("staff"),
        sucursal_ids: [3002],
      });
      expect(created.status).toBe(201);
      const token = created.body.token;

      const listed = await call("ownerC", "GET", "/panel/prueba-c/equipo");
      expect(listed.body.invitaciones).toEqual([
        expect.objectContaining({ email: "nuevo@test.local", token, locales: [3002] }),
      ]);

      // Otra persona con el enlace no puede usarlo.
      const other = await call("otherPerson", "GET", `/me/invitaciones/${token}`);
      expect(other.body.estado).toBe("otro_email");
      expect(
        (await call("otherPerson", "POST", `/me/invitaciones/${token}/aceptar`)).body.reason,
      ).toBe("otro_email");

      const preview = await call("newcomer", "GET", `/me/invitaciones/${token}`);
      expect(preview.body).toMatchObject({
        estado: "valida",
        restaurante: { slug: "prueba-c" },
        rol: "Personal",
        todos_los_locales: false,
      });
      const accepted = await call("newcomer", "POST", `/me/invitaciones/${token}/aceptar`, {
        nombre: "Nuria Nueva",
      });
      expect(accepted).toMatchObject({ status: 200, body: { slug: "prueba-c" } });

      const access = await call("newcomer", "GET", "/panel/prueba-c/acceso");
      expect(access.body.locales).toEqual([3002]);
      expect(access.body.permisos).toContain("orders.view");
      expect(access.body.permisos).not.toContain("menu.update");

      // Un enlace solo vale una vez.
      expect(
        (await call("newcomer", "POST", `/me/invitaciones/${token}/aceptar`)).body.reason,
      ).toBe("usada");
    });

    it("las invitaciones caducan y se pueden anular", async () => {
      const staff = await roleId("staff");
      const created = await call("ownerA", "POST", "/panel/prueba-a/equipo/invitaciones", {
        rol_id: staff,
      });
      await ctx.sql`
        UPDATE public.restaurant_invites SET expires_at = '2026-01-01' WHERE id = ${created.body.id}
      `;
      expect(
        (await call("otherPerson", "GET", `/me/invitaciones/${created.body.token}`)).body.estado,
      ).toBe("caducada");

      const second = await call("ownerA", "POST", "/panel/prueba-a/equipo/invitaciones", {
        rol_id: staff,
      });
      expect(
        (await call("ownerB", "DELETE", `/panel/prueba-b/equipo/invitaciones/${second.body.id}`))
          .status,
      ).toBe(404);
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/equipo/invitaciones/${second.body.id}`))
          .status,
      ).toBe(200);
      expect(
        (await call("otherPerson", "GET", `/me/invitaciones/${second.body.token}`)).body.estado,
      ).toBe("anulada");
    });

    it("rechaza roles y locales ajenos, y emails que ya son del equipo", async () => {
      const [foreignRole] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.rol (restaurante_id, code, nombre) VALUES (102, 'cajero', 'Cajero')
        RETURNING id
      `;
      const path = "/panel/prueba-a/equipo/invitaciones";
      expect((await call("ownerA", "POST", path, { rol_id: foreignRole?.id })).body.reason).toBe(
        "unknown_role",
      );
      expect(
        (
          await call("ownerA", "POST", path, {
            rol_id: await roleId("staff"),
            sucursal_ids: [3002],
          })
        ).body.reason,
      ).toBe("unknown_branch");
      await ctx.sql`UPDATE public.local_memberships SET email = 'owner-a@test.local' WHERE user_id = ${"00000000-0000-0000-0000-0000000000a1"}::uuid`;
      expect(
        (
          await call("ownerA", "POST", path, {
            rol_id: await roleId("staff"),
            email: "owner-a@test.local",
          })
        ).body.reason,
      ).toBe("already_member");
    });

    it("sin team.manage no se invita (el encargado no gestiona el equipo)", async () => {
      const result = await call("managerPlaya", "POST", "/panel/prueba-c/equipo/invitaciones", {
        rol_id: await roleId("staff"),
        sucursal_ids: [3002],
      });
      expect(result).toMatchObject({ status: 403, body: { permission: "team.manage" } });
    });
  });

  describe("miembros", () => {
    async function memberId(user: User, slug: string) {
      const list = await call("ownerC", "GET", `/panel/${slug}/equipo`);
      return list.body.miembros.find(
        (member: { email: string }) => member.email === USERS_EMAIL[user],
      )?.id;
    }
    const USERS_EMAIL: Partial<Record<User, string>> = { newcomer: "nuevo@test.local" };

    it("cambia rol y locales de un miembro y queda en la auditoría", async () => {
      const id = await memberId("newcomer", "prueba-c");
      const result = await call("ownerC", "PATCH", `/panel/prueba-c/equipo/miembros/${id}`, {
        rol_id: await roleId("manager"),
        sucursal_ids: [],
      });
      expect(result.status).toBe(200);
      const access = await call("newcomer", "GET", "/panel/prueba-c/acceso");
      expect(access.body.locales).toBe("todos");
      expect(access.body.permisos).toContain("menu.update");
      const [legacy] = await ctx.sql<
        { rol: string }[]
      >`SELECT rol FROM public.local_memberships WHERE id = ${id}`;
      expect(legacy?.rol).toBe("manager");
      const trail = await ctx.sql`
        SELECT 1 FROM public.auditoria WHERE accion = 'team.update' AND recurso_id = ${String(id)}
      `;
      expect(trail.length).toBe(1);
    });

    it("nadie se cambia ni se quita a sí mismo", async () => {
      const list = await call("ownerC", "GET", "/panel/prueba-c/equipo");
      const self = list.body.miembros.find((member: { eres_tu: boolean }) => member.eres_tu);
      expect(
        (
          await call("ownerC", "PATCH", `/panel/prueba-c/equipo/miembros/${self.id}`, {
            rol_id: await roleId("staff"),
          })
        ).body.reason,
      ).toBe("self_change");
      expect(
        (await call("ownerC", "DELETE", `/panel/prueba-c/equipo/miembros/${self.id}`)).body.reason,
      ).toBe("self_change");
    });

    it("quita el acceso a un miembro y deja de entrar", async () => {
      const id = await memberId("newcomer", "prueba-c");
      expect((await call("ownerB", "DELETE", `/panel/prueba-b/equipo/miembros/${id}`)).status).toBe(
        404,
      );
      expect((await call("ownerC", "DELETE", `/panel/prueba-c/equipo/miembros/${id}`)).status).toBe(
        200,
      );
      expect((await call("newcomer", "GET", "/panel/prueba-c/acceso")).status).toBe(403);
    });

    it("el último propietario no se puede quitar ni degradar", async () => {
      // Un rol propio de C con todos los permisos (lo crearía el panel de Konnecttia).
      const [admin] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.rol (restaurante_id, code, nombre) VALUES (103, 'socio', 'Socio') RETURNING id
      `;
      await ctx.sql`
        INSERT INTO public.rol_permiso (rol_id, permiso_code)
        SELECT ${admin?.id ?? 0}, rp.permiso_code FROM public.rol_permiso rp
        JOIN public.rol r ON r.id = rp.rol_id WHERE r.code = 'owner' AND r.restaurante_id IS NULL
      `;
      const [membership] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email)
        VALUES (${"00000000-0000-0000-0000-0000000000d2"}::uuid, 103, 'manager', 'otra@test.local')
        RETURNING id
      `;
      await ctx.sql`
        INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${membership?.id ?? 0}, ${admin?.id ?? 0})
      `;
      const list = await call("ownerC", "GET", "/panel/prueba-c/equipo");
      const owner = list.body.miembros.find((member: { eres_tu: boolean }) => member.eres_tu);
      const demote = await call(
        "otherPerson",
        "PATCH",
        `/panel/prueba-c/equipo/miembros/${owner.id}`,
        {
          rol_id: await roleId("manager"),
        },
      );
      expect(demote).toMatchObject({ status: 409, body: { reason: "last_owner" } });
      const remove = await call(
        "otherPerson",
        "DELETE",
        `/panel/prueba-c/equipo/miembros/${owner.id}`,
      );
      expect(remove).toMatchObject({ status: 409, body: { reason: "last_owner" } });
    });
  });

  describe("roles propios", () => {
    const roles = () => call("ownerA", "GET", "/panel/prueba-a/equipo/roles");

    it("lista plantillas (no editables) y el catálogo por módulo", async () => {
      const result = await roles();
      expect(result.status).toBe(200);
      const codes = result.body.roles.map((role: { code: string }) => role.code);
      expect(codes).toEqual(expect.arrayContaining(["owner", "waiter", "driver"]));
      expect(result.body.roles.every((role: { editable: boolean }) => !role.editable)).toBe(true);
      const orders = result.body.catalogo.find(
        (group: { modulo: string }) => group.modulo === "core.orders",
      );
      expect(orders.permisos[0]).toMatchObject({ code: "orders.view", nombre: "Ver pedidos" });
      // Consulta ve los roles, pero no puede crearlos.
      expect((await call("viewerA", "GET", "/panel/prueba-a/equipo/roles")).status).toBe(403);
    });

    it("crea, edita y borra un rol propio, con auditoría", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/equipo/roles", {
        nombre: "Cajero de noche",
        permisos: ["orders.view", "orders.update", "orders.view"],
      });
      expect(created.status).toBe(201);
      const id = created.body.id;
      const listed = (await roles()).body.roles.find((role: { id: number }) => role.id === id);
      expect(listed).toMatchObject({
        code: "r_cajero_de_noche",
        plantilla: false,
        editable: true,
        permisos: ["orders.update", "orders.view"],
        miembros: 0,
      });
      // Nombre repetido (también con una plantilla) y permisos desconocidos.
      expect(
        (
          await call("ownerA", "POST", "/panel/prueba-a/equipo/roles", {
            nombre: "cajero de NOCHE",
            permisos: ["orders.view"],
          })
        ).body.reason,
      ).toBe("duplicate_name");
      expect(
        (
          await call("ownerA", "POST", "/panel/prueba-a/equipo/roles", {
            nombre: "Mesero",
            permisos: ["orders.view"],
          })
        ).body.reason,
      ).toBe("duplicate_name");
      expect(
        (
          await call("ownerA", "POST", "/panel/prueba-a/equipo/roles", {
            nombre: "Raro",
            permisos: ["todo.todo"],
          })
        ).status,
      ).toBe(400);

      const updated = await call("ownerA", "PUT", `/panel/prueba-a/equipo/roles/${id}`, {
        nombre: "Caja",
        permisos: ["orders.view", "orders.change_status"],
      });
      expect(updated.status).toBe(200);
      expect(
        (await roles()).body.roles.find((role: { id: number }) => role.id === id),
      ).toMatchObject({ nombre: "Caja", permisos: ["orders.change_status", "orders.view"] });

      // El rol se puede asignar en una invitación; con invitación pendiente no se borra.
      const invite = await call("ownerA", "POST", "/panel/prueba-a/equipo/invitaciones", {
        rol_id: id,
      });
      expect(invite.status).toBe(201);
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${id}`)).body.reason,
      ).toBe("pending_invites");
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/invitaciones/${invite.body.id}`);
      expect((await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${id}`)).status).toBe(
        200,
      );
      const trail = await ctx.sql<{ accion: string }[]>`
        SELECT accion FROM public.auditoria WHERE recurso_tipo = 'rol' AND recurso_id = ${String(id)}
        ORDER  BY id
      `;
      expect(trail.map((row) => row.accion)).toEqual([
        "team.role.create",
        "team.role.update",
        "team.role.delete",
      ]);
    });

    it("personaliza una plantilla: copia propia, mueve miembros e invitaciones, deja la global", async () => {
      const before = (await roles()).body.roles;
      const viewer = before.find((role: { code: string }) => role.code === "viewer");
      const owner = before.find((role: { code: string }) => role.code === "owner");
      expect(viewer).toMatchObject({ personalizable: true, miembros: 1 });
      expect(owner.personalizable).toBe(false);

      // Quien consulta no puede personalizar; Propietario tampoco.
      expect(
        (await call("viewerA", "POST", `/panel/prueba-a/equipo/roles/${viewer.id}/personalizar`))
          .status,
      ).toBe(403);
      const denied = await call(
        "ownerA",
        "POST",
        `/panel/prueba-a/equipo/roles/${owner.id}/personalizar`,
      );
      expect(denied.status).toBe(403);
      expect(denied.body.reason).toBe("owner_not_customizable");

      const done = await call(
        "ownerA",
        "POST",
        `/panel/prueba-a/equipo/roles/${viewer.id}/personalizar`,
        { nombre: "Consulta del local" },
      );
      expect(done.status).toBe(201);
      expect(done.body).toMatchObject({ miembros_movidos: 1, invitaciones_movidas: 0 });

      const after = (await roles()).body.roles;
      const copy = after.find((role: { id: number }) => role.id === done.body.id);
      expect(copy).toMatchObject({
        nombre: "Consulta del local",
        plantilla: false,
        editable: true,
        miembros: 1,
        permisos: viewer.permisos,
      });
      // La plantilla global sigue igual y sin esta persona.
      expect(after.find((role: { id: number }) => role.id === viewer.id)).toMatchObject({
        permisos: viewer.permisos,
        miembros: 0,
      });
      // Misma plantilla en otro restaurante: intacta.
      const [others] = await ctx.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.membresia_rol WHERE rol_id = ${viewer.id}
      `;
      expect(others?.n).toBe(0);

      // Nombre repetido, y la copia ya se edita como cualquier rol propio.
      const dup = await call(
        "ownerA",
        "POST",
        `/panel/prueba-a/equipo/roles/${viewer.id}/personalizar`,
        { nombre: "consulta del local" },
      );
      expect(dup.status).toBe(409);
      expect(
        (
          await call("ownerA", "PUT", `/panel/prueba-a/equipo/roles/${done.body.id}`, {
            nombre: "Consulta del local",
            permisos: ["orders.view", "menu.view"],
          })
        ).status,
      ).toBe(200);
      // Una copia no es plantilla: no se personaliza otra vez.
      expect(
        (await call("ownerA", "POST", `/panel/prueba-a/equipo/roles/${done.body.id}/personalizar`))
          .status,
      ).toBe(422);

      const trail = await ctx.sql<{ accion: string }[]>`
        SELECT accion FROM public.auditoria
        WHERE  recurso_tipo = 'rol' AND recurso_id = ${String(done.body.id)} ORDER BY id
      `;
      expect(trail.map((row) => row.accion)).toEqual(["team.role.customize", "team.role.update"]);

      // Deja el estado como estaba para las demás pruebas.
      await ctx.sql`UPDATE public.membresia_rol SET rol_id = ${viewer.id} WHERE rol_id = ${done.body.id}`;
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${done.body.id}`);
    });

    it("al personalizar también pasan a la copia las invitaciones pendientes", async () => {
      const waiter = (await roles()).body.roles.find(
        (role: { code: string }) => role.code === "waiter",
      );
      const invite = await call("ownerA", "POST", "/panel/prueba-a/equipo/invitaciones", {
        rol_id: waiter.id,
        email: null,
        sucursal_ids: [],
      });
      expect(invite.status).toBe(201);
      const done = await call(
        "ownerA",
        "POST",
        `/panel/prueba-a/equipo/roles/${waiter.id}/personalizar`,
      );
      expect(done.status).toBe(201);
      expect(done.body.invitaciones_movidas).toBe(1);
      const copy = (await roles()).body.roles.find(
        (role: { id: number }) => role.id === done.body.id,
      );
      expect(copy).toMatchObject({ nombre: "Mesero (personalizado)", invitaciones: 1 });
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/invitaciones/${invite.body.id}`);
      await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${done.body.id}`);
    });

    it("no deja tocar plantillas, roles en uso ni dar permisos que no se tienen", async () => {
      const waiter = (await roles()).body.roles.find(
        (role: { code: string }) => role.code === "waiter",
      );
      expect(
        (
          await call("ownerA", "PUT", `/panel/prueba-a/equipo/roles/${waiter.id}`, {
            nombre: "Camarero",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(403);
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/equipo/roles/${waiter.id}`)).status,
      ).toBe(403);

      // Rol en uso.
      const used = await call("ownerC", "POST", "/panel/prueba-c/equipo/roles", {
        nombre: "Turno tarde",
        permisos: ["orders.view"],
      });
      const [member] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.local_memberships WHERE restaurante_id = 103 AND rol <> 'owner' LIMIT 1
      `;
      await ctx.sql`INSERT INTO public.membresia_rol (membership_id, rol_id) VALUES (${member?.id ?? 0}, ${used.body.id})`;
      expect(
        (await call("ownerC", "DELETE", `/panel/prueba-c/equipo/roles/${used.body.id}`)).body
          .reason,
      ).toBe("role_in_use");

      // Un encargado (sin team.manage) no gestiona roles; el rol de otro restaurante no existe.
      expect(
        (
          await call("managerPlaya", "POST", "/panel/prueba-c/equipo/roles", {
            nombre: "X",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call("ownerA", "PUT", `/panel/prueba-a/equipo/roles/${used.body.id}`, {
            nombre: "Robado",
            permisos: ["orders.view"],
          })
        ).status,
      ).toBe(404);
    });
  });
});
