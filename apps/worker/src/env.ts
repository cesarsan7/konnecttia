import { z } from "zod";

/** EasyPanel guarda las variables vacías como cadena vacía: se tratan como ausentes. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const positiveInt = (fallback: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().positive().default(fallback),
  );

/** Valores por defecto del bucle (ajustes técnicos del servicio, no reglas de negocio). */
export const WORKER_DEFAULTS = {
  pollIntervalMs: 5_000,
  batchSize: 10,
  maxAttempts: 5,
  backoffBaseSeconds: 30,
  backoffMaxSeconds: 3_600,
  leaseSeconds: 300,
  resendFrom: "EasyOrder <onboarding@resend.dev>",
} as const;

/** Variables de entorno: si falta la obligatoria, el worker no arranca. */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  /** Sin clave no se envía nada: los eventos quedan descartados con motivo `sin_proveedor_email`. */
  RESEND_API_KEY: optional(z.string().min(10)),
  RESEND_FROM: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(3).default(WORKER_DEFAULTS.resendFrom),
  ),
  /** URL pública del panel: enlace del aviso al local. Sin ella, el email no lleva botón. */
  PANEL_PUBLIC_URL: optional(z.string().url()),
  /** URL pública de la web de pedidos: enlace de seguimiento. Sin ella no se avisa al cliente. */
  PUBLIC_WEB_URL: optional(z.string().url()),
  WORKER_POLL_INTERVAL_MS: positiveInt(WORKER_DEFAULTS.pollIntervalMs),
  WORKER_BATCH_SIZE: positiveInt(WORKER_DEFAULTS.batchSize),
  WORKER_MAX_ATTEMPTS: positiveInt(WORKER_DEFAULTS.maxAttempts),
  WORKER_BACKOFF_BASE_SECONDS: positiveInt(WORKER_DEFAULTS.backoffBaseSeconds),
  WORKER_BACKOFF_MAX_SECONDS: positiveInt(WORKER_DEFAULTS.backoffMaxSeconds),
  /** Tiempo que un evento reclamado queda reservado antes de poder reclamarlo otro proceso. */
  WORKER_LEASE_SECONDS: positiveInt(WORKER_DEFAULTS.leaseSeconds),
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
