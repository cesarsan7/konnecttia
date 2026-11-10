import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthAccount, AuthAdmin } from "../src/lib/auth-admin";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

const OLD = "2026-10-01T00:00:00Z";
const accounts: AuthAccount[] = [
  {
    id: "10000000-0000-0000-0000-000000000001",
    email: "nueva@konnecttia.test",
    createdAt: OLD,
    lastSignInAt: null,
  },
  { id: USERS.ownerA.userId, email: USERS.ownerA.email, createdAt: OLD, lastSignInAt: null },
  {
    id: "10000000-0000-0000-0000-000000000003",
    email: "sobra@test.local",
    createdAt: OLD,
    lastSignInAt: null,
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    email: "reciente@test.local",
    createdAt: "2026-11-02T00:00:00Z",
    lastSignInAt: null,
  },
];
const deleted: string[] = [];
const fake: AuthAdmin = {
  listAccounts: async () => accounts,
  findByEmail: async (email) => accounts.find((a) => a.email === email.toLowerCase()) ?? null,
  deleteAccount: async (id) => {
    deleted.push(id);
    return true;
  },
};

describe.skipIf(!TEST_DATABASE_URL)("equipo de Konnecttia desde /interno", () => {
  let ctx: TestContext;
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

  const app = () => ctx.appWith({ authAdmin: fake });
  const call = async (
    user: keyof typeof USERS,
    method: string,
    path: string,
    body?: unknown,
    withAdmin = true,
  ) => {
    const response = await (withAdmin ? app() : ctx.app).request(`/plataforma${path}`, {
      method,
      headers: {
        ...auth(user),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Json };
  };

  it("soporte lee el equipo pero no lo cambia", async () => {
    const read = await call("platformSupport", "GET", "/equipo");
    expect(read.status).toBe(200);
    expect(read.body.miembros.length).toBe(2);
    expect(
      (
        await call("platformSupport", "POST", "/equipo", {
          email: "nueva@konnecttia.test",
          rol: "soporte",
        })
      ).status,
    ).toBe(403);
    expect((await call("ownerA", "GET", "/equipo")).status).toBe(403);
  });

  it("da acceso por email a una cuenta existente, sin SQL, y lo audita", async () => {
    const added = await call("platformAdmin", "POST", "/equipo", {
      email: "Nueva@Konnecttia.test",
      rol: "soporte",
    });
    expect(added.status).toBe(201);
    const [row] = await ctx.sql<{ rol: string; activo: boolean }[]>`
      SELECT rol, activo FROM public.plataforma_miembro WHERE user_id = ${accounts[0]?.id as string}::uuid`;
    expect(row).toMatchObject({ rol: "soporte", activo: true });
    const trail =
      await ctx.sql`SELECT 1 FROM public.auditoria WHERE accion = 'plataforma.equipo.dar_acceso'`;
    expect(trail.length).toBe(1);
  });

  it("no inventa cuentas: sin cuenta en Supabase responde 404, y sin clave de servicio 503", async () => {
    expect(
      (await call("platformAdmin", "POST", "/equipo", { email: "nadie@x.test", rol: "admin" }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "platformAdmin",
          "POST",
          "/equipo",
          { email: "nueva@konnecttia.test", rol: "admin" },
          false,
        )
      ).status,
    ).toBe(503);
    expect(
      (await call("platformAdmin", "POST", "/equipo", { email: "no-es-email", rol: "admin" }))
        .status,
    ).toBe(400);
  });

  it("cambia el rol y desactiva sin borrar; nadie se quita a sí mismo ni deja sin admin", async () => {
    const id = accounts[0]?.id;
    expect((await call("platformAdmin", "PATCH", `/equipo/${id}`, { rol: "admin" })).status).toBe(
      200,
    );
    expect((await call("platformAdmin", "PATCH", `/equipo/${id}`, { activo: false })).status).toBe(
      200,
    );
    const [row] = await ctx.sql<
      { activo: boolean }[]
    >`SELECT activo FROM public.plataforma_miembro WHERE user_id = ${id as string}::uuid`;
    expect(row?.activo).toBe(false);

    const self = await call("platformAdmin", "PATCH", `/equipo/${USERS.platformAdmin.userId}`, {
      activo: false,
    });
    expect(self.status).toBe(409);
    expect(self.body.reason).toBe("self_change");

    // El segundo admin (reactivado) puede quitar al primero; el último admin no se puede quitar.
    await call("platformAdmin", "PATCH", `/equipo/${id}`, { activo: true });
    expect(
      (
        await call("platformAdmin", "PATCH", `/equipo/${USERS.platformAdmin.userId}`, {
          rol: "soporte",
        })
      ).status,
    ).toBe(409);
    await ctx.sql`UPDATE public.plataforma_miembro SET activo = false WHERE user_id = ${id as string}::uuid`;
    expect((await call("platformSupport", "PATCH", `/equipo/${id}`, { activo: true })).status).toBe(
      403,
    );
  });

  it("lista solo las cuentas sin ningún uso (con más de unos días) y las borra con guardas", async () => {
    // Con uso: miembro de un restaurante (ownerA), miembro del equipo (reactivada arriba no cuenta si está inactiva pero sí existe la fila).
    const list = await call("platformAdmin", "GET", "/cuentas-sin-uso");
    expect(list.status).toBe(200);
    const ids = list.body.cuentas.map((a: Json) => a.user_id);
    expect(ids).toContain(accounts[2]?.id); // sin uso
    expect(ids).not.toContain(USERS.ownerA.userId); // miembro de un restaurante
    expect(ids).not.toContain(accounts[3]?.id); // demasiado reciente
    expect(ids).not.toContain(accounts[0]?.id); // tiene fila en el equipo

    const inUse = await call("platformAdmin", "DELETE", `/cuentas/${USERS.ownerA.userId}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.reason).toBe("account_in_use");
    expect(deleted).toEqual([]);

    const ok = await call("platformAdmin", "DELETE", `/cuentas/${accounts[2]?.id}`);
    expect(ok.status).toBe(200);
    expect(deleted).toEqual([accounts[2]?.id]);
    expect((await call("platformSupport", "DELETE", `/cuentas/${accounts[2]?.id}`)).status).toBe(
      403,
    );
    expect(
      (await call("platformAdmin", "DELETE", `/cuentas/${accounts[2]?.id}`, undefined, false))
        .status,
    ).toBe(503);
  });
});
