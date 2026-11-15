import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
const canal = { a: 0, b: 0 };
const ids = { a: 0, aOtro: 0, b: 0 };
const PHONE = "+34600777111";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function panel(user: keyof typeof USERS, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

async function insertChannel(restauranteId: number, phoneNumberId: string) {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.canal_whatsapp
      (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
    VALUES (${restauranteId}, NULL, 'kapso', ${phoneNumberId}, '+15550000009', 'sandbox', 'activo')
    RETURNING id
  `;
  return Number(row?.id);
}

async function insertHandoff(
  restauranteId: number,
  canalId: number,
  telefono: string,
  origen: string,
) {
  const [row] = await ctx.sql<{ id: string }[]>`
    INSERT INTO public.escalaciones (restaurante_id, telefono, problema, estado, tipo_escalacion, contexto)
    VALUES (${restauranteId}, ${telefono}, 'Llegó frío', 'pendiente', 'reclamo',
            ${ctx.sql.json({ canal_id: canalId, origen, motivo: "reclamo" })})
    RETURNING id
  `;
  return Number(row?.id);
}

describe.skipIf(!TEST_DATABASE_URL)("derivaciones del agente en el panel", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT r, m, 'complemento'
      FROM unnest(ARRAY[101, 102]) AS r, unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
    canal.a = await insertChannel(101, "pn-deriv-panel-a");
    canal.b = await insertChannel(102, "pn-deriv-panel-b");
    ids.a = await insertHandoff(101, canal.a, PHONE, "agente_whatsapp");
    // De otro origen (histórico de Chatwoot): no debe aparecer ni poder tocarse.
    ids.aOtro = await insertHandoff(101, canal.a, "+34600777222", "chatwoot");
    ids.b = await insertHandoff(102, canal.b, PHONE, "agente_whatsapp");
    await ctx.sql`
      INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono, pausado_hasta, pausado_por)
      VALUES (${canal.a}, 101, ${PHONE}, '2026-11-03T15:00:00Z', 'derivar_humano'),
             (${canal.b}, 102, ${PHONE}, '2026-11-03T15:00:00Z', 'derivar_humano')
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lista solo las derivaciones del agente del propio restaurante", async () => {
    const { status, body } = await panel("ownerA", "GET", "/panel/prueba-a/derivaciones");
    expect(status).toBe(200);
    expect(body.derivaciones.map((d: Json) => d.id)).toEqual([ids.a]);
    expect(body.abiertas).toBe(1);
    expect(body.derivaciones[0]).toMatchObject({
      telefono: PHONE,
      motivo: "reclamo",
      resumen: "Llegó frío",
    });
    expect(body.derivaciones[0].agente_pausado_hasta).not.toBeNull();
  });

  it("quien no tiene el permiso no las ve ni las atiende", async () => {
    expect((await panel("viewerA", "GET", "/panel/prueba-a/derivaciones")).status).toBe(403);
    expect(
      (
        await panel("viewerA", "PATCH", `/panel/prueba-a/derivaciones/${ids.a}`, {
          estado: "resuelta",
        })
      ).status,
    ).toBe(403);
  });

  it("no toca derivaciones de otro restaurante ni de otro origen", async () => {
    const other = await panel("ownerA", "PATCH", `/panel/prueba-a/derivaciones/${ids.b}`, {
      estado: "resuelta",
    });
    expect(other.status).toBe(404);
    const history = await panel("ownerA", "PATCH", `/panel/prueba-a/derivaciones/${ids.aOtro}`, {
      estado: "resuelta",
    });
    expect(history.status).toBe(404);
    const [row] = await ctx.sql`SELECT estado FROM public.escalaciones WHERE id = ${ids.b}`;
    expect(row?.estado).toBe("pendiente");
  });

  it("atender la derivación la resuelve y reanuda al agente solo en esa conversación", async () => {
    const { status, body } = await panel(
      "ownerA",
      "PATCH",
      `/panel/prueba-a/derivaciones/${ids.a}`,
      {
        estado: "resuelta",
      },
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ estado: "resuelta", agente_reanudado: true });
    const [esc] =
      await ctx.sql`SELECT estado, resolved_by, resolved_at FROM public.escalaciones WHERE id = ${ids.a}`;
    expect(esc?.estado).toBe("resuelta");
    expect(esc?.resolved_by).toBe("owner-a@test.local");
    expect(esc?.resolved_at).not.toBeNull();
    const rows =
      await ctx.sql`SELECT restaurante_id, pausado_hasta FROM public.whatsapp_conversacion WHERE telefono = ${PHONE} ORDER BY restaurante_id`;
    expect(rows[0]?.pausado_hasta).toBeNull();
    expect(rows[1]?.pausado_hasta).not.toBeNull();
    const list = await panel("ownerA", "GET", "/panel/prueba-a/derivaciones?estado=pendiente");
    expect(list.body.abiertas).toBe(0);
  });

  it("puede resolver sin reanudar al agente y reabrir", async () => {
    await ctx.sql`
      UPDATE public.whatsapp_conversacion SET pausado_hasta = '2026-11-03T15:00:00Z', pausado_por = 'derivar_humano'
      WHERE canal_id = ${canal.a}`;
    const kept = await panel("ownerA", "PATCH", `/panel/prueba-a/derivaciones/${ids.a}`, {
      estado: "resuelta",
      reanudar_agente: false,
    });
    expect(kept.body.agente_reanudado).toBe(false);
    const [conv] =
      await ctx.sql`SELECT pausado_hasta FROM public.whatsapp_conversacion WHERE canal_id = ${canal.a}`;
    expect(conv?.pausado_hasta).not.toBeNull();
    const reopened = await panel("ownerA", "PATCH", `/panel/prueba-a/derivaciones/${ids.a}`, {
      estado: "pendiente",
    });
    expect(reopened.status).toBe(200);
    const [esc] =
      await ctx.sql`SELECT estado, resolved_at FROM public.escalaciones WHERE id = ${ids.a}`;
    expect(esc?.estado).toBe("pendiente");
    expect(esc?.resolved_at).toBeNull();
  });
});
