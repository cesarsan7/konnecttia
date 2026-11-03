import postgres from "postgres";

/** Conexión a PostgreSQL. Las fechas se comparan siempre en UTC. */
export function createSql(url: string) {
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { TimeZone: "UTC" },
    // BIGINT (int8, OID 20) como number: los ids de EasyOrder caben de sobra en un entero seguro.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => String(value),
        parse: (value: string) => Number(value),
      },
    },
    transform: { undefined: null },
  });
}

export type Sql = ReturnType<typeof createSql>;

/** Convierte un importe NUMERIC de la base (euros, texto) a céntimos enteros. */
export function eurosToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100);
}

export function centsToEuros(value: number): number {
  return Math.round(value) / 100;
}

/** Código de PostgreSQL para violación de índice único. */
export const UNIQUE_VIOLATION = "23505";
