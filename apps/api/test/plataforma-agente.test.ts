import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/repositories/restaurants";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;
let ctx: TestContext;

async function call(user: keyof typeof USERS, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(`/plataforma${path}`, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const find = (json: Json, key: string) => json.parametros.find((p: Json) => p.clave === key);

describe.skipIf(!TEST_DATABASE_URL)("parámetros del agente (interno)", () => {
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

  it("soporte lee la plantilla pero no la edita; el restaurante sin sesión interna no entra", async () => {
    const read = await call("platformSupport", "GET", "/agente/plantilla");
    expect(read.status).toBe(200);
    expect(find(read.body, "agente_modelo")).toMatchObject({ editable_por: "interno" });
    expect(
      (
        await call("platformSupport", "PUT", "/agente/plantilla", {
          valores: { agente_tono: "formal" },
        })
      ).status,
    ).toBe(403);
    expect((await call("ownerA", "GET", "/agente/plantilla")).status).toBe(403);
  });

  it("admin cambia la plantilla, la valida, la audita y los restaurantes la heredan", async () => {
    const bad = await call("platformAdmin", "PUT", "/agente/plantilla", {
      valores: { cart_expiry_minutes: 1 },
    });
    expect(bad.status).toBe(422);
    const ok = await call("platformAdmin", "PUT", "/agente/plantilla", {
      valores: { cart_expiry_minutes: 40 },
    });
    expect(ok.status).toBe(200);
    expect((await loadConfig(ctx.sql, 102)).get("cart_expiry_minutes")).toBe("40");
    const [log] = await ctx.sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.auditoria WHERE accion = 'agent.template.update'
    `;
    expect(log?.n).toBe(1);
  });

  it("cuenta cuántos restaurantes personalizan cada parámetro", async () => {
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
      VALUES (101, 'cart_expiry_minutes', '20') ON CONFLICT (config_key, restaurante_id) DO NOTHING
    `;
    const { body } = await call("platformSupport", "GET", "/agente/plantilla");
    expect(find(body, "cart_expiry_minutes")).toMatchObject({ valor: "40", personalizan: 1 });
  });

  it("por restaurante: ve y edita incluso lo interno y lo premium, y restablece", async () => {
    const view = await call("platformSupport", "GET", "/restaurantes/102/agente");
    expect(view.status).toBe(200);
    expect(find(view.body, "agente_modelo")).toBeDefined();
    const set = await call("platformAdmin", "PUT", "/restaurantes/102/agente", {
      valores: { agente_limite_mensajes_dia: 50 },
    });
    expect(set.status).toBe(200);
    expect((await loadConfig(ctx.sql, 102)).get("agente_limite_mensajes_dia")).toBe("50");
    await call("platformAdmin", "PUT", "/restaurantes/102/agente", {
      valores: { agente_limite_mensajes_dia: null },
    });
    expect((await loadConfig(ctx.sql, 102)).get("agente_limite_mensajes_dia")).not.toBe("50");
    expect((await call("platformAdmin", "GET", "/restaurantes/99999/agente")).status).toBe(404);
  });
});
