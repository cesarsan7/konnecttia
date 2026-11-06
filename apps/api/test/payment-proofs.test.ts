import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProofStorage } from "../src/context";
import { boardFingerprint } from "../src/routes/panel-stream";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;

const NOW = new Date("2026-11-03T13:00:00Z");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pdf = new TextEncoder().encode("%PDF-1.7\n%…");
const BANK = { iban: "ES9121000418450200051332", titular: "Cafetería A SL", banco: "Banco X" };

/** Almacén de justificantes simulado: guarda los objetos en memoria. */
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

let counter = 0;

/** Pedido directo en base de datos (como los de n8n) con cobro pendiente por defecto. */
async function createOrder(
  overrides: {
    restaurante?: number;
    sucursal?: number | null;
    metodo?: string;
    pago?: string;
  } = {},
) {
  counter += 1;
  const [row] = await ctx.sql<{ id: number; token: string }[]>`
    INSERT INTO public.pedidos
      (restaurante_id, telefono, estado, estado_pago, metodo_pago, canal, sucursal_id, created_at)
    VALUES (${overrides.restaurante ?? 101}, ${`+3460000${1000 + counter}`}, 'pendiente_pago',
            ${overrides.pago ?? "pendiente"}, ${overrides.metodo ?? "transferencia"}, 'web',
            ${overrides.sucursal ?? null}, '2026-11-03 12:59:00'::text::timestamp)
    RETURNING id, tracking_token AS token
  `;
  if (!row) throw new Error("pedido no creado");
  return row;
}

