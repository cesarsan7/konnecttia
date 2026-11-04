import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { boardFingerprint } from "../src/routes/panel-stream";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;
const NOW = new Date("2026-11-03T13:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("tiempo real del tablero", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("la huella cambia con un pedido nuevo o un cambio de estado, también si lo hace n8n", async () => {
    const before = await boardFingerprint(ctx.sql, 101, null, NOW);
    // Inserción directa, como hace n8n (sin outbox).
    const [order] = await ctx.sql<{ id: number }[]>`
      INSERT INTO public.pedidos (restaurante_id, telefono, estado, canal, created_at)
      VALUES (101, '+34600000999', 'recibido', 'whatsapp', '2026-11-03 12:59:00')
      RETURNING id
    `;
    const afterInsert = await boardFingerprint(ctx.sql, 101, null, NOW);
    expect(afterInsert).not.toBe(before);
    await ctx.sql`UPDATE public.pedidos SET estado = 'confirmado' WHERE id = ${order?.id ?? 0}`;
    const afterUpdate = await boardFingerprint(ctx.sql, 101, null, NOW);
    expect(afterUpdate).not.toBe(afterInsert);
    // Otro restaurante no cambia.
    expect(await boardFingerprint(ctx.sql, 102, null, NOW)).toBe(
      await boardFingerprint(ctx.sql, 102, null, NOW),
    );
  });

  it("respeta los locales del usuario", async () => {
    const playa = await boardFingerprint(ctx.sql, 103, [3002], NOW);
    const centro =
      (
        await ctx.sql<
          { id: number }[]
        >`SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal`
      )[0]?.id ?? 0;
    await ctx.sql`
      INSERT INTO public.pedidos (restaurante_id, telefono, estado, canal, sucursal_id, created_at)
      VALUES (103, '+34600000998', 'recibido', 'whatsapp', ${centro}, '2026-11-03 12:59:00')
    `;
    expect(await boardFingerprint(ctx.sql, 103, [3002], NOW)).toBe(playa);
    expect(await boardFingerprint(ctx.sql, 103, null, NOW)).not.toBe(playa);
  });

  it("abre un flujo SSE solo con orders.view", async () => {
    expect((await ctx.app.request("/panel/prueba-a/orders/stream")).status).toBe(401);
    expect(
      (await ctx.app.request("/panel/prueba-a/orders/stream", { headers: auth("ownerB") })).status,
    ).toBe(403);
    const controller = new AbortController();
    const response = await ctx.app.request("/panel/prueba-a/orders/stream", {
      headers: auth("viewerA"),
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain("event: pedidos");
    controller.abort();
    await reader?.cancel().catch(() => {});
  });
});
