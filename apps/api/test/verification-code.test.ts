import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CodeSender } from "../src/context";
import { loadEnv } from "../src/lib/env";
import { cleanCode, generateCode, hashCode, hashesMatch } from "../src/lib/verification-code";
import { createSimulatedCodeSender, createWhatsAppCodeSender } from "../src/lib/whatsapp-code";
import { codeSettings, RISK_REASON } from "../src/repositories/verification";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

const SECRET = "s".repeat(40);
const salchimaduro = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];

describe("código de verificación (unidades)", () => {
  it("genera 6 cifras, con ceros a la izquierda", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(/^[0-9]{6}$/);
  });

  it("el hash depende del secreto, del restaurante y del teléfono", () => {
    const base = hashCode(SECRET, 101, "34600000001", "123456");
    expect(hashesMatch(base, hashCode(SECRET, 101, "34600000001", "123456"))).toBe(true);
    expect(hashesMatch(base, hashCode(SECRET, 102, "34600000001", "123456"))).toBe(false);
    expect(hashesMatch(base, hashCode(SECRET, 101, "34600000002", "123456"))).toBe(false);
    expect(hashesMatch(base, hashCode("t".repeat(40), 101, "34600000001", "123456"))).toBe(false);
    expect(hashesMatch(base, "no-es-hex")).toBe(false);
    expect(base).not.toContain("123456");
  });

  it("limpia espacios y guiones del código escrito", () => {
    expect(cleanCode(" 123 - 456 ")).toBe("123456");
  });

  it("lee la configuración con los valores por defecto del ADR 0011", () => {
    expect(codeSettings(new Map())).toEqual({
      channel: null,
      monthlyCapEur: 10,
      amountThresholdEur: 30,
    });
    const set = codeSettings(
      new Map([
        ["antifraude_codigo_canal", "whatsapp"],
        ["antifraude_codigo_tope_mensual_eur", "5"],
        ["antifraude_codigo_importe_umbral_eur", "45.5"],
      ]),
    );
    expect(set).toEqual({ channel: "whatsapp", monthlyCapEur: 5, amountThresholdEur: 45.5 });
    // SMS está descartado por ahora y los valores rotos vuelven al defecto.
    expect(
      codeSettings(
        new Map([
          ["antifraude_codigo_canal", "sms"],
          ["antifraude_codigo_tope_mensual_eur", "mucho"],
          ["antifraude_codigo_importe_umbral_eur", "-3"],
        ]),
      ),
    ).toEqual({ channel: null, monthlyCapEur: 10, amountThresholdEur: 30 });
  });
});

describe("envío por WhatsApp", () => {
  const config = {
    accessToken: "token-de-prueba",
    phoneNumberId: "1234567890",
    template: "codigo_verificacion",
    language: "es",
  };

  it("usa la plantilla de autenticación con el código en el cuerpo y en el botón", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const send = createWhatsAppCodeSender(config, async (url, init) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    expect(await send({ telefono: "34600000001", codigo: "654321", restaurante: "La Isla" })).toBe(
      true,
    );
    const [call] = calls;
    expect(call?.url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    const headers = (call?.init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-de-prueba");
    const body = JSON.parse(String(call?.init.body));
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "34600000001",
      type: "template",
      template: { name: "codigo_verificacion", language: { code: "es" } },
    });
    expect(body.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "654321" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: "654321" }],
      },
    ]);
    // El nombre del restaurante no viaja: la plantilla de autenticación tiene formato fijo.
    expect(JSON.stringify(body)).not.toContain("La Isla");
  });

  it("falla cerrado si Meta rechaza o la red cae", async () => {
    const rejected = createWhatsAppCodeSender(
      config,
      async () => new Response("{}", { status: 400 }),
    );
    expect(await rejected({ telefono: "34600000001", codigo: "1", restaurante: "x" })).toBe(false);
    const down = createWhatsAppCodeSender(config, async () => {
      throw new Error("sin red");
    });
    expect(await down({ telefono: "34600000001", codigo: "1", restaurante: "x" })).toBe(false);
    expect(await down({ telefono: "", codigo: "1", restaurante: "x" })).toBe(false);
  });

  it("el envío simulado oculta el teléfono", async () => {
    const lines: string[] = [];
    const send = createSimulatedCodeSender((line) => lines.push(line));
    expect(await send({ telefono: "34600000123", codigo: "111222", restaurante: "La Isla" })).toBe(
      true,
    );
    expect(lines[0]).toContain("111222");
    expect(lines[0]).toContain("123");
    expect(lines[0]).not.toContain("34600000123");
  });
});

