import { serve } from "@hono/node-server";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "./app";
import { createSql } from "./lib/db";
import { loadEnv } from "./lib/env";

const env = loadEnv();
const sql = createSql(env.DATABASE_URL);
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const app = createApp({
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
