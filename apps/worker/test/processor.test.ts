import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OUTBOX_EVENT } from "../src/plan";
import { runBatch } from "../src/processor";
import { createFakeMailer, setupTestDb, TEST_DATABASE_URL, type TestDb } from "./harness";

let db: TestDb;

type EventRow = {
  id: number;
  estado: string;
  intentos: number;
  ultimo_error: string | null;
  procesado_at: Date | null;
  disponible_en: Date;
};

async function createOrder(restauranteId: number, canal = "web"): Promise<number> {
  const rows = await db.sql<{ id: number }[]>`
    INSERT INTO public.pedidos
      (restaurante_id, telefono, tipo_despacho, canal, total, estado, pedido_codigo, nombre_pedido)
    VALUES (${restauranteId}, '+34600000000', 'delivery', ${canal}, 18.50, 'recibido',
            ${`T-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`}, 'Ana')
    RETURNING id
  `;
  return rows[0]?.id ?? 0;
}

let eventCounter = 0;
async function createEvent(
  restauranteId: number,
  orderId: number,
  tipo: string = OUTBOX_EVENT.OrderReceived,
  payload: Record<string, unknown> = {},
): Promise<number> {
  eventCounter += 1;
  const rows = await db.sql<{ id: number }[]>`
    INSERT INTO public.outbox_evento
      (restaurante_id, tipo, agregado_tipo, agregado_id, payload, clave_idempotencia)
    VALUES (${restauranteId}, ${tipo}, 'pedido', ${String(orderId)}, ${db.sql.json({ pedido_id: orderId, ...payload } as never)},
            ${`test:${eventCounter}:${Date.now()}`})
    RETURNING id
  `;
  return rows[0]?.id ?? 0;
}

const eventOf = async (id: number): Promise<EventRow> => {
  const rows = await db.sql<EventRow[]>`
    SELECT id, estado, intentos, ultimo_error, procesado_at, disponible_en
    FROM public.outbox_evento WHERE id = ${id}
  `;
  const row = rows[0];
  if (!row) throw new Error("evento inexistente");
  return row;
};

