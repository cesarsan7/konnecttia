import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import type { ImageStorage, ProofStorage } from "./context";
import { createSql } from "./lib/db";
import { loadEnv } from "./lib/env";
import { createResendMailer } from "./lib/mailer";
import { createTurnstileVerifier } from "./lib/turnstile";

const env = loadEnv();
const sql = createSql(env.DATABASE_URL);
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

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

const app = createApp({
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
