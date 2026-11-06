/**
 * Registro estructurado (una línea JSON por entrada). Solo ids, tipos y contadores: nunca emails,
 * nombres, teléfonos, direcciones ni claves.
 */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export type Logger = {
  readonly info: (message: string, fields?: LogFields) => void;
  readonly warn: (message: string, fields?: LogFields) => void;
  readonly error: (message: string, fields?: LogFields) => void;
};

export function createLogger(
  write: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Logger {
  const emit = (level: string, message: string, fields?: LogFields) =>
    write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        servicio: "worker",
        msg: message,
        ...fields,
      }),
    );
  return {
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}

/** Un logger que no escribe nada (pruebas). */
export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };
