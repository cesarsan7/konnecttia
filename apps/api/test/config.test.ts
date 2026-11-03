import { describe, expect, it } from "vitest";
import { notificationWebhookUrl } from "../src/repositories/restaurants";

describe("webhook de avisos", () => {
  it("usa la clave nueva y, si falta, la antigua", () => {
    const nueva = new Map([
      ["n8n_webhook_avisos", "https://n8n.example/webhook/avisos"],
      ["chatwoot_webhook_prod", "https://viejo.example/webhook/x"],
    ]);
    expect(notificationWebhookUrl(nueva)).toBe("https://n8n.example/webhook/avisos");
    expect(
      notificationWebhookUrl(new Map([["chatwoot_webhook_prod", "https://viejo.example/w"]])),
    ).toBe("https://viejo.example/w");
    expect(notificationWebhookUrl(new Map([["n8n_webhook_avisos", "no-es-url"]]))).toBeNull();
  });
});