describe("variables de entorno de la capa 3", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_ANON_KEY: "a".repeat(30),
  };

  it("sin nada configurado la capa está apagada", () => {
    expect(loadEnv(base).ANTIFRAUD_CODE_SIMULATE).toBe(false);
  });

  it("exige secreto si puede enviar y las dos claves de WhatsApp juntas", () => {
    expect(() => loadEnv({ ...base, ANTIFRAUD_CODE_SIMULATE: "true" })).toThrow(/CODE_HMAC_SECRET/);
    expect(() => loadEnv({ ...base, WHATSAPP_ACCESS_TOKEN: "x".repeat(20) })).toThrow(
      /WHATSAPP_PHONE_NUMBER_ID/,
    );
    expect(() =>
      loadEnv({
        ...base,
        WHATSAPP_ACCESS_TOKEN: "x".repeat(20),
        WHATSAPP_PHONE_NUMBER_ID: "12345",
      }),
    ).toThrow(/CODE_HMAC_SECRET/);
    expect(
      loadEnv({ ...base, ANTIFRAUD_CODE_SIMULATE: "true", CODE_HMAC_SECRET: SECRET })
        .ANTIFRAUD_CODE_SIMULATE,
    ).toBe(true);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("capa 3 del antifraude (API)", () => {
  let ctx: TestContext;
  let app: TestContext["app"];
  let sent: { telefono: string; codigo: string; restaurante: string }[];
  let sendResult: boolean;
  let phoneSeq = 0;

  const sender: CodeSender = async (message) => {
    if (sendResult) sent.push(message);
    return sendResult;
  };

  const setConfig = (key: string, value: string) =>
    ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, ${key}, ${value})
      ON CONFLICT (restaurante_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value
    `;

  /** Teléfono nuevo en cada prueba, para no mezclar códigos ni límites. */
  const newPhone = () => `+3460011${String(1000 + ++phoneSeq)}`;

  async function post(path: string, body: unknown, key?: string) {
    const response = await app.request(`/public/prueba-a${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": `198.51.100.${Math.floor(Math.random() * 200)}`,
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Json };
  }

  const requestCode = (telefono: string, extra: Record<string, unknown> = {}) =>
    post("/verificacion", {
      telefono,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      importe: 12,
      ...extra,
    });
  const confirm = (telefono: string, codigo: string) =>
    post("/verificacion/confirmar", { telefono, codigo });
  const order = (
    telefono: string,
    key = crypto.randomUUID(),
    extra: Record<string, unknown> = {},
  ) =>
    post(
      "/orders",
      {
        nombre: "Lucía",
        email: "lucia@test.local",
        telefono,
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        items: salchimaduro,
        ...extra,
      },
      key,
    );
  const lastCode = () => sent[sent.length - 1]?.codigo ?? "";

  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ sendCode: sender, codeSecret: SECRET });
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    sent = [];
    sendResult = true;
    await ctx.sql`
      DELETE FROM public.restaurante_config
      WHERE restaurante_id = 101 AND config_key LIKE 'antifraude_codigo_%'`;
    await ctx.sql`DELETE FROM public.verificacion_codigo`;
    await setConfig("antifraude_codigo_canal", "whatsapp");
  });

  it("apagada por defecto: sin canal, o sin proveedor, el pedido pasa sin código", async () => {
    await ctx.sql`DELETE FROM public.restaurante_config WHERE config_key = 'antifraude_codigo_canal'`;
    const phone = newPhone();
    expect(await requestCode(phone)).toMatchObject({ status: 200, body: { requerida: false } });
    expect((await order(phone)).status).toBe(201);

    await setConfig("antifraude_codigo_canal", "whatsapp");
    const noProvider = ctx.app; // sin sendCode ni secreto
    const response = await noProvider.request("/public/prueba-a/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        "x-real-ip": "198.51.100.7",
      },
      body: JSON.stringify({
        nombre: "Lucía",
        email: "lucia@test.local",
        telefono: newPhone(),
        tipo_despacho: "retiro",
        metodo_pago: "efectivo",
        privacidad_aceptada: true,
        items: salchimaduro,
      }),
    });
    expect(response.status).toBe(201);
    expect(sent).toHaveLength(0);
  });

  it("teléfono nuevo: el pedido pide código, se envía, se verifica y el pedido pasa una sola vez", async () => {
    const phone = newPhone();
    const blocked = await order(phone);
    expect(blocked.status).toBe(422);
    expect(blocked.body).toMatchObject({
      error: "verification_required",
      reason: RISK_REASON.NewPhone,
      canal: "whatsapp",
    });
    expect(blocked.body.importe).toBeGreaterThan(0);

    const asked = await requestCode(phone);
    expect(asked).toMatchObject({
      status: 200,
      body: { requerida: true, canal: "whatsapp", motivo: "telefono_nuevo", expira_en: 600 },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.restaurante).toBe("Cafetería de prueba A");

    // Aún sin verificar, el pedido sigue pidiendo código.
    expect((await order(phone)).status).toBe(422);
    const code = lastCode();
    const wrong = await confirm(phone, code === "000000" ? "111111" : "000000");
    expect(wrong).toMatchObject({
      status: 422,
      body: { error: "code_invalid", reason: "wrong", intentos_restantes: 4 },
    });
    expect(await confirm(phone, ` ${code.slice(0, 3)}-${code.slice(3)} `)).toMatchObject({
      status: 200,
      body: { verificado: true },
    });

    const key = crypto.randomUUID();
    const first = await order(phone, key);
    expect(first.status).toBe(201);
    // Un reintento del mismo pedido (misma clave) no pide otro código.
    expect((await order(phone, key)).status).toBe(200);
    // Pero el código ya se consumió: otro pedido necesita otra verificación.
    expect((await order(phone)).status).toBe(422);

    const [row] = await ctx.sql<{ coste_eur: string; consumido_at: Date | null }[]>`
      SELECT coste_eur, consumido_at FROM public.verificacion_codigo`;
    expect(Number(row?.coste_eur)).toBeCloseTo(0.0166, 4);
    expect(row?.consumido_at).not.toBeNull();
  });

  it("el código nunca se guarda en claro", async () => {
    await requestCode(newPhone());
    const rows = await ctx.sql`SELECT * FROM public.verificacion_codigo`;
    expect(JSON.stringify(rows)).not.toContain(lastCode());
    expect(rows[0]?.codigo_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("cliente conocido: no repite el código salvo que el importe llegue al umbral", async () => {
    const phone = newPhone();
    await requestCode(phone);
    await confirm(phone, lastCode());
    const first = await order(phone);
    expect(first.status).toBe(201);
    await ctx.sql`
      UPDATE public.pedidos SET estado = 'entregado'
      WHERE  tracking_token = ${first.body.tracking_token}::uuid`;

    // Conocido y por debajo del umbral por defecto (30 €): pasa sin código.
    expect((await order(phone)).status).toBe(201);
    expect(await requestCode(phone)).toMatchObject({ body: { requerida: false } });

    // Con un umbral bajo, el mismo cliente conocido sí necesita código (importe alto).
    await setConfig("antifraude_codigo_importe_umbral_eur", "1");
    const high = await order(phone);
    expect(high).toMatchObject({
      status: 422,
      body: { error: "verification_required", reason: "importe_alto" },
    });
  });

  it("reparto en efectivo con teléfono nuevo: motivo efectivo_reparto", async () => {
    const asked = await requestCode(newPhone(), { tipo_despacho: "delivery" });
    expect(asked.body).toMatchObject({ requerida: true, motivo: "efectivo_reparto" });
  });

  it("limita los reenvíos: 60 s entre códigos y 5 por hora", async () => {
    const phone = newPhone();
    expect((await requestCode(phone)).status).toBe(200);
    const wait = await requestCode(phone);
    expect(wait).toMatchObject({ status: 429, body: { reason: "resend_wait" } });
    expect(wait.body.reintentar_en).toBeGreaterThan(0);

    await ctx.sql`
      UPDATE public.verificacion_codigo
      SET    created_at = now() - interval '30 minutes', caduca_at = now() - interval '20 minutes'`;
    for (let i = 0; i < 4; i++) {
      await ctx.sql`
        INSERT INTO public.verificacion_codigo
          (restaurante_id, telefono, canal, motivo, codigo_hash, created_at, caduca_at)
        VALUES (101, public.fn_telefono_normalizado(${phone}), 'whatsapp', 'telefono_nuevo', 'x',
                now() - interval '20 minutes', now() - interval '10 minutes')`;
    }
    expect(await requestCode(phone)).toMatchObject({
      status: 429,
      body: { reason: "too_many_codes" },
    });
  });

  it("bloquea el código tras 5 intentos fallidos y lo da por caducado pasado su plazo", async () => {
    const phone = newPhone();
    await requestCode(phone);
    const code = lastCode();
    const wrongCode = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 4; i++) {
      expect((await confirm(phone, wrongCode)).body.reason).toBe("wrong");
    }
    expect((await confirm(phone, wrongCode)).body.reason).toBe("locked");
    // Con el código bueno, ya bloqueado, tampoco entra.
    expect((await confirm(phone, code)).body.reason).toBe("locked");

    const other = newPhone();
    await requestCode(other);
    await ctx.sql`
      UPDATE public.verificacion_codigo
      SET    created_at = now() - interval '20 minutes', caduca_at = now() - interval '10 minutes'
      WHERE  telefono = public.fn_telefono_normalizado(${other})`;
    expect(await confirm(other, lastCode())).toMatchObject({
      status: 422,
      body: { reason: "expired" },
    });
  });

  it("un código de un restaurante no vale en otro", async () => {
    const phone = newPhone();
    await requestCode(phone);
    const response = await app.request("/public/prueba-b/verificacion/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-real-ip": "198.51.100.9" },
      body: JSON.stringify({ telefono: phone, codigo: lastCode() }),
    });
    expect(response.status).toBe(422);
  });

  it("si el proveedor falla, responde 502 y el intento no cuenta ni gasta", async () => {
    sendResult = false;
    const phone = newPhone();
    expect(await requestCode(phone)).toMatchObject({
      status: 502,
      body: { error: "code_send_failed" },
    });
    const rows = await ctx.sql`SELECT 1 FROM public.verificacion_codigo`;
    expect(rows).toHaveLength(0);
    sendResult = true;
    expect((await requestCode(phone)).status).toBe(200);
  });

  it("teléfono bloqueado: rechazo neutro y sin envío", async () => {
    const phone = newPhone();
    await ctx.sql`
      INSERT INTO public.cliente_bloqueado (restaurante_id, telefono)
      VALUES (101, public.fn_telefono_normalizado(${phone}))`;
    expect(await requestCode(phone)).toMatchObject({
      status: 422,
      body: { error: "order_not_accepted" },
    });
    expect(sent).toHaveLength(0);
    await ctx.sql`DELETE FROM public.cliente_bloqueado WHERE restaurante_id = 101`;
  });

  it("tope mensual: no se envían más; el efectivo pide tarjeta o llamar y el cobro garantizado pasa", async () => {
    await setConfig("antifraude_codigo_tope_mensual_eur", "0.01");
    const phone = newPhone();
    expect(await requestCode(phone)).toMatchObject({
      status: 422,
      body: { error: "verification_unavailable", reason: "monthly_cap" },
    });
    expect(sent).toHaveLength(0);
    expect(await order(phone)).toMatchObject({
      status: 422,
      body: { error: "verification_unavailable" },
    });
    // Con tarjeta no hace falta el código: el cobro está garantizado.
    expect(await requestCode(phone, { metodo_pago: "tarjeta" })).toMatchObject({
      body: { requerida: false },
    });
    expect((await order(phone, crypto.randomUUID(), { metodo_pago: "tarjeta" })).status).toBe(201);
  });

  it("el gasto del mes cuenta los códigos enviados y sube hasta el tope por defecto", async () => {
    await requestCode(newPhone());
    const [row] = await ctx.sql<{ gasto: string }[]>`
      SELECT public.fn_codigo_gasto_mes(101, now()) AS gasto`;
    expect(Number(row?.gasto)).toBeCloseTo(0.0166, 4);
  });

  it("valida el cuerpo de las dos peticiones", async () => {
    expect((await post("/verificacion", { telefono: "abc" })).status).toBe(400);
    expect(
      (await post("/verificacion", { telefono: "+34600000001", tipo_despacho: "x" })).status,
    ).toBe(400);
    expect((await confirm("+34600000001", "12")).status).toBe(400);
    expect((await confirm("+34600000001", "abcdef")).status).toBe(400);
  });

  it("exige el captcha para enviar un código cuando está configurado", async () => {
    const withCaptcha = ctx.appWith({
      sendCode: sender,
      codeSecret: SECRET,
      verifyCaptcha: async (token) => token === "bueno",
    });
    const call = (token?: string) =>
      withCaptcha.request("/public/prueba-a/verificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-real-ip": "198.51.100.77" },
        body: JSON.stringify({
          telefono: newPhone(),
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          importe: 10,
          ...(token ? { captcha_token: token } : {}),
        }),
      });
    expect((await call()).status).toBe(422);
    expect(sent).toHaveLength(0);
    expect((await call("bueno")).status).toBe(200);
    expect(sent).toHaveLength(1);
  });
});