const sentCount = async (eventId: number) => {
  const rows = await db.sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM public.aviso_envio WHERE evento_id = ${eventId}
  `;
  return rows[0]?.n ?? 0;
};

const setConfig = async (restauranteId: number, key: string, value: string) => {
  await db.sql`
    INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value)
    VALUES (${restauranteId}, ${key}, ${value})
    ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = EXCLUDED.config_value
  `;
};

const makeDue = (id: number) =>
  db.sql`UPDATE public.outbox_evento SET disponible_en = now() - interval '1 second' WHERE id = ${id}`;

describe.skipIf(!TEST_DATABASE_URL)("worker de avisos (integración con PostgreSQL)", () => {
  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    // Cada prueba parte de un outbox vacío y de la configuración de A encendida.
    await db.sql`DELETE FROM public.outbox_evento`;
    await db.sql`DELETE FROM public.restaurante_config WHERE config_key LIKE 'avisos_email%'`;
    await db.sql`DELETE FROM public.restaurante_modulo WHERE modulo_code = 'notify.email'`;
    await setConfig(101, "avisos_email_local_activo", "true");
    await setConfig(101, "avisos_email_local", "cocina@local.test, dueno@local.test");
  });

  it("pedido recibido: avisa a cada dirección del local y marca el evento como enviado", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101));
    const handled = await runBatch(db.deps({ mailer }));
    expect(handled).toBe(1);
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["cocina@local.test", "dueno@local.test"]);
    expect(mailer.sent[0]?.subject).toContain("Nuevo pedido");
    expect(mailer.sent[0]?.html).toContain("https://panel.example.test/panel/prueba-a");
    const row = await eventOf(event);
    expect(row).toMatchObject({ estado: "enviado", intentos: 1, ultimo_error: null });
    expect(row.procesado_at).not.toBeNull();
    expect(await sentCount(event)).toBe(2);
  });

  it("no guarda direcciones de email en la tabla de envíos (solo su hash)", async () => {
    const event = await createEvent(101, await createOrder(101));
    await runBatch(db.deps({ mailer: createFakeMailer() }));
    const rows = await db.sql<{ destinatario_hash: string }[]>`
      SELECT destinatario_hash FROM public.aviso_envio WHERE evento_id = ${event}
    `;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.destinatario_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("procesar el mismo evento dos veces no repite los envíos", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101));
    await runBatch(db.deps({ mailer }));
    // Alguien lo devuelve a pendiente (por ejemplo, un arreglo manual).
    await db.sql`UPDATE public.outbox_evento SET estado = 'pendiente', intentos = 0, disponible_en = now() WHERE id = ${event}`;
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(2);
    expect(await sentCount(event)).toBe(2);
    expect((await eventOf(event)).estado).toBe("enviado");
  });

  it("dos procesos a la vez no se pisan: cada evento se envía una sola vez", async () => {
    const mailer = createFakeMailer();
    const orders = await Promise.all([1, 2, 3, 4].map(() => createOrder(101)));
    for (const order of orders) await createEvent(101, order);
    await Promise.all([
      runBatch(db.deps({ mailer, batchSize: 2 })),
      runBatch(db.deps({ mailer, batchSize: 2 })),
      runBatch(db.deps({ mailer, batchSize: 2 })),
    ]);
    await runBatch(db.deps({ mailer, batchSize: 10 }));
    expect(mailer.sent).toHaveLength(8);
    const rows = await db.sql<{ estado: string; intentos: number }[]>`
      SELECT estado, intentos FROM public.outbox_evento
    `;
    expect(rows.every((row) => row.estado === "enviado" && row.intentos === 1)).toBe(true);
  });

  it("un fallo del proveedor reintenta con espera creciente; el reintento solo envía lo pendiente", async () => {
    const mailer = createFakeMailer();
    mailer.failNext.add("dueno@local.test");
    const event = await createEvent(101, await createOrder(101));

    await runBatch(db.deps({ mailer }));
    let row = await eventOf(event);
    expect(row).toMatchObject({
      estado: "fallido",
      intentos: 1,
      ultimo_error: "Resend respondió 500",
    });
    expect(row.disponible_en.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(mailer.sent.map((m) => m.to)).toEqual(["cocina@local.test"]);

    // Aún no toca: no se reclama.
    expect(await runBatch(db.deps({ mailer }))).toBe(0);

    await makeDue(event);
    await runBatch(db.deps({ mailer }));
    row = await eventOf(event);
    expect(row).toMatchObject({ estado: "enviado", intentos: 2 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(["cocina@local.test", "dueno@local.test"]);
  });

  it("la espera se alarga en cada intento y, agotados los intentos, el evento no se reintenta más", async () => {
    const mailer = createFakeMailer();
    mailer.alwaysFail = true;
    const event = await createEvent(101, await createOrder(101));
    const waits: number[] = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await makeDue(event);
      await runBatch(db.deps({ mailer }));
      const row = await eventOf(event);
      expect(row.intentos).toBe(attempt);
      waits.push(Math.round((row.disponible_en.getTime() - Date.now()) / 1000));
    }
    // 30 s y 60 s de espera; en el último intento (máximo 3) ya no se programa otro.
    expect(waits[0]).toBeGreaterThan(20);
    expect(waits[0]).toBeLessThanOrEqual(30);
    expect(waits[1]).toBeGreaterThan(50);
    expect(waits[1]).toBeLessThanOrEqual(60);
    expect((await eventOf(event)).estado).toBe("fallido");

    await makeDue(event);
    expect(await runBatch(db.deps({ mailer }))).toBe(0);
    expect((await eventOf(event)).intentos).toBe(3);
  });

  it("sin proveedor de email descarta los eventos con motivo y se pueden reponer", async () => {
    const event = await createEvent(101, await createOrder(101));
    await runBatch(db.deps({ mailer: null }));
    expect(await eventOf(event)).toMatchObject({
      estado: "descartado",
      ultimo_error: "sin_proveedor_email",
    });

    // Reponerlo cuando haya clave.
    await db.sql`
      UPDATE public.outbox_evento SET estado = 'pendiente', intentos = 0, ultimo_error = NULL
      WHERE id = ${event} AND ultimo_error = 'sin_proveedor_email'
    `;
    const mailer = createFakeMailer();
    await runBatch(db.deps({ mailer }));
    expect((await eventOf(event)).estado).toBe("enviado");
    expect(mailer.sent).toHaveLength(2);
  });

  it("con los avisos apagados el evento queda descartado con su motivo y no se envía nada", async () => {
    await setConfig(101, "avisos_email_local_activo", "false");
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101));
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect(await eventOf(event)).toMatchObject({ estado: "descartado" });
    expect((await eventOf(event)).ultimo_error).toContain("aviso_local_apagado");
  });

  it("un restaurante sin ninguna clave de avisos no envía (apagado por defecto)", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(102, await createOrder(102));
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect((await eventOf(event)).estado).toBe("descartado");
  });

  it("aislamiento: un evento del restaurante B no puede avisar con un pedido del restaurante A", async () => {
    const mailer = createFakeMailer();
    await setConfig(102, "avisos_email_local_activo", "true");
    await setConfig(102, "avisos_email_local", "b@local.test");
    const orderOfA = await createOrder(101);
    const event = await createEvent(102, orderOfA);
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect(await eventOf(event)).toMatchObject({
      estado: "descartado",
      ultimo_error: "pedido_no_encontrado",
    });
  });

  it("los pedidos creados en mostrador no avisan al local", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101, "mostrador"));
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect((await eventOf(event)).ultimo_error).toContain("canal_interno");
  });

  it("módulo de avisos por email suspendido: no envía", async () => {
    await db.sql`
      INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, estado, origen)
      VALUES (101, 'notify.email', 'suspendido', 'plan')
    `;
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101));
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect((await eventOf(event)).ultimo_error).toBe("modulo_inactivo");
  });

  it("cliente: con email en el evento recibe confirmación y cambios de estado con su enlace", async () => {
    await setConfig(101, "avisos_email_cliente_activo", "true");
    await setConfig(101, "avisos_email_local_activo", "false");
    const mailer = createFakeMailer();
    const orderId = await createOrder(101);
    const token = (
      await db.sql<
        { tracking_token: string }[]
      >`SELECT tracking_token FROM public.pedidos WHERE id = ${orderId}`
    )[0]?.tracking_token;

    const received = await createEvent(101, orderId, OUTBOX_EVENT.OrderReceived, {
      email_cliente: "cliente@example.test",
    });
    const accepted = await createEvent(101, orderId, OUTBOX_EVENT.OrderStatusChanged, {
      desde: "recibido",
      hacia: "confirmado",
      email_cliente: "cliente@example.test",
    });
    const preparing = await createEvent(101, orderId, OUTBOX_EVENT.OrderStatusChanged, {
      desde: "confirmado",
      hacia: "en_preparacion",
      email_cliente: "cliente@example.test",
    });
    await runBatch(db.deps({ mailer }));

    expect(mailer.sent).toHaveLength(2);
    for (const message of mailer.sent) {
      expect(message.to).toBe("cliente@example.test");
      expect(message.html).toContain(`https://web.example.test/prueba-a/pedido/${token}`);
    }
    expect((await eventOf(received)).estado).toBe("enviado");
    expect((await eventOf(accepted)).estado).toBe("enviado");
    expect(await eventOf(preparing)).toMatchObject({
      estado: "descartado",
      ultimo_error: "estado_sin_aviso_cliente",
    });
  });

  it("cliente: un pedido sin email del cliente no genera aviso (hoy el checkout no lo recoge)", async () => {
    await setConfig(101, "avisos_email_cliente_activo", "true");
    await setConfig(101, "avisos_email_local_activo", "false");
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101), OUTBOX_EVENT.OrderStatusChanged, {
      desde: "recibido",
      hacia: "listo",
    });
    await runBatch(db.deps({ mailer }));
    expect(mailer.sent).toHaveLength(0);
    expect((await eventOf(event)).ultimo_error).toBe("sin_email_cliente");
  });

  it("recupera un evento cuya reserva venció (el proceso anterior murió a medias)", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101));
    await db.sql`
      UPDATE public.outbox_evento
      SET estado = 'procesando', intentos = 1, disponible_en = now() - interval '1 minute'
      WHERE id = ${event}
    `;
    await runBatch(db.deps({ mailer }));
    expect(await eventOf(event)).toMatchObject({ estado: "enviado", intentos: 2 });
  });

  it("un evento reservado y vigente no se toca; con la reserva vencida y sin intentos queda fallido", async () => {
    const mailer = createFakeMailer();
    const live = await createEvent(101, await createOrder(101));
    const dead = await createEvent(101, await createOrder(101));
    await db.sql`
      UPDATE public.outbox_evento SET estado = 'procesando', intentos = 1, disponible_en = now() + interval '5 minutes'
      WHERE id = ${live}
    `;
    await db.sql`
      UPDATE public.outbox_evento SET estado = 'procesando', intentos = 3, disponible_en = now() - interval '1 minute'
      WHERE id = ${dead}
    `;
    expect(await runBatch(db.deps({ mailer }))).toBe(0);
    expect((await eventOf(live)).estado).toBe("procesando");
    expect(await eventOf(dead)).toMatchObject({
      estado: "fallido",
      ultimo_error: "reserva_vencida",
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it("no toca eventos de tipos que no maneja", async () => {
    const mailer = createFakeMailer();
    const event = await createEvent(101, await createOrder(101), "otro.evento");
    await runBatch(db.deps({ mailer }));
    expect(await eventOf(event)).toMatchObject({ estado: "pendiente", intentos: 0 });
    await runBatch(db.deps({ mailer: null }));
    expect((await eventOf(event)).estado).toBe("pendiente");
  });
});
