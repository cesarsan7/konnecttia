import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import type { ImageStorage } from "./context";
import { createSql } from "./lib/db";
import { loadEnv } from "./lib/env";
import { createResendMailer } from "./lib/mailer";

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

const app = createApp({
  imageStorage: imageStorage(),
  mailer: env.RESEND_API_KEY ? createResendMailer(env.RESEND_API_KEY, env.RESEND_FROM) : null,
  panelUrl: env.PANEL_PUBLIC_URL ?? null,
  sql,
  now: () => new Date(),
  clientIpHeader: env.CLIENT_IP_HEADER,
  allowedOrigins: env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  verifyToken: async (token) => {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { userId: data.user.id, email: data.user.email ?? null };
  },
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(JSON.stringify({ level: "info", message: "API escuchando", port: info.port }));
});
