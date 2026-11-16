import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/repositories/restaurants";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;
let ctx: TestContext;

async function call(user: keyof typeof USERS, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: { ...auth(user), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const URL_A = "/panel/prueba-a/ajustes/agente";
const param = (json: Json, key: string) => json.parametros.find((p: Json) => p.clave === key);

describe.skipIf(!TEST_DATABASE_URL)("configuración del agente con plantilla estándar", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      SELECT 101, m, 'complemento' FROM unnest(ARRAY['whatsapp.channel', 'whatsapp.agent']) AS m
      ON CONFLICT DO NOTHING
    `;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("sin el módulo del agente no hay pestaña (403) y sin permiso tampoco", async () => {
    expect((await call("ownerB", "GET", "/panel/prueba-b/ajustes/agente")).status).toBe(403);
    expect((await call("viewerA", "GET", URL_A)).status).toBe(403);
  });

  it("hereda la plantilla; lo interno no se muestra; lo premium sale bloqueado", async () => {
    const { status, body } = await call("ownerA", "GET", URL_A);
    expect(status).toBe(200);
    expect(param(body, "agente_tono")).toMatchObject({
      valor: "cercano",
      origen: "plantilla",
      nivel: "basico",
      bloqueado: false,
    });
    expect(param(body, "cart_expiry_minutes")).toMatchObject({ valor: "30", origen: "plantilla" });
    expect(param(body, "agente_notif_estados")).toMatchObject({
      nivel: "premium",
      bloqueado: true,
    });
    expect(param(body, "agente_modelo")).toBeUndefined();
  });

  it("personalizar guarda un valor propio y restablecer vuelve a heredar", async () => {
    const set = await call("ownerA", "PATCH", URL_A, { valores: { agente_tono: "formal" } });
    expect(set.status).toBe(200);
    let view = await call("ownerA", "GET", URL_A);
    expect(param(view.body, "agente_tono")).toMatchObject({
      valor: "formal",
      origen: "propio",
      valor_plantilla: "cercano",
    });
    await call("ownerA", "PATCH", URL_A, { valores: { agente_tono: null } });
    view = await call("ownerA", "GET", URL_A);
    expect(param(view.body, "agente_tono")).toMatchObject({
      valor: "cercano",
      origen: "plantilla",
    });
  });

  it("valida tipo, límites, opciones y correo", async () => {
    const reject = async (valores: Json, reason: string) => {
      const result = await call("ownerA", "PATCH", URL_A, { valores });
      expect(result.status).toBe(422);
      expect(result.body.reason).toBe(reason);
    };
    await reject({ agente_tono: "gracioso" }, "invalid_value");
    await reject({ cart_expiry_minutes: 1 }, "out_of_range");
    await reject({ cart_expiry_minutes: 12.5 }, "invalid_value");
    await reject({ agente_derivar_email: "no-es-correo" }, "invalid_email");
    await reject({ agente_nombre_visible: "x".repeat(61) }, "too_long");
    await reject({ inventado: "1" }, "unknown_param");
    // Los parámetros solo internos no se editan desde el panel del restaurante.
    await reject({ agente_modelo: "otro" }, "unknown_param");
  });

  it("lo premium exige el módulo premium, en la API también", async () => {
    const blocked = await call("ownerA", "PATCH", URL_A, {
      valores: { agente_notif_estados: ["listo"] },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({
      reason: "module_required",
      modulos: ["whatsapp.agent_pro"],
    });
    await ctx.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
      VALUES (101, 'whatsapp.agent_pro', 'complemento')
    `;
    const ok = await call("ownerA", "PATCH", URL_A, {
      valores: { agente_notif_estados: ["entregado", "listo", "listo"] },
    });
    expect(ok.status).toBe(200);
    const view = await call("ownerA", "GET", URL_A);
    // En el orden del diccionario y sin repetidos.
    expect(param(view.body, "agente_notif_estados")).toMatchObject({
      valor: '["listo","entregado"]',
      bloqueado: false,
    });
  });

  it("loadConfig mezcla lo propio con la plantilla, sin tocar a otros restaurantes", async () => {
    await call("ownerA", "PATCH", URL_A, { valores: { cart_expiry_minutes: 45 } });
    const a = await loadConfig(ctx.sql, 101);
    const b = await loadConfig(ctx.sql, 102);
    expect(a.get("cart_expiry_minutes")).toBe("45");
    expect(a.get("agente_pausa_derivar_minutos")).toBe("120");
    expect(b.get("cart_expiry_minutes")).toBe("30");
    // agente_activo no se hereda: cada restaurante lo activa.
    expect(b.has("agente_activo")).toBe(false);
  });
});
