import { z } from "zod";

/** Variables de entorno obligatorias: si falta alguna, la API no arranca. */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Cabecera con la IP real del cliente, fijada por el proxy (Traefik en EasyPanel). */
  CLIENT_IP_HEADER: z.string().default("x-real-ip"),
  /** Orígenes permitidos para el navegador (CORS), separados por comas. */
  ALLOWED_ORIGINS: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Variables de entorno no válidas o ausentes: ${missing}`);
  }
  return parsed.data;
}
