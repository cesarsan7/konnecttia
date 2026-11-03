import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
let principalA = 0;
let counter = 0;

async function pickupEta(): Promise<unknown> {
  const response = await ctx.app.request("/public/prueba-a/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.40",
      "Idempotency-Key": `eta-${Date.now()}-${counter++}`,
    },
    body: JSON.stringify({
      nombre: "Rosa",
      telefono: "+34600000070",
      tipo_despacho: "retiro",
      metodo_pago: "efectivo",
      items: [{ menu_item_id: 1101, menu_variant_id: 1202, quantity: 2 }],
    }),
  });
  return ((await response.json()) as { tiempo_estimado: unknown }).tiempo_estimado;
}

const busy = (path: string, user: Parameters<typeof auth>[0], method = "POST", body?: unknown) =>
  ctx.app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...auth(user) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe.skipIf(!TEST_DATABASE_URL)("tiempo estimado variable", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
    const [row] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.sucursal WHERE restaurante_id = 101 AND es_principal
    `;
    principalA = row?.id ?? 0;
  }, 60_000);
  afterAll(async () => {
    await ctx?.close();
  });

  it("sin ajustes, el tiempo configurado (15 min)", async () => {
    expect(await pickupEta()).toBe("15 min");
  });

  it("el modo ocupado suma minutos y se puede finalizar", async () => {
    const on = await busy(`/panel/prueba-a/locales/${principalA}/modo-ocupado`, "ownerA", "POST", {
      minutos_extra: 10,
      duracion_minutos: 60,
      motivo: "Falta personal",
    });
    expect(on.status).toBe(201);
    expect(await pickupEta()).toBe("25 min");
    const locales = await ctx.app.request("/public/prueba-a/locales");
    const json = (await locales.json()) as { locales: { tiempo_recogida: string }[] };
    expect(json.locales[0]?.tiempo_recogida).toBe("25 min");

    const off = await busy(
      `/panel/prueba-a/locales/${principalA}/modo-ocupado`,
      "ownerA",
      "DELETE",
    );
    expect(off.status).toBe(200);
    expect(await pickupEta()).toBe("15 min");
  });

  it("una franja de hora punta suma en su día y hora", async () => {
    // La API de pruebas corre el martes 3/11/2026 a las 13:00 (Canarias).
    await ctx.sql`
      INSERT INTO public.franja_pico (restaurante_id, dia, desde, hasta, servicio, minutos_extra)
      VALUES (101, 'Martes', '12:00', '14:00', 'recogida', 5),
             (101, 'Miércoles', '12:00', '14:00', 'recogida', 30)
    `;
    expect(await pickupEta()).toBe("20 min");
  });

  it("solo usuarios con permiso y alcance sobre el local", async () => {
    const viewer = await busy(
      `/panel/prueba-a/locales/${principalA}/modo-ocupado`,
      "viewerA",
      "POST",
      {
        minutos_extra: 10,
        duracion_minutos: 30,
      },
    );
    expect(viewer.status).toBe(403);
    const [centro] = await ctx.sql<{ id: number }[]>`
      SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal
    `;
    const otroLocal = await busy(
      `/panel/prueba-c/locales/${centro?.id}/modo-ocupado`,
      "cashierPlaya",
      "POST",
      {
        minutos_extra: 10,
        duracion_minutos: 30,
      },
    );
    expect(otroLocal.status).toBe(404);
    const suLocal = await busy(
      "/panel/prueba-c/locales/3002/modo-ocupado",
      "cashierPlaya",
      "POST",
      {
        minutos_extra: 10,
        duracion_minutos: 30,
      },
    );
    expect(suLocal.status).toBe(201);
  });
});
