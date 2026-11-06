import type { Logger } from "./logger";
import { describeError, type ProcessorDeps, runBatch } from "./processor";

/** Espera `ms` o hasta que se pida parar, lo que ocurra antes. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export type LoopOptions = {
  readonly pollIntervalMs: number;
  readonly signal: AbortSignal;
  readonly log: Logger;
};

/**
 * Bucle principal: procesa lotes mientras haya trabajo y duerme entre sondeos cuando no. Al
 * pedir parar (SIGTERM) termina el lote en curso y sale; no corta un envío a medias.
 */
export async function runLoop(deps: ProcessorDeps, options: LoopOptions): Promise<void> {
  while (!options.signal.aborted) {
    let handled = 0;
    try {
      handled = await runBatch(deps);
    } catch (error) {
      options.log.error("lote_fallido", { error: describeError(error) });
    }
    // Lote lleno: probablemente queda más; sigue sin esperar.
    if (handled >= deps.batchSize) continue;
    await sleep(options.pollIntervalMs, options.signal);
  }
}
