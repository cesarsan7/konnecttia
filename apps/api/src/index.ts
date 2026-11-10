import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import type { ImageStorage, ProofStorage } from "./context";
import { createSql } from "./lib/db";
import { loadEnv } from "./lib/env";
import { createResendMailer } from "./lib/mailer";
import { runMigrations } from "./lib/migrate";
import { createStripeClient } from "./lib/stripe";
import { createTurnstileVerifier } from "./lib/turnstile";
import { createSimulatedCodeSender, createWhatsAppCodeSender } from "./lib/whatsapp-code";

const env = loadEnv();
const sql = createSql(env.DATABASE_URL);

if (env.AUTO_MIGRATE) {
  try {
    await runMigrations(sql, env.MIGRATIONS_DIR, (message, fields) =>
      console.log(JSON.stringify({ level: "info", message, ...fields })),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Las migraciones fallaron; la API no arranca",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  }
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

type Bucket = ReturnType<ReturnType<typeof createClient>["storage"]["from"]>;

/** Borra todos los archivos bajo `prefix` (recorre subcarpetas); devuelve cuántos. */
async function removeFolder(bucket: Bucket, prefix: string): Promise<number> {
  const PAGE = 100;
  const files: string[] = [];
  const pending = [prefix];
  while (pending.length > 0) {
    const folder = pending.pop() ?? "";
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await bucket.list(folder, { limit: PAGE, offset });
      if (error) throw new Error(`No se pudo listar ${folder}: ${error.message}`);
      for (const entry of data ?? []) {
        // Las carpetas vienen sin `id`; los archivos, con él.
        if (entry.id) files.push(`${folder}/${entry.name}`);
        else pending.push(`${folder}/${entry.name}`);
      }
      if ((data?.length ?? 0) < PAGE) break;
    }
  }
  for (let i = 0; i < files.length; i += PAGE) {
    const { error } = await bucket.remove(files.slice(i, i + PAGE));
    if (error) throw new Error(`No se pudieron borrar archivos de ${prefix}: ${error.message}`);
  }
  return files.length;
}

/** Fotos de la carta en Supabase Storage (solo si hay clave de servicio). */
function imageStorage(): ImageStorage | null {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = admin.storage.from(env.MENU_IMAGES_BUCKET);
  return {
    upload: async (path, bytes, contentType) => {
      const { error } = await bucket.upload(path, bytes, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw new Error(`No se pudo guardar la foto: ${error.message}`);
      return bucket.getPublicUrl(path).data.publicUrl;
    },
    removeFolder: (prefix) => removeFolder(bucket, prefix),
  };
}

/** Justificantes de pago en un bucket privado de Supabase Storage (solo con clave de servicio). */
function proofStorage(): ProofStorage | null {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = admin.storage.from(env.PAYMENT_PROOFS_BUCKET);
  return {
    upload: async (path, bytes, contentType) => {
      const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(`No se pudo guardar el justificante: ${error.message}`);
    },
    signedUrl: async (path, expiresInSeconds) => {
      const { data, error } = await bucket.createSignedUrl(path, expiresInSeconds);
      if (error || !data) throw new Error(`No se pudo firmar el justificante: ${error?.message}`);
      return data.signedUrl;
    },
    remove: async (path) => {
      await bucket.remove([path]);
    },
    removeFolder: (prefix) => removeFolder(bucket, prefix),
  };
}

/** Enlace de recuperación de contraseña (solo con clave de servicio); el email lo envía Resend. */
function recoveryLinks() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (email: string, redirectTo: string) => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (error || !data.properties?.action_link) return null;
    return data.properties.action_link;
  };
}

/** Envío del código de verificación (capa 3): WhatsApp, simulado en staging o apagado. */
function codeSender() {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    return createWhatsAppCodeSender({
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      template: env.WHATSAPP_CODE_TEMPLATE,
      language: env.WHATSAPP_CODE_LANGUAGE,
    });
  }
  return env.ANTIFRAUD_CODE_SIMULATE ? createSimulatedCodeSender() : null;
}

const app = createApp({
  sendCode: codeSender(),
  codeSecret: env.CODE_HMAC_SECRET ?? null,
  stripe: env.STRIPE_SECRET_KEY ? createStripeClient(env.STRIPE_SECRET_KEY) : null,
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null,
  stripePrices: {
    ...(env.STRIPE_PRICE_BASICO ? { basico: env.STRIPE_PRICE_BASICO } : {}),
    ...(env.STRIPE_PRICE_PREMIUM ? { premium: env.STRIPE_PRICE_PREMIUM } : {}),
  },
  imageStorage: imageStorage(),
  proofStorage: proofStorage(),
  mailer: env.RESEND_API_KEY ? createResendMailer(env.RESEND_API_KEY, env.RESEND_FROM) : null,
  panelUrl: env.PANEL_PUBLIC_URL ?? null,
  generateRecoveryLink: recoveryLinks(),
  verifyCaptcha: env.TURNSTILE_SECRET_KEY
    ? createTurnstileVerifier(env.TURNSTILE_SECRET_KEY)
    : null,
  sql,
  now: () => new Date(),
  clientIpHeader: env.CLIENT_IP_HEADER,
  allowedOrigins: env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  verifyToken: async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      emailVerified: Boolean(data.user.email_confirmed_at),
    };
  },
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(JSON.stringify({ level: "info", message: "API escuchando", port: info.port }));
});
