import postgres from "postgres";

/** Conexión a PostgreSQL. Las fechas se comparan siempre en UTC. */
export function createSql(url: string) {
  return postgres(url, {
    max: 4,
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
    onnotice: () => {},
  });
}

export type Sql = ReturnType<typeof createSql>;
