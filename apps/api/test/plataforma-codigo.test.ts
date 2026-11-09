import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(
  user: User,
  method: string,
  path: string,
  body?: unknown,
  app: TestContext["app"] = ctx.app,
) {
  const response = await app.request(path, {
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

const newRestaurant = (overrides: Record<string, unknown> = {}) => ({
  nombre: "Bar Código",
  slug: "bar-codigo",
  zona_horaria: "Atlantic/Canary",
  plan: "basico",
  local: { nombre: "Bar Código Centro" },
  propietario_email: "dueno@codigo.test",
  ...overrides,
});

const configOf = (restauranteId: number) =>
  ctx.sql<{ config_key: string; config_value: string }[]>`
    SELECT config_key, config_value FROM public.restaurante_config
    WHERE  restaurante_id = ${restauranteId} AND config_key LIKE 'antifraude_codigo_%'
    ORDER  BY config_key`;

describe.skipIf(!TEST_DATABASE_URL)("código de verificación en el panel interno", () => {
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

  it("el alta elige el canal: WhatsApp guarda la clave; apagado o sin indicar no guarda nada", async () => {
    const on = await call(
      "platformAdmin",
      "POST",
      "/plataforma/restaurantes",
      newRestaurant({ codigo_verificacion: "whatsapp" }),
    );
    expect(on.status).toBe(201);
    expect(await configOf(on.body.id)).toEqual([
      { config_key: "antifraude_codigo_canal", config_value: "whatsapp" },
    ]);
    const [audited] = await ctx.sql`
      SELECT detalle FROM public.auditoria
      WHERE  accion = 'plataforma.restaurante.crear' AND restaurante_id = ${on.body.id}`;
    expect(audited?.detalle.completo.codigo_verificacion).toBe("whatsapp");

    const off = await call(
      "platformAdmin",
      "POST",
      "/plataforma/restaurantes",
      newRestaurant({ slug: "bar-codigo-off", codigo_verificacion: "apagado" }),
    );
    expect(off.status).toBe(201);
    expect(await configOf(off.body.id)).toEqual([]);

    const none = await call(
      "platformAdmin",
      "POST",
      "/plataforma/restaurantes",
      newRestaurant({ slug: "bar-codigo-nada" }),
    );
    expect(none.status).toBe(201);
    expect(await configOf(none.body.id)).toEqual([]);

    // SMS no se ofrece por ahora.
    const sms = await call(
      "platformAdmin",
      "POST",
      "/plataforma/restaurantes",
      newRestaurant({ slug: "bar-codigo-sms", codigo_verificacion: "sms" }),
    );
    expect(sms.status).toBe(400);
  });

  it("la ficha trae los ajustes con sus valores por defecto y si la API puede enviar", async () => {
    const result = await call("platformAdmin", "GET", "/plataforma/restaurantes/102");
    expect(result.status).toBe(200);
    expect(result.body.antifraude_codigo).toEqual({
      canal: "apagado",
      umbral_eur: 30,
      umbral_personalizado: false,
      tope_mensual_eur: 10,
      tope_personalizado: false,
      gasto_mes_eur: 0,
      api_configurada: false,
    });
    const app = ctx.appWith({ sendCode: async () => true, codeSecret: "s".repeat(40) });
    const withApi = await call(
      "platformAdmin",
      "GET",
      "/plataforma/restaurantes/102",
      undefined,
      app,
    );
    expect(withApi.body.antifraude_codigo.api_configurada).toBe(true);
  });

  it("un admin cambia canal, umbral y tope; null vuelve al valor por defecto; se audita", async () => {
    const put = (body: unknown, user: User = "platformAdmin") =>
      call(user, "PUT", "/plataforma/restaurantes/102/antifraude-codigo", body);

    const first = await put({ canal: "whatsapp", umbral_eur: 45.5, tope_mensual_eur: 20 });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      canal: "whatsapp",
      umbral_eur: 45.5,
      umbral_personalizado: true,
      tope_mensual_eur: 20,
      tope_personalizado: true,
    });

    // Sin umbral ni tope en el cuerpo: no se tocan.
    const channelOnly = await put({ canal: "apagado" });
    expect(channelOnly.body).toMatchObject({
      canal: "apagado",
      umbral_eur: 45.5,
      tope_mensual_eur: 20,
    });
    expect(await configOf(102)).toEqual([
      { config_key: "antifraude_codigo_importe_umbral_eur", config_value: "45.5" },
      { config_key: "antifraude_codigo_tope_mensual_eur", config_value: "20" },
    ]);

    const reset = await put({ canal: "whatsapp", umbral_eur: null, tope_mensual_eur: null });
    expect(reset.body).toMatchObject({
      canal: "whatsapp",
      umbral_eur: 30,
      umbral_personalizado: false,
      tope_mensual_eur: 10,
      tope_personalizado: false,
    });
    expect(await configOf(102)).toEqual([
      { config_key: "antifraude_codigo_canal", config_value: "whatsapp" },
    ]);

    const audits = await ctx.sql`
      SELECT detalle FROM public.auditoria
      WHERE  accion = 'plataforma.antifraude_codigo.cambiar' AND restaurante_id = 102
      ORDER  BY id`;
    expect(audits).toHaveLength(3);
    expect(audits[0]?.detalle).toMatchObject({ canal: "whatsapp", umbral_eur: 45.5 });
  });

  it("el ajuste funciona de verdad en el checkout: umbral personalizado y canal apagado", async () => {
    // Restaurante 101 (prueba-a): activar y fijar el umbral en 1 €.
    await call("platformAdmin", "PUT", "/plataforma/restaurantes/101/antifraude-codigo", {
      canal: "whatsapp",
      umbral_eur: 1,
    });
    const app = ctx.appWith({ sendCode: async () => true, codeSecret: "s".repeat(40) });
    const order = (phone: string) =>
      app.request("/public/prueba-a/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "x-real-ip": "198.51.100.50",
        },
        body: JSON.stringify({
          nombre: "Lucía",
          email: "lucia@test.local",
          telefono: phone,
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          privacidad_aceptada: true,
          items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }],
        }),
      });
    expect((await order("+34600771001")).status).toBe(422);

    await call("platformAdmin", "PUT", "/plataforma/restaurantes/101/antifraude-codigo", {
      canal: "apagado",
    });
    expect((await order("+34600771002")).status).toBe(201);
  });

  it("valida el cuerpo, el restaurante y el rol (soporte solo lee)", async () => {
    const put = (path: string, body: unknown, user: User = "platformAdmin") =>
      call(user, "PUT", path, body);
    const url = "/plataforma/restaurantes/102/antifraude-codigo";
    expect((await put(url, { canal: "sms" })).status).toBe(400);
    expect((await put(url, {})).status).toBe(400);
    expect((await put(url, { canal: "whatsapp", umbral_eur: -1 })).status).toBe(400);
    expect((await put(url, { canal: "whatsapp", tope_mensual_eur: "diez" })).status).toBe(400);
    expect(
      (await put("/plataforma/restaurantes/999999/antifraude-codigo", { canal: "whatsapp" }))
        .status,
    ).toBe(404);
    expect((await put(url, { canal: "whatsapp" }, "platformSupport")).status).toBe(403);
    expect((await put(url, { canal: "whatsapp" }, "ownerA")).status).toBe(403);
  });
});
