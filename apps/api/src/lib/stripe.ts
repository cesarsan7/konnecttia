import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente mínimo de Stripe por HTTP (sin SDK): solo lo que usa Konnecttia para cobrar la
 * suscripción. La clave secreta nunca sale de la API y nunca se escribe en archivos.
 */

const API = "https://api.stripe.com/v1";

export type StripeClient = {
  readonly createCheckoutSession: (input: {
    readonly priceId: string;
    readonly restauranteId: number;
    readonly planCode: string;
    readonly customerId: string | null;
    readonly email: string | null;
    readonly successUrl: string;
    readonly cancelUrl: string;
  }) => Promise<{ readonly url: string }>;
  readonly createPortalSession: (input: {
    readonly customerId: string;
    readonly returnUrl: string;
  }) => Promise<{ readonly url: string }>;
};

type Fetch = typeof fetch;

async function post(
  fetcher: Fetch,
  secretKey: string,
  path: string,
  form: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetcher(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    throw new Error(`Stripe ${response.status}: ${error?.message ?? "error desconocido"}`);
  }
  return body;
}

export function createStripeClient(secretKey: string, fetcher: Fetch = fetch): StripeClient {
  return {
    createCheckoutSession: async (input) => {
      const form = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": input.priceId,
        "line_items[0][quantity]": "1",
        client_reference_id: String(input.restauranteId),
        "metadata[restaurante_id]": String(input.restauranteId),
        "metadata[plan]": input.planCode,
        "subscription_data[metadata][restaurante_id]": String(input.restauranteId),
        "subscription_data[metadata][plan]": input.planCode,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });
      if (input.customerId) form.set("customer", input.customerId);
      else if (input.email) form.set("customer_email", input.email);
      const session = await post(fetcher, secretKey, "/checkout/sessions", form);
      if (typeof session.url !== "string") throw new Error("Stripe no devolvió la URL de pago");
      return { url: session.url };
    },
    createPortalSession: async (input) => {
      const session = await post(
        fetcher,
        secretKey,
        "/billing_portal/sessions",
        new URLSearchParams({ customer: input.customerId, return_url: input.returnUrl }),
      );
      if (typeof session.url !== "string") throw new Error("Stripe no devolvió la URL del portal");
      return { url: session.url };
    },
  };
}

/** Tolerancia entre la marca de tiempo de la firma y ahora (segundos). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verifica la cabecera `Stripe-Signature` (`t=<ts>,v1=<hmac>`): HMAC-SHA256 de `<ts>.<cuerpo>` con
 * el secreto del endpoint, comparado en tiempo constante y con tolerancia de 5 minutos.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
): boolean {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.split("=") as [string, string]);
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
