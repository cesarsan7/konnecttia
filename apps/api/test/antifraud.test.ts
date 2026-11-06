import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CaptchaVerifier } from "../src/context";
import { createTurnstileVerifier, TURNSTILE_VERIFY_URL } from "../src/lib/turnstile";
import { exceededLimit, PHONE_LIMIT, phoneLimits } from "../src/repositories/antifraud";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

const salchimaduro = [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 1 }];
const bocadillo = [{ menu_item_id: 3201, menu_variant_id: 3301, quantity: 1 }];

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

/** Pedido web (público) a la API indicada; cada llamada sale de una IP distinta. */
async function webOrder(
  phone: string,
  options: {
    readonly app?: typeof ctx.app;
    readonly slug?: string;
    readonly extra?: Record<string, unknown>;
    readonly key?: string;
    readonly ip?: string;
  } = {},
) {
  const slug = options.slug ?? "prueba-a";
  const items = slug === "prueba-c" ? bocadillo : salchimaduro;
  const response = await (options.app ?? ctx.app).request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": options.ip ?? `198.51.100.${Math.floor(Math.random() * 200)}`,
      "Idempotency-Key": options.key ?? crypto.randomUUID(),
    },
    body: JSON.stringify({
      nombre: "Lucía",
      telefono: phone,
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      privacidad_aceptada: true,
      ...(slug === "prueba-c" ? { sucursal_id: 3002 } : {}),
      items,
      ...options.extra,
    }),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const setConfig = (restauranteId: number, key: string, value: string) =>
  ctx.sql`
    INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
    VALUES (${restauranteId}, ${key}, ${value})
    ON CONFLICT (restaurante_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value
  `;

const clearConfig = (restauranteId: number) =>
  ctx.sql`
    DELETE FROM public.restaurante_config
    WHERE  restaurante_id = ${restauranteId} AND config_key LIKE 'antifraude_%'
  `;

