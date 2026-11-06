import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
const origin = "https://panel.example.test";
type Sent = { to: string; subject: string; html: string; text: string };

function recover(app: ReturnType<TestContext["appWith"]>, email: unknown, ip = "203.0.113.9") {
  return app.request("/auth/recuperar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "x-real-ip": ip },
    body: JSON.stringify({ email }),
  });
}

describe.skipIf(!TEST_DATABASE_URL)("recuperar contraseña", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it("envía el enlace con Resend y redirige a /panel/restablecer", async () => {
    const sent: Sent[] = [];
    const asked: { email: string; redirectTo: string }[] = [];
    const app = ctx.appWith({
      allowedOrigins: [origin],
      mailer: { send: async (message) => void sent.push(message) },
      generateRecoveryLink: async (email, redirectTo) => {
        asked.push({ email, redirectTo });
        return "https://auth.example.test/verify?token=abc&type=recovery";
      },
    });
    const response = await recover(app, "  Ana@Example.TEST ");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, enviado_por: "easyorder" });
    expect(asked).toEqual([
      { email: "ana@example.test", redirectTo: `${origin}/panel/restablecer` },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("ana@example.test");
    expect(sent[0]?.html).toContain("https://auth.example.test/verify?token=abc&amp;type=recovery");
  });

  it("responde igual si el email no tiene cuenta, sin enviar nada", async () => {
    const sent: Sent[] = [];
    const app = ctx.appWith({
      allowedOrigins: [origin],
      mailer: { send: async (message) => void sent.push(message) },
      generateRecoveryLink: async () => null,
    });
    const response = await recover(app, "nadie@example.test");
    expect(await response.json()).toEqual({ ok: true, enviado_por: "easyorder" });
    expect(sent).toHaveLength(0);
  });

  it("sin clave de servicio o sin Resend, deja que el panel use Supabase", async () => {
    const app = ctx.appWith({ allowedOrigins: [origin], mailer: null, generateRecoveryLink: null });
    expect(await (await recover(app, "ana@example.test")).json()).toEqual({
      ok: true,
      enviado_por: "supabase",
    });
  });

  it("valida el email y limita por email y por IP", async () => {
    const sent: Sent[] = [];
    const app = ctx.appWith({
      allowedOrigins: [origin],
      mailer: { send: async (message) => void sent.push(message) },
      generateRecoveryLink: async () => "https://auth.example.test/verify?token=x",
    });
    expect((await recover(app, "no-es-un-email")).status).toBe(400);
    for (let i = 0; i < 4; i++) await recover(app, "ana@example.test", `198.51.100.${i}`);
    // Tras 3 emails a la misma dirección, responde igual pero no envía más.
    expect(sent).toHaveLength(3);
    for (let i = 0; i < 5; i++) await recover(app, `otra${i}@example.test`, "192.0.2.1");
    expect((await recover(app, "ultima@example.test", "192.0.2.1")).status).toBe(429);
  });
});
