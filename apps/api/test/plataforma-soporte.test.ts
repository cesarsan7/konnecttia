import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

describe.skipIf(!TEST_DATABASE_URL)("soporte de solo lectura del equipo de Konnecttia", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo) VALUES
        (${USERS.platformAdmin.userId}::uuid, ${USERS.platformAdmin.email}, 'admin', true),
        (${USERS.platformSupport.userId}::uuid, ${USERS.platformSupport.email}, 'soporte', true)
      ON CONFLICT (user_id) DO UPDATE SET activo = true
    `;
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  const call = async (user: keyof typeof USERS, method: string, path: string, body?: unknown) => {
    const response = await ctx.app.request(path, {
      method,
      headers: {
        ...auth(user),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Json };
  };

  it("sin entrar en modo soporte, el equipo de Konnecttia no ve el panel del restaurante", async () => {
    expect((await call("platformSupport", "GET", "/panel/prueba-a/orders")).status).toBe(403);
  });

  it("exige un motivo y un restaurante con enlace", async () => {
    const path = "/plataforma/restaurantes/101/soporte";
    expect((await call("platformSupport", "POST", path, { motivo: "corto" })).status).toBe(400);
    expect(
      (
        await call("platformSupport", "POST", "/plataforma/restaurantes/9999/soporte", {
          motivo: "Revisar un pedido atascado",
        })
      ).status,
    ).toBe(404);
    expect(
      (await call("ownerA", "POST", path, { motivo: "Revisar un pedido atascado" })).status,
    ).toBe(403);
  });

  it("al entrar puede consultar, no escribir, y no ve datos de clientes", async () => {
    const enter = await call("platformSupport", "POST", "/plataforma/restaurantes/101/soporte", {
      motivo: "Revisar un pedido atascado",
    });
    expect(enter.status).toBe(201);
    expect(enter.body.slug).toBe("prueba-a");

    expect((await call("platformSupport", "GET", "/panel/prueba-a/orders")).status).toBe(200);
    const access = await call("platformSupport", "GET", "/panel/prueba-a/acceso");
    expect(access.status).toBe(200);
    expect(access.body.soporte).toMatchObject({ motivo: "Revisar un pedido atascado" });
    expect(access.body.permisos).not.toContain("customers.view");
    expect(access.body.permisos).not.toContain("menu.update");

    expect((await call("platformSupport", "GET", "/panel/prueba-a/clientes")).status).toBe(403);
    const write = await call("platformSupport", "POST", "/panel/prueba-a/equipo/invitaciones", {
      email: "x@test.local",
    });
    expect(write.status).toBe(403);
    expect(write.body.reason).toBe("support_read_only");
    // El permiso se concede por restaurante: en otro restaurante sigue sin entrar.
    expect((await call("platformSupport", "GET", "/panel/prueba-b/orders")).status).toBe(403);
  });

  it("queda en la auditoría del restaurante y «salir» corta el acceso", async () => {
    expect(
      (await call("platformSupport", "DELETE", "/plataforma/restaurantes/101/soporte")).status,
    ).toBe(200);
    expect((await call("platformSupport", "GET", "/panel/prueba-a/orders")).status).toBe(403);
    const rows = await ctx.sql<{ accion: string; detalle: Json }[]>`
      SELECT accion, detalle FROM public.auditoria
      WHERE  restaurante_id = 101 AND accion LIKE 'plataforma.soporte.%' ORDER BY id`;
    expect(rows.map((row) => row.accion)).toEqual([
      "plataforma.soporte.entrar",
      "plataforma.soporte.salir",
    ]);
    expect(rows[0]?.detalle.motivo).toBe("Revisar un pedido atascado");
  });

  it("caduca a la hora y se corta si la persona deja el equipo", async () => {
    await call("platformAdmin", "POST", "/plataforma/restaurantes/101/soporte", {
      motivo: "Revisar la configuración de pagos",
    });
    expect((await call("platformAdmin", "GET", "/panel/prueba-a/orders")).status).toBe(200);
    await ctx.sql`UPDATE public.plataforma_miembro SET activo = false WHERE user_id = ${USERS.platformAdmin.userId}::uuid`;
    expect((await call("platformAdmin", "GET", "/panel/prueba-a/orders")).status).toBe(403);
    await ctx.sql`UPDATE public.plataforma_miembro SET activo = true WHERE user_id = ${USERS.platformAdmin.userId}::uuid`;
    // Con el reloj una hora y un minuto después, la sesión ya ha caducado.
    const late = await ctx
      .appWith({ now: () => new Date("2026-11-03T14:01:00Z") })
      .request("/panel/prueba-a/orders", { headers: auth("platformAdmin") });
    expect(late.status).toBe(403);
  });
});
