/**
 * Cliente del tiempo real del tablero (GET /panel/:slug/orders/stream, SSE).
 * Se usa fetch y no EventSource porque hace falta la cabecera Authorization.
 */

export type SseEvent = { readonly event: string; readonly data: string };

/** Separa los eventos completos de un búfer SSE; devuelve lo que queda a medias. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (data.length > 0 || event !== "message") events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/** Espera antes de reconectar: 1 s, 2 s, 4 s… hasta 30 s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
}

export type StreamState = "conectando" | "en_directo" | "sin_conexion";

/**
 * Se suscribe a los cambios del tablero. Llama a `onChange` en cada evento «pedidos» y avisa del
 * estado de la conexión. Reconecta sola. Devuelve la función para cerrarla.
 */
export function subscribeBoard(options: {
  readonly url: string;
  readonly getToken: () => Promise<string | null>;
  readonly onChange: () => void;
  readonly onState: (state: StreamState) => void;
}): () => void {
  let closed = false;
  let controller: AbortController | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (closed) return;
    options.onState("sin_conexion");
    timer = setTimeout(() => void connect(), backoffMs(attempt));
    attempt += 1;
  };

  async function connect() {
    if (closed) return;
    const token = await options.getToken();
    if (!token) return schedule();
    controller = new AbortController();
    let response: Response;
    try {
      response = await fetch(options.url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      return schedule();
    }
    if (!response.ok || !response.body) return schedule();
    attempt = 0;
    options.onState("en_directo");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSse(buffer);
        buffer = parsed.rest;
        if (parsed.events.some((item) => item.event === "pedidos")) options.onChange();
      }
    } catch {
      // Corte de red o cierre: se reconecta abajo.
    }
    if (!closed) {
      // El servidor cierra cada 10 min a propósito: reconexión inmediata.
      options.onState("conectando");
      timer = setTimeout(() => void connect(), 500);
    }
  }

  options.onState("conectando");
  void connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    controller?.abort();
  };
}
