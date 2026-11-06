import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseReportRange } from "../src/repositories/reports";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext } from "./harness";

let ctx: TestContext;

const json = { "Content-Type": "application/json" };

async function createOrder(slug: string, body: Record<string, unknown>) {
  const response = await ctx.app.request(`/public/${slug}/orders`, {
    method: "POST",
    headers: {
      ...json,
      "x-real-ip": "203.0.113.20",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  if (response.status !== 201) throw new Error(await response.text());
  const created = (await response.json()) as { tracking_token: string };
  const [row] = await ctx.sql<{ id: number }[]>`
    SELECT id FROM public.pedidos WHERE tracking_token = ${created.tracking_token}::uuid
  `;
  return row?.id ?? 0;
}

const transferOrder = {
  nombre: "Luis",
  telefono: "+34600000077",
  tipo_despacho: "retiro",
  metodo_pago: "transferencia",
  items: [{ menu_item_id: 1101, menu_variant_id: 1201, quantity: 3 }],
};

describe("rango de informes", () => {
  it("calcula el periodo anterior de la misma duración", () => {
    expect(parseReportRange("2026-11-01", "2026-11-07")).toMatchObject({
      dias: 7,
      anteriorDesde: "2026-10-25",
      anteriorHasta: "2026-10-31",
    });
  });

  it("rechaza fechas que no existen, rangos invertidos o de más de un año", () => {
    expect(parseReportRange("2026-02-31", "2026-03-01")).toBeNull();
    expect(parseReportRange("2026-11-07", "2026-11-01")).toBeNull();
    expect(parseReportRange("2025-01-01", "2026-11-01")).toBeNull();
    expect(parseReportRange(undefined, "2026-11-01")).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("panel del restaurante", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("cuenta", () => {
    it("lista los restaurantes del usuario con su rol", async () => {
      const response = await ctx.app.request("/me/restaurantes", { headers: auth("ownerA") });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        restaurantes: { slug: string; roles: string[] }[];
      };
      expect(body.restaurantes).toEqual([
        expect.objectContaining({ slug: "prueba-a", roles: ["Propietario"] }),
      ]);
    });

    it("sin sesión no responde", async () => {
      expect((await ctx.app.request("/me/restaurantes")).status).toBe(401);
    });
  });

  describe("acceso", () => {
    it("devuelve solo los permisos utilizables (módulo activo y rol)", async () => {
      const owner = await ctx.app.request("/panel/prueba-a/acceso", { headers: auth("ownerA") });
      const ownerBody = (await owner.json()) as { permisos: string[]; locales: unknown };
      expect(ownerBody.permisos).toContain("analytics.view");
      expect(ownerBody.locales).toBe("todos");

      // B tiene el plan Básico: su propietario no tiene analíticas aunque el rol las incluya.
      const basic = await ctx.app.request("/panel/prueba-b/acceso", { headers: auth("ownerB") });
      const basicBody = (await basic.json()) as { permisos: string[] };
      expect(basicBody.permisos).toContain("orders.view");
      expect(basicBody.permisos).not.toContain("analytics.view");
    });

    it("un cajero limitado a un local lo ve en su alcance", async () => {
      const response = await ctx.app.request("/panel/prueba-c/acceso", {
        headers: auth("cashierPlaya"),
      });
      const body = (await response.json()) as { locales: unknown };
      expect(body.locales).toEqual([3002]);
    });
  });

  describe("cobro", () => {
    it("confirmar el cobro de una transferencia permite entregar el pedido", async () => {
      const id = await createOrder("prueba-a", transferOrder);
      const patch = (path: string, body: unknown) =>
        ctx.app.request(`/panel/prueba-a/orders/${id}/${path}`, {
          method: "PATCH",
          headers: { ...auth("ownerA"), ...json },
          body: JSON.stringify(body),
        });
      for (const estado of ["confirmado", "en_preparacion", "listo"]) {
        expect((await patch("status", { estado })).status).toBe(200);
      }
      // Con el cobro pendiente no se entrega.
      expect((await patch("status", { estado: "entregado" })).status).toBe(422);

      const paid = await patch("pago", { estado_pago: "pagado" });
      expect(paid.status).toBe(200);
      expect((await patch("pago", { estado_pago: "pagado" })).status).toBe(422);
      expect((await patch("status", { estado: "entregado" })).status).toBe(200);
    });

    it("el rol Consulta no puede confirmar cobros", async () => {
      const id = await createOrder("prueba-a", transferOrder);
      const response = await ctx.app.request(`/panel/prueba-a/orders/${id}/pago`, {
        method: "PATCH",
        headers: { ...auth("viewerA"), ...json },
        body: JSON.stringify({ estado_pago: "pagado" }),
      });
      expect(response.status).toBe(403);
    });

    it("pasar de «pendiente_pago» a «pagado» confirma también el cobro", async () => {
      const id = await createOrder("prueba-a", transferOrder);
      await ctx.sql`UPDATE public.pedidos SET estado = 'pendiente_pago' WHERE id = ${id}`;
      const response = await ctx.app.request(`/panel/prueba-a/orders/${id}/status`, {
        method: "PATCH",
        headers: { ...auth("ownerA"), ...json },
        body: JSON.stringify({ estado: "pagado" }),
      });
      expect(response.status).toBe(200);
      const [row] = await ctx.sql`SELECT estado_pago FROM public.pedidos WHERE id = ${id}`;
      expect(row?.estado_pago).toBe("pagado");
    });
  });

  describe("tablero", () => {
    it("muestra los pedidos en marcha aunque sean antiguos y oculta los cerrados antiguos", async () => {
      const active = await createOrder("prueba-a", transferOrder);
      const closed = await createOrder("prueba-a", transferOrder);
      await ctx.sql`
        UPDATE public.pedidos SET created_at = '2026-10-01 10:00', updated_at = '2026-10-01 10:00'
        WHERE id IN (${active}, ${closed})
      `;
      await ctx.sql`UPDATE public.pedidos SET estado = 'entregado' WHERE id = ${closed}`;
      await ctx.sql`UPDATE public.pedidos SET updated_at = '2026-10-01 10:00' WHERE id = ${closed}`;

      const response = await ctx.app.request("/panel/prueba-a/orders?vista=tablero", {
        headers: auth("ownerA"),
      });
      const { pedidos } = (await response.json()) as {
        pedidos: { id: number; created_at: string }[];
      };
      const ids = pedidos.map((pedido) => pedido.id);
      expect(ids).toContain(active);
      expect(ids).not.toContain(closed);
      // Las fechas salen en UTC explícito.
      expect(pedidos.find((pedido) => pedido.id === active)?.created_at).toBe(
        "2026-10-01T10:00:00.000Z",
      );
    });

    it("devuelve el mesero que atiende el pedido (tablero e historial)", async () => {
      const id = await createOrder("prueba-a", transferOrder);
      const [waiter] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.meseros (restaurante_id, nombre)
        SELECT restaurante_id, 'Marta' FROM public.pedidos WHERE id = ${id}
        RETURNING id
      `;
      await ctx.sql`UPDATE public.pedidos SET mesero_id = ${waiter?.id ?? 0} WHERE id = ${id}`;
      const plain = await createOrder("prueba-a", transferOrder);

      for (const path of ["orders?vista=tablero", "orders/historial"]) {
        const response = await ctx.app.request(`/panel/prueba-a/${path}`, {
          headers: auth("ownerA"),
        });
        expect(response.status).toBe(200);
        const { pedidos } = (await response.json()) as {
          pedidos: { id: number; mesero_nombre: string | null }[];
        };
        expect(pedidos.find((pedido) => pedido.id === id)?.mesero_nombre).toBe("Marta");
        expect(pedidos.find((pedido) => pedido.id === plain)?.mesero_nombre).toBeNull();
      }
    });

    it("el modo ocupado usa las opciones y la duración del restaurante", async () => {
      const access = await ctx.app.request("/panel/prueba-c/acceso", { headers: auth("ownerC") });
      const body = (await access.json()) as { ajustes: { modo_ocupado: unknown } };
      expect(body.ajustes.modo_ocupado).toEqual({
        opciones: [10, 15, 20, 30],
        duracion_minutos: 60,
      });

      const notOffered = await ctx.app.request("/panel/prueba-c/locales/3003/modo-ocupado", {
        method: "POST",
        headers: { ...auth("ownerC"), ...json },
        body: JSON.stringify({ minutos_extra: 25 }),
      });
      expect(notOffered.status).toBe(400);

      // B no tiene la configuración: el panel no ofrece el botón y la API lo rechaza.
      const basic = await ctx.app.request("/panel/prueba-b/acceso", { headers: auth("ownerB") });
      const basicBody = (await basic.json()) as { ajustes: { modo_ocupado: unknown } };
      expect(basicBody.ajustes.modo_ocupado).toBeNull();
    });

    it("cada local indica si tiene el modo ocupado activo", async () => {
      await ctx.app.request("/panel/prueba-c/locales/3002/modo-ocupado", {
        method: "POST",
        headers: { ...auth("ownerC"), ...json },
        body: JSON.stringify({ minutos_extra: 15, duracion_minutos: 60 }),
      });
      const response = await ctx.app.request("/panel/prueba-c/locales", {
        headers: auth("ownerC"),
      });
      const { locales } = (await response.json()) as {
        locales: { id: number; modo_ocupado: { minutos_extra: number } | null }[];
      };
      expect(locales.find((local) => local.id === 3002)?.modo_ocupado?.minutos_extra).toBe(15);
      expect(locales.find((local) => local.id === 3003)?.modo_ocupado).toBeNull();
    });
  });

  describe("estadísticas", () => {
    it("agrupa por día y hora del restaurante y lista los productos más pedidos", async () => {
      // 23:30 UTC del 31 de octubre = 23:30 en Canarias (UTC+0 en invierno): cuenta el día 31.
      // 23:30 UTC del 30 de septiembre = 00:30 del 1 de octubre en Canarias (UTC+1 en verano).
      const id = await createOrder("prueba-a", transferOrder);
      await ctx.sql`UPDATE public.pedidos SET created_at = '2026-09-30 23:30' WHERE id = ${id}`;

      const response = await ctx.app.request(
        "/panel/prueba-a/reports/overview?desde=2026-10-01&hasta=2026-10-07",
        { headers: auth("ownerA") },
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        resumen: { pedidos: number; ventas: number; ticket_medio: number };
        por_dia: { fecha: string; pedidos: number }[];
        por_hora: { hora: number; pedidos: number }[];
        productos: { nombre: string; cantidad: number; ventas: number }[];
        anterior: { desde: string };
      };
      expect(body.por_dia).toHaveLength(7);
      expect(body.por_hora).toHaveLength(24);
      expect(body.por_dia[0]).toMatchObject({ fecha: "2026-10-01" });
      expect(body.por_dia[0]?.pedidos).toBeGreaterThanOrEqual(1);
      expect(body.por_hora[0]?.pedidos).toBeGreaterThanOrEqual(1);
      expect(body.productos[0]).toMatchObject({ nombre: "Salchimaduro" });
      expect(body.anterior.desde).toBe("2026-09-24");
      expect(body.resumen.ticket_medio).toBeCloseTo(body.resumen.ventas / body.resumen.pedidos, 2);
    });

    it("lee también las líneas en el formato de los pedidos de WhatsApp", async () => {
      await ctx.sql`
        INSERT INTO public.pedidos (restaurante_id, telefono, items, total, estado, canal, created_at)
        VALUES (101, '+34600000099',
                '[{"nombre": "Pizza de WhatsApp", "cantidad": 2, "precio_unitario": 10}]',
                20, 'entregado', 'whatsapp', '2026-08-10 12:00')
      `;
      const response = await ctx.app.request(
        "/panel/prueba-a/reports/overview?desde=2026-08-10&hasta=2026-08-10",
        { headers: auth("ownerA") },
      );
      const body = (await response.json()) as {
        productos: { nombre: string; cantidad: number; ventas: number }[];
        canal: { whatsapp: number };
      };
      expect(body.productos).toEqual([{ nombre: "Pizza de WhatsApp", cantidad: 2, ventas: 20 }]);
      expect(body.canal.whatsapp).toBe(1);
    });

    it("el plan Básico no incluye estadísticas", async () => {
      const response = await ctx.app.request(
        "/panel/prueba-b/reports/overview?desde=2026-10-01&hasta=2026-10-07",
        { headers: auth("ownerB") },
      );
      expect(response.status).toBe(403);
    });

    it("un cajero solo ve las ventas de su local", async () => {
      const response = await ctx.app.request(
        "/panel/prueba-c/reports/overview?desde=2026-10-01&hasta=2026-10-07&local=3003",
        { headers: auth("cashierPlaya") },
      );
      expect(response.status).toBe(403);
    });
  });
});
