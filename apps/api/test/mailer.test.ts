import { describe, expect, it } from "vitest";
import { createResendMailer, inviteEmail } from "../src/lib/mailer";

describe("emails con Resend", () => {
  it("envía con la clave en la cabecera y el remitente configurado", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const mailer = createResendMailer("re_test_key", "EasyOrder <hola@example.test>", (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    await mailer.send({ to: "a@example.test", subject: "Hola", html: "<p>Hola</p>", text: "Hola" });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect((calls[0]?.init.headers as Record<string, string> | undefined)?.Authorization).toBe(
      "Bearer re_test_key",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      from: "EasyOrder <hola@example.test>",
      to: "a@example.test",
    });
  });

  it("un error de Resend se lanza sin incluir la clave", async () => {
    const mailer = createResendMailer(
      "re_secret",
      "x@example.test",
      (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch,
    );
    await expect(
      mailer.send({ to: "a@example.test", subject: "s", html: "h", text: "t" }),
    ).rejects.toThrow("Resend respondió 422");
  });

  it("el email de invitación escapa el nombre del restaurante", () => {
    const email = inviteEmail({
      restaurante: 'Bar <script>"x"</script>',
      rol: "Personal",
      link: "https://panel.example.test/panel/unirse/abc",
      dias: 7,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("https://panel.example.test/panel/unirse/abc");
    expect(email.text).toContain("caduca en 7 días");
    expect(email.subject).toContain("Bar <script>");
  });
});
