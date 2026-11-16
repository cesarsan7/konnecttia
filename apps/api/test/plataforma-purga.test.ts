import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;
let ctx: TestContext;
let allowed: ReturnType<TestContext["appWith"]>;

async function purge(
  user: keyof typeof USERS,
  id: number,
  body: unknown,
  app: ReturnType<TestContext["appWith"]> = allowed,
) {
  const response = await app.request(`/plataforma/restaurantes/${id}/purgar-pedidos`, {
    method: "POST",
    headers: { ...auth(user), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const count = async (table: string, restaurante: number) => {
  const [row] = await ctx.sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${ctx.sql(`public.${table}`)} WHERE restaurante_id = ${restaurante}
  `;
  return row?.n ?? 0;
};

describe.skipIf(!TEST_DATABASE_URL)("purga de pedidos (interno)", () => {
  let canal = 0;
  beforeAll(async () => {
    ctx = await setupTestApp();
    allowed = ctx.appWith({ purgeOrdersAllowed: true });
    await ctx.sql`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo) VALUES
        (${USERS.platformAdmin.userId}::uuid, ${USERS.platformAdmin.email}, 'admin', true),
        (${USERS.platformSupport.userId}::uuid, ${USERS.platformSupport.email}, 'soporte', true)
    `;
    const [row] = await ctx.sql<{ id: string }[]>`
      INSERT INTO public.canal_whatsapp
        (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
      VALUES (102, NULL, 'kapso', 'pn-purga', '+15550000077', 'sandbox', 'activo')
      RETURNING id
    `;
    canal = Number(row?.id);
    for (const restaurante of [101, 102]) {
      await ctx.sql`
        INSERT INTO public.pedidos (restaurante_id, telefono, estado, created_at) VALUES
          (${restaurante}, '+34600000051', 'listo', now() - interval '10 days'),
          (${restaurante}, '+34600000052', 'recibido', now())
      `;
    }
    await ctx.sql`
      INSERT INTO public.agente_carrito (canal_id, restaurante_id, telefono, estado)
      VALUES (${canal}, 102, '+34600000051', 'abierto')
    `;
    await ctx.sql`
      INSERT INTO public.escalaciones (restaurante_id, telefono, problema, estado, tipo_escalacion, contexto)
      VALUES (102, '+34600000051', 'Prueba', 'pendiente', 'reclamo',
              ${ctx.sql.json({ canal_id: canal, origen: "agente_whatsapp" })}),
             (102, '+34600000052', 'Histórico', 'pendiente', 'reclamo',
              ${ctx.sql.json({ origen: "chatwoot" })})
    `;
    await ctx.sql`
      INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono)
      VALUES (${canal}, 102, '+34600000051')
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("en producción (sin PURGA_PEDIDOS_PERMITIDA) responde 403 y no borra nada", async () => {
    const { status, body } = await purge(
      "platformAdmin",
      102,
      { confirmar: "prueba-b" },
      ctx.appWith({}),
    );
    expect(status).toBe(403);
    expect(body.reason).toBe("purge_disabled");
    expect(await count("pedidos", 102)).toBe(2);
  });

  it("solo admin y con el enlace escrito", async () => {
    expect((await purge("platformSupport", 102, { confirmar: "prueba-b" })).status).toBe(403);
    expect((await purge("ownerB", 102, { confirmar: "prueba-b" })).status).toBe(403);
    const wrong = await purge("platformAdmin", 102, { confirmar: "otro" });
    expect(wrong.status).toBe(422);
    expect(wrong.body.reason).toBe("confirmation_mismatch");
    expect(await count("pedidos", 102)).toBe(2);
  });

  it("con fecha borra solo lo anterior, y no toca otro restaurante", async () => {
    const { status, body } = await purge("platformAdmin", 102, {
      confirmar: "prueba-b",
      antes_de: new Date(Date.now() - 24 * 3_600_000).toISOString(),
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ pedidos: 1, carritos: 0, derivaciones: 0, conversaciones: 0 });
    expect(body.archivos).toMatchObject({ justificantes: "omitido" });
    expect(await count("pedidos", 102)).toBe(1);
    expect(await count("pedidos", 101)).toBe(2);
  });

  it("completa: pedidos y, si se pide, carritos, derivaciones del agente y conversaciones", async () => {
    const { status, body } = await purge("platformAdmin", 102, {
      confirmar: "prueba-b",
      carritos: true,
      derivaciones: true,
      conversaciones: true,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ pedidos: 1, carritos: 1, derivaciones: 1, conversaciones: 1 });
    expect(await count("pedidos", 102)).toBe(0);
    expect(await count("agente_carrito", 102)).toBe(0);
    // La escalación de otro origen (histórico) se conserva.
    expect(await count("escalaciones", 102)).toBe(1);
    expect(await count("whatsapp_conversacion", 102)).toBe(0);
    expect(await count("pedidos", 101)).toBe(2);
    const [audit] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.auditoria
      WHERE accion = 'plataforma.restaurante.purgar_pedidos' AND restaurante_id = 102
    `;
    expect(audit?.n).toBe(2);
  });

  it("el detalle del restaurante dice si la purga está permitida", async () => {
    const yes = await allowed.request("/plataforma/restaurantes/102", {
      headers: auth("platformAdmin"),
    });
    expect(((await yes.json()) as Json).purga_pedidos_permitida).toBe(true);
    const no = await ctx.app.request("/plataforma/restaurantes/102", {
      headers: auth("platformAdmin"),
    });
    expect(((await no.json()) as Json).purga_pedidos_permitida).toBe(false);
  });
});