async function upload(
  app: TestContext["app"],
  token: string,
  bytes: Uint8Array = png,
  ip = "203.0.113.50",
) {
  const form = new FormData();
  form.append("justificante", new File([bytes], "captura.png", { type: "image/png" }));
  const response = await app.request(`/public/orders/${token}/justificante`, {
    method: "POST",
    headers: { "x-real-ip": ip },
    body: form,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function tracking(token: string) {
  const response = await ctx.app.request(`/public/orders/${token}`);
  return (await response.json()) as Record<string, unknown>;
}

describe.skipIf(!TEST_DATABASE_URL)("justificantes de pago (Bizum y transferencia)", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      UPDATE public.restaurante
      SET    datos_bancarios = ${ctx.sql.json({ ...BANK, bizum: "600111222", concepto: "Pago pizzas" })}
      WHERE  id = 101
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("datos para pagar en el seguimiento", () => {
    it("transferencia: IBAN y titular, sin teléfono de Bizum ni concepto del restaurante", async () => {
      const order = await createOrder({ metodo: "transferencia" });
      const body = await tracking(order.token);
      expect(body.datosBancarios).toEqual(BANK);
      expect(body.aceptaJustificante).toBe(true);
      expect(body.justificantes).toBe(0);
    });

    it("Bizum: solo el teléfono de Bizum", async () => {
      const order = await createOrder({ metodo: "bizum" });
      expect((await tracking(order.token)).datosBancarios).toEqual({ bizum: "600111222" });
    });

    it("con el cobro confirmado o con otro método no se muestra nada", async () => {
      const paid = await createOrder({ pago: "pagado" });
      const paidBody = await tracking(paid.token);
      expect(paidBody.datosBancarios).toBeNull();
      expect(paidBody.aceptaJustificante).toBe(false);
      const cash = await createOrder({ metodo: "efectivo", pago: "no_aplica" });
      expect((await tracking(cash.token)).datosBancarios).toBeNull();
    });
  });

  describe("subida pública", () => {
    it("sin almacén configurado responde 503", async () => {
      const order = await createOrder();
      expect((await upload(ctx.app, order.token)).status).toBe(503);
    });

    it("guarda el archivo en la ruta privada del pedido y registra la fila sin URLs", async () => {
      const { storage, objects } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();

      const first = await upload(app, order.token);
      expect(first.status).toBe(201);
      expect(first.body.justificantes).toBe(1);
      const [path] = [...objects.keys()];
      expect(path).toMatch(new RegExp(`^101/${order.id}/[0-9a-f-]{36}\\.png$`));
      expect(objects.get(path ?? "")?.contentType).toBe("image/png");

      const pdfResult = await upload(app, order.token, pdf);
      expect(pdfResult.status).toBe(201);
      expect([...objects.keys()].some((key) => key.endsWith(".pdf"))).toBe(true);

      const rows = await ctx.sql<{ ruta: string; tipo_mime: string; bytes: number }[]>`
        SELECT ruta, tipo_mime, bytes FROM public.pedido_justificante
        WHERE  pedido_id = ${order.id} ORDER BY id
      `;
      expect(rows.map((row) => row.tipo_mime)).toEqual(["image/png", "application/pdf"]);
      expect(rows.every((row) => !row.ruta.startsWith("http"))).toBe(true);
      expect((await tracking(order.token)).justificantes).toBe(2);
    });

    it("valida el tipo real y el tamaño, no lo que diga el navegador", async () => {
      const { storage, objects } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();

      const fake = await upload(app, order.token, new TextEncoder().encode("<svg/>"));
      expect(fake.status).toBe(415);
      expect(fake.body.error).toBe("invalid_proof");
      const empty = await upload(app, order.token, new Uint8Array());
      expect(empty.status).toBe(400);
      const big = new Uint8Array(5 * 1024 * 1024 + 1);
      big.set(png);
      const tooBig = await upload(app, order.token, big);
      expect(tooBig.status).toBe(413);
      expect(objects.size).toBe(0);
    });

    it("solo con el cobro pendiente y con el token del pedido", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const paid = await createOrder({ pago: "pagado" });
      const denied = await upload(app, paid.token);
      expect(denied.status).toBe(409);
      expect(denied.body.error).toBe("payment_not_pending");
      const cash = await createOrder({ metodo: "efectivo", pago: "no_aplica" });
      expect((await upload(app, cash.token)).status).toBe(409);
      expect((await upload(app, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
      expect((await upload(app, "261103-1001")).status).toBe(404);
    });

    it("respeta el máximo por pedido (valor técnico y clave del restaurante)", async () => {
      const { storage, objects } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      for (let i = 0; i < 3; i++) expect((await upload(app, order.token)).status).toBe(201);
      const fourth = await upload(app, order.token);
      expect(fourth.status).toBe(409);
      expect(fourth.body.error).toBe("proof_limit_reached");
      expect(objects.size).toBe(3);
      const body = await tracking(order.token);
      expect(body.aceptaJustificante).toBe(false);

      await ctx.sql`
        INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
        VALUES (101, 'justificantes_max_por_pedido', '4')
      `;
      expect((await upload(app, order.token)).status).toBe(201);
      expect((await upload(app, order.token)).status).toBe(409);
      await ctx.sql`
        DELETE FROM public.restaurante_config
        WHERE restaurante_id = 101 AND config_key = 'justificantes_max_por_pedido'
      `;
    });

    it("dos subidas a la vez no superan el máximo y no dejan archivos huérfanos", async () => {
      const { storage, objects } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => upload(app, order.token, png, "203.0.113.77")),
      );
      expect(results.filter((result) => result.status === 201).length).toBe(3);
      const [count] = await ctx.sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM public.pedido_justificante WHERE pedido_id = ${order.id}
      `;
      expect(count?.n).toBe(3);
      expect(objects.size).toBe(3);
    });

    it("limita por IP las subidas seguidas", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const order = await createOrder();
        statuses.push((await upload(app, order.token, png, "198.51.100.9")).status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    });
  });

  describe("panel", () => {
    const list = (app: TestContext["app"], user: keyof typeof USERS, slug: string, id: number) =>
      app.request(`/panel/${slug}/orders/${id}/justificantes`, { headers: auth(user) });

    it("el tablero indica cuántos justificantes tiene cada pedido y la huella cambia", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      const before = await boardFingerprint(ctx.sql, 101, null, NOW);
      await upload(app, order.token, png, "203.0.113.60");
      expect(await boardFingerprint(ctx.sql, 101, null, NOW)).not.toBe(before);

      const response = await app.request("/panel/prueba-a/orders?vista=tablero", {
        headers: auth("ownerA"),
      });
      const { pedidos } = (await response.json()) as {
        pedidos: { id: number; justificantes: number }[];
      };
      expect(pedidos.find((pedido) => pedido.id === order.id)?.justificantes).toBe(1);
    });

    it("devuelve URLs firmadas de corta duración y deja rastro en auditoría", async () => {
      const { storage, objects } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      await upload(app, order.token, png, "203.0.113.61");

      const response = await list(app, "ownerA", "prueba-a", order.id);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        justificantes: { url: string; tipo_mime: string }[];
        expira_en_segundos: number;
      };
      expect(body.justificantes).toHaveLength(1);
      expect(body.expira_en_segundos).toBeLessThanOrEqual(300);
      expect(body.justificantes[0]?.url).toContain([...objects.keys()][0]);
      expect(body.justificantes[0]?.url).toContain(`ttl=${body.expira_en_segundos}`);
      const audited = await ctx.sql`
        SELECT 1 FROM public.auditoria
        WHERE  accion = 'orders.proof.view' AND recurso_id = ${String(order.id)}
      `;
      expect(audited.length).toBe(1);
    });

    it("exige poder confirmar cobros y que el almacén esté configurado", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      expect((await list(app, "viewerA", "prueba-a", order.id)).status).toBe(403);
      expect((await app.request(`/panel/prueba-a/orders/${order.id}/justificantes`)).status).toBe(
        401,
      );
      expect((await list(ctx.app, "ownerA", "prueba-a", order.id)).status).toBe(503);
    });

    it("el restaurante B no ve los justificantes del A aunque conozca el id", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const order = await createOrder();
      await upload(app, order.token, png, "203.0.113.62");
      expect((await list(app, "ownerB", "prueba-b", order.id)).status).toBe(404);
      expect((await list(app, "ownerB", "prueba-a", order.id)).status).toBe(403);
    });

    it("un usuario limitado a un local no ve los justificantes de otro", async () => {
      const { storage } = fakeStorage();
      const app = ctx.appWith({ proofStorage: storage });
      const [centro] = await ctx.sql<{ id: number }[]>`
        SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
      `;
      const own = await createOrder({ restaurante: 103, sucursal: 3002, metodo: "bizum" });
      const other = await createOrder({ restaurante: 103, sucursal: centro?.id, metodo: "bizum" });
      await upload(app, own.token, png, "203.0.113.63");
      await upload(app, other.token, png, "203.0.113.64");

      expect((await list(app, "managerPlaya", "prueba-c", own.id)).status).toBe(200);
      expect((await list(app, "managerPlaya", "prueba-c", other.id)).status).toBe(404);
      expect((await list(app, "ownerC", "prueba-c", other.id)).status).toBe(200);
    });
  });
});