async function customerId(restauranteId: number, phone: string): Promise<number> {
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.usuarios WHERE restaurante_id = ${restauranteId} AND telefono = ${phone}
  `;
  if (!row) throw new Error("cliente no encontrado");
  return row.id;
}

const closeOrders = (phone: string) =>
  ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE telefono = ${phone}`;

describe("límites por teléfono: lógica", () => {
  it("sin clave, vacía o inválida no hay límite", () => {
    for (const config of [
      new Map<string, string>(),
      new Map([["antifraude_pedidos_abiertos_por_telefono", ""]]),
      new Map([["antifraude_pedidos_abiertos_por_telefono", "0"]]),
      new Map([["antifraude_pedidos_por_telefono_hora", "muchos"]]),
    ]) {
      expect(phoneLimits(config)).toEqual({ open: null, perHour: null });
    }
    expect(exceededLimit({ open: null, perHour: null }, { open: 99, lastHour: 99 })).toBeNull();
  });

  it("lee los dos límites y detecta cuál se supera", () => {
    const limits = phoneLimits(
      new Map([
        ["antifraude_pedidos_abiertos_por_telefono", "2"],
        ["antifraude_pedidos_por_telefono_hora", "4"],
      ]),
    );
    expect(limits).toEqual({ open: 2, perHour: 4 });
    expect(exceededLimit(limits, { open: 1, lastHour: 3 })).toBeNull();
    expect(exceededLimit(limits, { open: 2, lastHour: 2 })).toBe(PHONE_LIMIT.Open);
    expect(exceededLimit(limits, { open: 1, lastHour: 4 })).toBe(PHONE_LIMIT.Hour);
  });
});

describe("verificación de Turnstile", () => {
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("envía el secreto, el token y la IP a Cloudflare y acepta success=true", async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const verify = createTurnstileVerifier("secreto-de-prueba", async (url, init) => {
      calls.push({ url, body: init.body as URLSearchParams });
      return response({ success: true });
    });
    expect(await verify("token-1", "203.0.113.7")).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(TURNSTILE_VERIFY_URL);
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({
      secret: "secreto-de-prueba",
      response: "token-1",
      remoteip: "203.0.113.7",
    });
  });

  it("rechaza token ausente, respuesta negativa, HTTP de error y caída de red", async () => {
    const never = createTurnstileVerifier("s".repeat(12), async () => {
      throw new Error("no debería llamarse");
    });
    expect(await never(undefined, null)).toBe(false);
    expect(await never("x".repeat(3000), null)).toBe(false);
    const negative = createTurnstileVerifier("s".repeat(12), async () =>
      response({ success: false }),
    );
    expect(await negative("token", null)).toBe(false);
    const serverError = createTurnstileVerifier("s".repeat(12), async () => response({}, 500));
    expect(await serverError("token", null)).toBe(false);
    const offline = createTurnstileVerifier("s".repeat(12), async () => {
      throw new Error("sin red");
    });
    expect(await offline("token", null)).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("antifraude del pedido web", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("límite por teléfono", () => {
    it("sin claves de configuración no hay límite", async () => {
      await clearConfig(101);
      for (let i = 0; i < 4; i++) {
        expect((await webOrder("+34600002001")).status).toBe(201);
      }
    });

    it("rechaza con 429 phone_limit al llegar al máximo de pedidos sin cerrar", async () => {
      await setConfig(101, "antifraude_pedidos_abiertos_por_telefono", "2");
      const phone = "+34600002010";
      const first = await webOrder(phone);
      expect(first.status).toBe(201);
      expect((await webOrder(phone)).status).toBe(201);
      const blocked = await webOrder(phone);
      expect(blocked.status).toBe(429);
      expect(blocked.body).toMatchObject({ error: "rate_limited", reason: "phone_limit" });
      // No se creó ningún pedido más.
      const [count] = await ctx.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.pedidos WHERE telefono = ${phone}
      `;
      expect(count?.n).toBe(2);
      // Al cerrarse los pedidos vuelve a poder pedir.
      await closeOrders(phone);
      expect((await webOrder(phone)).status).toBe(201);
    });

    it("el mismo teléfono escrito de otra forma cuenta igual", async () => {
      await setConfig(101, "antifraude_pedidos_abiertos_por_telefono", "1");
      expect((await webOrder("+34600002020")).status).toBe(201);
      for (const variant of ["600002020", "0034600002020", "34600002020"]) {
        const result = await webOrder(variant);
        expect(result.status, variant).toBe(429);
        expect(result.body.reason).toBe("phone_limit");
      }
    });

    it("un reintento con la misma clave de idempotencia devuelve el pedido original", async () => {
      await setConfig(101, "antifraude_pedidos_abiertos_por_telefono", "1");
      const key = crypto.randomUUID();
      const created = await webOrder("+34600002030", { key });
      expect(created.status).toBe(201);
      const retry = await webOrder("+34600002030", { key });
      expect(retry.status).toBe(200);
      expect(retry.body.pedido_codigo).toBe(created.body.pedido_codigo);
      // Una clave nueva sí topa con el límite.
      expect((await webOrder("+34600002030")).status).toBe(429);
    });

    it("limita los pedidos por hora aunque estén cerrados o cancelados", async () => {
      await clearConfig(101);
      await setConfig(101, "antifraude_pedidos_por_telefono_hora", "2");
      const phone = "+34600002040";
      expect((await webOrder(phone)).status).toBe(201);
      expect((await webOrder(phone)).status).toBe(201);
      await ctx.sql`UPDATE public.pedidos SET estado = 'cancelado' WHERE telefono = ${phone}`;
      const hit = await webOrder(phone);
      expect(hit.status).toBe(429);
      expect(hit.body.reason).toBe("phone_limit");
      // Los de hace más de una hora ya no cuentan.
      await ctx.sql`
        UPDATE public.pedidos SET created_at = now() - interval '2 hours' WHERE telefono = ${phone}
      `;
      expect((await webOrder(phone)).status).toBe(201);
    });

    it("solo cuenta los pedidos web y del mismo restaurante", async () => {
      await clearConfig(101);
      await setConfig(101, "antifraude_pedidos_abiertos_por_telefono", "1");
      await setConfig(103, "antifraude_pedidos_abiertos_por_telefono", "1");
      const phone = "+34600002050";
      expect((await webOrder(phone)).status).toBe(201);
      // El mismo teléfono en otro restaurante tiene su propio recuento.
      expect((await webOrder(phone, { slug: "prueba-c" })).status).toBe(201);
      // Un pedido de otro canal (WhatsApp, teléfono, mostrador) no cuenta para la web.
      await ctx.sql`
        UPDATE public.pedidos SET canal = 'whatsapp' WHERE telefono = ${phone} AND restaurante_id = 101
      `;
      expect((await webOrder(phone)).status).toBe(201);
      await clearConfig(103);
    });

    it("el pedido manual del panel no se limita", async () => {
      await clearConfig(101);
      await setConfig(101, "antifraude_pedidos_abiertos_por_telefono", "1");
      const phone = "+34600002060";
      expect((await webOrder(phone)).status).toBe(201);
      const response = await ctx.app.request("/panel/prueba-a/orders", {
        method: "POST",
        headers: {
          ...auth("ownerA"),
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          canal: "telefono",
          nombre: "Lucía",
          telefono: phone,
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          items: salchimaduro,
        }),
      });
      expect(response.status).toBe(201);
    });
  });

  describe("captcha (Turnstile)", () => {
    const seen: { token: string | undefined; ip: string | null }[] = [];
    const verifier: CaptchaVerifier = async (token, ip) => {
      seen.push({ token, ip });
      return token === "token-valido";
    };

    it("sin verificador configurado el pedido funciona como siempre", async () => {
      await clearConfig(101);
      expect((await webOrder("+34600002100")).status).toBe(201);
      expect(
        (await webOrder("+34600002101", { extra: { captcha_token: "lo-que-sea" } })).status,
      ).toBe(201);
    });

    it("con verificador: sin token o con token inválido → 422 captcha_failed y sin pedido", async () => {
      const app = ctx.appWith({ verifyCaptcha: verifier });
      for (const extra of [{}, { captcha_token: "token-falso" }]) {
        const result = await webOrder("+34600002110", { app, extra });
        expect(result.status).toBe(422);
        expect(result.body).toMatchObject({ error: "captcha_failed", reason: "captcha_failed" });
      }
      const rows = await ctx.sql`SELECT 1 FROM public.pedidos WHERE telefono = '+34600002110'`;
      expect(rows).toHaveLength(0);
    });

    it("con token válido crea el pedido y verifica con la IP del cliente", async () => {
      seen.length = 0;
      const app = ctx.appWith({ verifyCaptcha: verifier });
      const result = await webOrder("+34600002111", {
        app,
        ip: "203.0.113.55",
        extra: { captcha_token: "token-valido" },
      });
      expect(result.status).toBe(201);
      expect(seen).toEqual([{ token: "token-valido", ip: "203.0.113.55" }]);
    });

    it("un reintento de un pedido ya creado no vuelve a pedir captcha (el token es de un solo uso)", async () => {
      const app = ctx.appWith({ verifyCaptcha: verifier });
      const key = crypto.randomUUID();
      expect(
        (await webOrder("+34600002112", { app, key, extra: { captcha_token: "token-valido" } }))
          .status,
      ).toBe(201);
      expect((await webOrder("+34600002112", { app, key })).status).toBe(200);
    });

    it("el pedido manual del panel no exige captcha", async () => {
      const app = ctx.appWith({ verifyCaptcha: verifier });
      const response = await app.request("/panel/prueba-a/orders", {
        method: "POST",
        headers: {
          ...auth("ownerA"),
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          canal: "mostrador",
          nombre: "Rosa",
          telefono: "+34600002113",
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          items: salchimaduro,
        }),
      });
      expect(response.status).toBe(201);
    });
  });

  describe("teléfonos bloqueados", () => {
    const phone = "+34600002200";

    it("bloquear desde la ficha rechaza los pedidos web con un mensaje neutro", async () => {
      await clearConfig(101);
      expect((await webOrder(phone)).status).toBe(201);
      const id = await customerId(101, phone);

      const blocked = await call("ownerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {
        motivo: "Pidió y no abrió la puerta tres veces",
      });
      expect(blocked.status).toBe(200);
      expect(blocked.body.bloqueo.motivo).toBe("Pidió y no abrió la puerta tres veces");

      // También con otras formas de escribir el mismo teléfono.
      for (const variant of [phone, "600002200", "34600002200"]) {
        const result = await webOrder(variant);
        expect(result.status, variant).toBe(422);
        expect(result.body).toEqual({
          error: "order_not_accepted",
          reason: "order_not_accepted",
        });
      }
      // Otros teléfonos y otros restaurantes no se ven afectados.
      expect((await webOrder("+34600002201")).status).toBe(201);
      expect((await webOrder(phone, { slug: "prueba-c" })).status).toBe(201);
    });

    it("la ficha y la lista muestran el bloqueo y el filtro deja solo los bloqueados", async () => {
      const id = await customerId(101, phone);
      const detail = await call("ownerA", "GET", `/panel/prueba-a/clientes/${id}`);
      expect(detail.body.bloqueo).toMatchObject({
        motivo: "Pidió y no abrió la puerta tres veces",
      });
      const all = await call("ownerA", "GET", "/panel/prueba-a/clientes?q=60000220");
      const flags = Object.fromEntries(
        all.body.clientes.map((c: Json) => [c.telefono, c.bloqueado]),
      );
      expect(flags[phone]).toBe(true);
      expect(flags["+34600002201"]).toBe(false);
      const only = await call("ownerA", "GET", "/panel/prueba-a/clientes?bloqueados=1");
      expect(only.body.clientes.length).toBeGreaterThan(0);
      expect(only.body.clientes.every((c: Json) => c.bloqueado === true)).toBe(true);
      expect(only.body.clientes.map((c: Json) => c.telefono)).toContain(phone);
    });

    it("la comprobación SQL para n8n respeta el restaurante y el formato del teléfono", async () => {
      const check = async (restauranteId: number, value: string) => {
        const [row] = await ctx.sql<{ b: boolean }[]>`
          SELECT public.fn_telefono_bloqueado(${restauranteId}::int4, ${value}) AS b
        `;
        return row?.b;
      };
      expect(await check(101, "34600002200")).toBe(true);
      expect(await check(101, "+34 600 00 22 00")).toBe(true);
      expect(await check(101, "600002200")).toBe(true);
      expect(await check(102, "34600002200")).toBe(false);
      expect(await check(101, "34600002299")).toBe(false);
    });

    it("el pedido manual del panel avisa del bloqueo pero deja continuar", async () => {
      const lookup = await call(
        "ownerA",
        "GET",
        "/panel/prueba-a/orders/anteriores?telefono=%2B34600002200",
      );
      expect(lookup.body.bloqueado).toBe(true);
      const clean = await call(
        "ownerA",
        "GET",
        "/panel/prueba-a/orders/anteriores?telefono=%2B34600002201",
      );
      expect(clean.body.bloqueado).toBe(false);

      const response = await ctx.app.request("/panel/prueba-a/orders", {
        method: "POST",
        headers: {
          ...auth("ownerA"),
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          canal: "telefono",
          nombre: "Lucía",
          telefono: phone,
          tipo_despacho: "retiro",
          metodo_pago: "efectivo",
          items: salchimaduro,
        }),
      });
      expect(response.status).toBe(201);
    });

    it("audita el bloqueo sin guardar el teléfono ni el motivo", async () => {
      const id = await customerId(101, phone);
      const trail = await ctx.sql<{ detalle: unknown }[]>`
        SELECT detalle FROM public.auditoria
        WHERE  accion = 'customers.block' AND recurso_id = ${String(id)} AND restaurante_id = 101
      `;
      expect(trail).toHaveLength(1);
      expect(trail[0]?.detalle).toEqual({ operacion: "bloquear", con_motivo: true });
    });

    it("desbloquear devuelve la posibilidad de pedir", async () => {
      const id = await customerId(101, phone);
      const result = await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}/bloqueo`);
      expect(result.status).toBe(200);
      expect((await webOrder(phone)).status).toBe(201);
      const detail = await call("ownerA", "GET", `/panel/prueba-a/clientes/${id}`);
      expect(detail.body.bloqueo).toBeNull();
      const trail = await ctx.sql<{ detalle: unknown }[]>`
        SELECT detalle FROM public.auditoria
        WHERE  accion = 'customers.block' AND recurso_id = ${String(id)}
        ORDER  BY id
      `;
      expect(trail.map((row) => row.detalle)).toEqual([
        { operacion: "bloquear", con_motivo: true },
        { operacion: "desbloquear" },
      ]);
    });

    it("bloquear dos veces actualiza el motivo y sin motivo queda vacío", async () => {
      const id = await customerId(101, phone);
      await call("ownerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, { motivo: "uno" });
      const again = await call("ownerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {
        motivo: "  ",
      });
      expect(again.status).toBe(200);
      expect(again.body.bloqueo.motivo).toBeNull();
      const rows = await ctx.sql`
        SELECT 1 FROM public.cliente_bloqueado WHERE restaurante_id = 101 AND telefono = '34600002200'
      `;
      expect(rows).toHaveLength(1);
      // Motivo demasiado largo o cuerpo no válido.
      const long = await call("ownerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {
        motivo: "x".repeat(301),
      });
      expect(long.status).toBe(400);
      expect((await call("ownerA", "PUT", "/panel/prueba-a/clientes/abc/bloqueo", {})).status).toBe(
        400,
      );
      await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}/bloqueo`);
    });

    it("exige customers.block y no cruza restaurantes", async () => {
      const id = await customerId(101, phone);
      // Consulta no puede; el propietario de otro restaurante tampoco.
      expect(
        (await call("viewerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {})).status,
      ).toBe(403);
      expect(
        (await call("viewerA", "DELETE", `/panel/prueba-a/clientes/${id}/bloqueo`)).status,
      ).toBe(403);
      expect(
        (await call("ownerB", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {})).status,
      ).toBe(403);
      // Con su propio slug, el cliente de A no existe para B.
      expect(
        (await call("ownerB", "PUT", `/panel/prueba-b/clientes/${id}/bloqueo`, {})).status,
      ).toBe(404);
      const rows = await ctx.sql`SELECT 1 FROM public.cliente_bloqueado WHERE restaurante_id = 102`;
      expect(rows).toHaveLength(0);
    });

    it("un encargado limitado a un local solo bloquea clientes con pedidos en su local", async () => {
      await webOrder("+34600002300", { slug: "prueba-c" }); // local 3002 (Playa Honda)
      const [centro] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
      `;
      await webOrder("+34600002301", { slug: "prueba-c", extra: { sucursal_id: centro?.id } });
      const inScope = await customerId(103, "+34600002300");
      const outOfScope = await customerId(103, "+34600002301");

      // Personal (cashierPlaya) no tiene customers.block.
      expect(
        (await call("cashierPlaya", "PUT", `/panel/prueba-c/clientes/${inScope}/bloqueo`, {}))
          .status,
      ).toBe(403);
      // El encargado de Playa Honda no ve al cliente del local principal.
      expect(
        (await call("managerPlaya", "PUT", `/panel/prueba-c/clientes/${outOfScope}/bloqueo`, {}))
          .status,
      ).toBe(404);
      expect(
        (await call("managerPlaya", "DELETE", `/panel/prueba-c/clientes/${outOfScope}/bloqueo`))
          .status,
      ).toBe(404);
      expect(
        (await call("managerPlaya", "PUT", `/panel/prueba-c/clientes/${inScope}/bloqueo`, {}))
          .status,
      ).toBe(200);

      // La lista de bloqueados del encargado limitado no incluye clientes de otros locales.
      await call("ownerC", "PUT", `/panel/prueba-c/clientes/${outOfScope}/bloqueo`, {});
      const seenByOwner = await call("ownerC", "GET", "/panel/prueba-c/clientes?bloqueados=1");
      expect(seenByOwner.body.clientes.map((c: Json) => c.telefono).sort()).toEqual([
        "+34600002300",
        "+34600002301",
      ]);
      const seenByManager = await call(
        "managerPlaya",
        "GET",
        "/panel/prueba-c/clientes?bloqueados=1",
      );
      expect(seenByManager.body.clientes.map((c: Json) => c.telefono)).toEqual(["+34600002300"]);
    });

    it("borrar los datos de un cliente también quita su bloqueo", async () => {
      const erasable = "+34600002400";
      await webOrder(erasable);
      const id = await customerId(101, erasable);
      await call("ownerA", "PUT", `/panel/prueba-a/clientes/${id}/bloqueo`, {});
      await closeOrders(erasable);
      expect((await call("ownerA", "DELETE", `/panel/prueba-a/clientes/${id}`)).status).toBe(200);
      const rows = await ctx.sql`
        SELECT 1 FROM public.cliente_bloqueado WHERE restaurante_id = 101 AND telefono = '34600002400'
      `;
      expect(rows).toHaveLength(0);
    });
  });
});
