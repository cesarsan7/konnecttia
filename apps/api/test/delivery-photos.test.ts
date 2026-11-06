import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProofStorage } from "../src/context";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const pdf = new TextEncoder().encode("%PDF-1.7\n%…");

/** Almacén privado simulado: guarda los objetos en memoria. */
function fakeStorage() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const storage: ProofStorage = {
    upload: async (path, bytes, contentType) => {
      objects.set(path, { bytes, contentType });
    },
    signedUrl: async (path, seconds) => `https://storage.test/firmada/${path}?ttl=${seconds}`,
    remove: async (path) => {
      objects.delete(path);
    },
  };
  return { storage, objects };
}

async function json(response: Response) {
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function call(
  app: TestContext["app"],
  user: User,
  method: string,
  path: string,
  body?: unknown,
) {
  return json(
    await app.request(path, {
      method,
      headers: {
        ...auth(user),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function sendPhoto(
  app: TestContext["app"],
  user: User,
  orderId: number,
  file: Uint8Array | null = png,
  field = "foto",
) {
  const form = new FormData();
  if (file) form.append(field, new File([file], "entrega.jpg", { type: "image/jpeg" }));
  return json(
    await app.request(`/panel/prueba-c/mis-repartos/${orderId}/foto`, {
      method: "POST",
      headers: auth(user),
      body: form,
    }),
  );
}

describe.skipIf(!TEST_DATABASE_URL)("prueba de entrega (foto del repartidor)", () => {
  const orders: Record<string, number> = {};
  let centro = 0;
  let playaDriver = 0;
  let anyDriver = 0;
  const { storage, objects } = fakeStorage();
  let app: TestContext["app"];

  const setMode = (mode: string) =>
    call(ctx.app, "ownerC", "PATCH", "/panel/prueba-c/ajustes/restaurante", {
      reparto_foto_entrega: mode,
    });
  const step = (user: User, code: string, action: "salida" | "entregado") =>
    call(app, user, "POST", `/panel/prueba-c/mis-repartos/${orders[code]}/${action}`);

  beforeAll(async () => {
    ctx = await setupTestApp();
    app = ctx.appWith({ proofStorage: storage });
    centro =
      (
        await ctx.sql<{ id: number }[]>`
          SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
        `
      )[0]?.id ?? 0;
    // «otra» (d2) reparte solo en Playa Honda; «nuevo» (d1) en todos los locales.
    const members = await ctx.sql<{ id: number; user_id: string }[]>`
      INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email) VALUES
        ('00000000-0000-0000-0000-0000000000d2', 103, 'viewer', 'otra@test.local'),
        ('00000000-0000-0000-0000-0000000000d1', 103, 'viewer', 'nuevo@test.local')
      RETURNING id::int AS id, user_id::text AS user_id
    `;
    playaDriver = members.find((m) => m.user_id.endsWith("d2"))?.id ?? 0;
    anyDriver = members.find((m) => m.user_id.endsWith("d1"))?.id ?? 0;
    await ctx.sql`
      INSERT INTO public.membresia_rol (membership_id, rol_id)
      SELECT m, (SELECT id FROM public.rol WHERE code = 'driver' AND restaurante_id IS NULL)
      FROM unnest(${[playaDriver, anyDriver]}::bigint[]) AS m
    `;
    await ctx.sql`INSERT INTO public.membresia_sucursal (membership_id, sucursal_id) VALUES (${playaDriver}, 3002)`;
    for (const [code, estado, local, owner] of [
      ["P-1", "en_camino", 3002, playaDriver],
      ["P-2", "en_camino", 3002, playaDriver],
      ["P-3", "en_camino", 3002, playaDriver],
      ["P-4", "listo", 3002, playaDriver],
      ["P-5", "en_camino", centro, anyDriver],
    ] as const) {
      const [row] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.pedidos (restaurante_id, pedido_codigo, estado, tipo_despacho, sucursal_id,
                                    telefono, total, estado_pago, metodo_pago, direccion)
        VALUES (103, ${code}, ${estado}, 'delivery', ${local}, '+34600000001', 20, 'no_aplica',
                'efectivo', 'Calle Real 1')
        RETURNING id
      `;
      orders[code] = row?.id ?? 0;
      await ctx.sql`
        INSERT INTO public.pedido_reparto (pedido_id, restaurante_id, membership_id, asignado_por)
        VALUES (${orders[code] ?? 0}, 103, ${owner}, 'owner-c@test.local')
      `;
    }
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("sin la clave el ajuste vale «no»: no se ofrece la foto y entregar no la pide", async () => {
    const settings = await call(ctx.app, "ownerC", "GET", "/panel/prueba-c/ajustes");
    expect(settings.body.restaurante.reparto_foto_entrega).toBe("no");
    const mine = await call(app, "otherPerson", "GET", "/panel/prueba-c/mis-repartos");
    expect(mine.body.foto_entrega).toBe("no");

    const rejected = await sendPhoto(app, "otherPerson", orders["P-1"] ?? 0);
    expect(rejected.status).toBe(422);
    expect(rejected.body.reason).toBe("delivery_photo_disabled");
    expect(objects.size).toBe(0);
  });

  it("el ajuste solo admite no, opcional u obligatoria y lo guarda quien edita ajustes", async () => {
    expect((await setMode("a veces")).status).toBe(400);
    // El repartidor no edita ajustes.
    expect(
      (
        await call(ctx.app, "otherPerson", "PATCH", "/panel/prueba-c/ajustes/restaurante", {
          reparto_foto_entrega: "opcional",
        })
      ).status,
    ).toBe(403);
    expect((await setMode("opcional")).status).toBe(200);
    const settings = await call(ctx.app, "ownerC", "GET", "/panel/prueba-c/ajustes");
    expect(settings.body.restaurante.reparto_foto_entrega).toBe("opcional");
    const [row] = await ctx.sql<{ config_value: string }[]>`
      SELECT config_value FROM public.restaurante_config
      WHERE  restaurante_id = 103 AND config_key = 'reparto_foto_entrega'
    `;
    expect(row?.config_value).toBe("opcional");
  });

  it("sin almacén configurado responde 503", async () => {
    const result = await sendPhoto(ctx.app, "otherPerson", orders["P-1"] ?? 0);
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("storage_not_configured");
  });

  it("guarda la foto en el prefijo privado del pedido y registra quién la subió, sin URLs", async () => {
    const result = await sendPhoto(app, "otherPerson", orders["P-1"] ?? 0, jpg);
    expect(result.status).toBe(201);
    expect(result.body.fotos_entrega).toBe(1);

    const [row] = await ctx.sql<
      { ruta: string; tipo_mime: string; bytes: number; membership_id: number }[]
    >`
      SELECT ruta, tipo_mime, bytes, membership_id::int AS membership_id
      FROM public.pedido_foto_entrega WHERE pedido_id = ${orders["P-1"] ?? 0}
    `;
    expect(row?.ruta).toMatch(new RegExp(`^entregas/103/${orders["P-1"]}/[0-9a-f-]{36}\\.jpg$`));
    expect(row).toMatchObject({
      tipo_mime: "image/jpeg",
      bytes: jpg.length,
      membership_id: playaDriver,
    });
    expect(objects.get(row?.ruta ?? "")?.contentType).toBe("image/jpeg");
    expect(row?.ruta).not.toMatch(/^https?:/);
    const [log] = await ctx.sql<{ resultado: string; detalle: { fotos: number } }[]>`
      SELECT resultado, detalle FROM public.auditoria
      WHERE  accion = 'delivery.foto' AND recurso_id = ${String(orders["P-1"])}
             AND resultado = 'ok'
    `;
    expect(log).toMatchObject({ resultado: "ok", detalle: { fotos: 1 } });
  });

  it("valida el tipo real por la firma, el tamaño y el campo del formulario", async () => {
    const id = orders["P-2"] ?? 0;
    expect((await sendPhoto(app, "otherPerson", id, pdf)).status).toBe(415);
    expect((await sendPhoto(app, "otherPerson", id, null)).status).toBe(400);
    expect((await sendPhoto(app, "otherPerson", id, png, "archivo")).status).toBe(400);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png);
    const tooBig = await sendPhoto(app, "otherPerson", id, big);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.reason).toBe("too_large");
    const [count] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.pedido_foto_entrega WHERE pedido_id = ${id}
    `;
    expect(count?.n).toBe(0);
  });

  it("solo el repartidor asignado sube la foto, y solo con el pedido en camino", async () => {
    // P-5 es de «nuevo»; «otra» lo ve como inexistente.
    expect((await sendPhoto(app, "otherPerson", orders["P-5"] ?? 0)).status).toBe(404);
    // Quien no reparte no puede.
    expect((await sendPhoto(app, "cashierPlaya", orders["P-1"] ?? 0)).status).toBe(403);
    // P-4 aún está «listo»: la foto es del pedido en camino.
    const early = await sendPhoto(app, "otherPerson", orders["P-4"] ?? 0);
    expect(early.status).toBe(409);
    expect(early.body.reason).toBe("order_not_on_the_way");
    const [denied] = await ctx.sql<{ resultado: string }[]>`
      SELECT resultado FROM public.auditoria
      WHERE  accion = 'delivery.foto' AND recurso_id = ${String(orders["P-5"])}
    `;
    expect(denied?.resultado).toBe("denegado");
  });

  it("limita las fotos por pedido y no deja restos en el almacén", async () => {
    const id = orders["P-3"] ?? 0;
    for (let n = 1; n <= 3; n++) {
      expect((await sendPhoto(app, "otherPerson", id, png)).body.fotos_entrega).toBe(n);
    }
    const before = objects.size;
    const over = await sendPhoto(app, "otherPerson", id, png);
    expect(over.status).toBe(409);
    expect(over.body.reason).toBe("delivery_photo_limit_reached");
    expect(objects.size).toBe(before);
  });

  it("con «opcional» se entrega sin foto", async () => {
    // P-2 no tiene foto y el ajuste es opcional.
    expect((await step("otherPerson", "P-2", "entregado")).status).toBe(200);
  });

  it("con «obligatoria» no se entrega sin foto (422) y sí cuando existe", async () => {
    expect((await setMode("obligatoria")).status).toBe(200);
    const mine = await call(app, "otherPerson", "GET", "/panel/prueba-c/mis-repartos");
    expect(mine.body.foto_entrega).toBe("obligatoria");
    const p3 = mine.body.repartos.find((r: { id: number }) => r.id === orders["P-3"]);
    expect(p3.fotos_entrega).toBe(3);

    // Pedido en camino sin ninguna foto.
    await ctx.sql`UPDATE public.pedidos SET estado = 'en_camino' WHERE id = ${orders["P-4"] ?? 0}`;
    const refused = await step("otherPerson", "P-4", "entregado");
    expect(refused.status).toBe(422);
    expect(refused.body.reason).toBe("delivery_photo_required");
    const [still] = await ctx.sql<{ estado: string; entregado_at: Date | null }[]>`
      SELECT p.estado, pr.entregado_at FROM public.pedidos p
      JOIN   public.pedido_reparto pr ON pr.pedido_id = p.id WHERE p.id = ${orders["P-4"] ?? 0}
    `;
    expect(still).toMatchObject({ estado: "en_camino", entregado_at: null });
    const [denied] = await ctx.sql<{ resultado: string }[]>`
      SELECT resultado FROM public.auditoria
      WHERE  accion = 'delivery.entregado' AND recurso_id = ${String(orders["P-4"])}
    `;
    expect(denied?.resultado).toBe("denegado");

    // Con una foto ya se puede.
    expect((await sendPhoto(app, "otherPerson", orders["P-4"] ?? 0)).status).toBe(201);
    expect((await step("otherPerson", "P-4", "entregado")).status).toBe(200);
    // Y el pedido que ya tenía fotos también.
    expect((await step("otherPerson", "P-3", "entregado")).status).toBe(200);
  });

  it("el panel abre las fotos con URL firmada y auditoría, solo en los locales del usuario", async () => {
    const id = orders["P-3"] ?? 0;
    const view = await call(app, "ownerC", "GET", `/panel/prueba-c/orders/${id}/foto-entrega`);
    expect(view.status).toBe(200);
    expect(view.body.fotos).toHaveLength(3);
    expect(view.body.expira_en_segundos).toBe(120);
    expect(view.body.fotos[0].url).toMatch(
      new RegExp(`^https://storage\\.test/firmada/entregas/103/${id}/.+\\?ttl=120$`),
    );
    expect(view.body.fotos[0]).not.toHaveProperty("ruta");
    const [log] = await ctx.sql<{ detalle: { fotos: number } }[]>`
      SELECT detalle FROM public.auditoria
      WHERE  accion = 'orders.delivery_photo.view' AND recurso_id = ${String(id)}
    `;
    expect(log?.detalle.fotos).toBe(3);

    // Sin almacén, 503. El repartidor (sin orders.view) no usa esta ruta.
    expect(
      (await call(ctx.app, "ownerC", "GET", `/panel/prueba-c/orders/${id}/foto-entrega`)).status,
    ).toBe(503);
    expect(
      (await call(app, "otherPerson", "GET", `/panel/prueba-c/orders/${id}/foto-entrega`)).status,
    ).toBe(403);
    // El cajero de Playa Honda ve las de su local pero no las de un pedido del Centro.
    await ctx.sql`
      INSERT INTO public.pedido_foto_entrega (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
      VALUES (${orders["P-5"] ?? 0}, 103, 'entregas/103/x/a.png', 'image/png', 12)
    `;
    expect(
      (await call(app, "cashierPlaya", "GET", `/panel/prueba-c/orders/${id}/foto-entrega`)).status,
    ).toBe(200);
    expect(
      (
        await call(
          app,
          "cashierPlaya",
          "GET",
          `/panel/prueba-c/orders/${orders["P-5"]}/foto-entrega`,
        )
      ).status,
    ).toBe(404);
    // Otro restaurante no accede a datos de este.
    expect(
      (await call(app, "ownerA", "GET", `/panel/prueba-c/orders/${id}/foto-entrega`)).status,
    ).toBeGreaterThanOrEqual(403);
  });

  it("el tablero y el historial indican cuántas fotos tiene cada pedido", async () => {
    const board = await call(app, "ownerC", "GET", "/panel/prueba-c/orders?vista=tablero");
    const p3 = board.body.pedidos.find((p: { id: number }) => p.id === orders["P-3"]);
    expect(p3.fotos_entrega).toBe(3);
    const history = await call(app, "ownerC", "GET", "/panel/prueba-c/orders/historial?q=P-3");
    expect(history.body.pedidos[0].fotos_entrega).toBe(3);
  });

  it("la base impide una foto de otro restaurante o con un repartidor de otro", async () => {
    const [other] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.pedidos WHERE restaurante_id <> 103 LIMIT 1
    `;
    if (other) {
      await expect(
        ctx.sql`
          INSERT INTO public.pedido_foto_entrega (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
          VALUES (${other.id}, 103, 'entregas/103/y/a.png', 'image/png', 12)
        `,
      ).rejects.toThrow(/otro restaurante/);
    }
    const [foreign] = await ctx.sql<{ id: number }[]>`
      SELECT id::int AS id FROM public.local_memberships WHERE restaurante_id <> 103 LIMIT 1
    `;
    expect(foreign).toBeDefined();
    await expect(
      ctx.sql`
        INSERT INTO public.pedido_foto_entrega
          (pedido_id, restaurante_id, membership_id, ruta, tipo_mime, bytes)
        VALUES (${orders["P-5"] ?? 0}, 103, ${foreign?.id ?? 0}, 'entregas/103/z/a.png', 'image/png', 12)
      `,
    ).rejects.toThrow(/otro restaurante/);
  });
});
