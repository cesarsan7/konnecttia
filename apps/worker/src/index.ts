import { createResendMailer } from "@konnecttia/notifications";
import { createSql } from "./db";
import { loadEnv } from "./env";
import { createLogger } from "./logger";
import { runLoop } from "./loop";

async function main() {
  const env = loadEnv();
  const log = createLogger();
  const sql = createSql(env.DATABASE_URL);
  const mailer = env.RESEND_API_KEY
    ? createResendMailer(env.RESEND_API_KEY, env.RESEND_FROM)
    : null;

  const controller = new AbortController();
  const stop = (signal: string) => {
    if (controller.signal.aborted) return;
    log.info("parada_solicitada", { senal: signal });
    controller.abort();
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  log.info("worker_arrancado", {
    envio_activo: mailer !== null,
    enlace_panel: env.PANEL_PUBLIC_URL !== undefined,
    enlace_seguimiento: env.PUBLIC_WEB_URL !== undefined,
    lote: env.WORKER_BATCH_SIZE,
    intentos_max: env.WORKER_MAX_ATTEMPTS,
  });
  if (!mailer) {
    log.warn("sin_resend_api_key", {
      efecto: "los eventos se descartan con motivo sin_proveedor_email",
    });
  }

  await runLoop(
    {
      sql,
      mailer,
      log,
      panelUrl: env.PANEL_PUBLIC_URL ?? null,
      webUrl: env.PUBLIC_WEB_URL ?? null,
      batchSize: env.WORKER_BATCH_SIZE,
      leaseSeconds: env.WORKER_LEASE_SECONDS,
      retry: {
        maxAttempts: env.WORKER_MAX_ATTEMPTS,
        backoffBaseSeconds: env.WORKER_BACKOFF_BASE_SECONDS,
        backoffMaxSeconds: env.WORKER_BACKOFF_MAX_SECONDS,
      },
    },
    { pollIntervalMs: env.WORKER_POLL_INTERVAL_MS, signal: controller.signal, log },
  );

  await sql.end({ timeout: 5 });
  log.info("worker_detenido");
}

main().catch((error: unknown) => {
  // Arranque fallido (p. ej. variable ausente): mensaje sin valores y salida con error.
  process.stderr.write(`${error instanceof Error ? error.message : "Error de arranque"}\n`);
  process.exit(1);
});
