import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;

async function call(user: User, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

const playaZone = {
  nombre: "Playa Honda 3 km",
  sucursal_id: 3002,
  cobertura: { tipo: "radio", lat: 28.9539, lng: -13.5772, radio_km: 3 },
  tarifa: { tipo: "por_km", base_centimos: 150, por_km_centimos: 50, maxima_centimos: 400 },
  pedido_minimo_centimos: 1200,
  envio_gratis_desde_centimos: 3000,
  minutos_min: 25,
  minutos_max: 40,
};

describe.skipIf(!TEST_DATABASE_URL)("reparto y tiempos", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("zonas de reparto", () => {
    it("lista las zonas de los locales del usuario en céntimos", async () => {
      const result = await call("ownerA", "GET", "/panel/prueba-a/reparto/zonas");
      expect(result.status).toBe(200);
      expect(result.body.zonas).toEqual([
        expect.objectContaining({
          nombre: "Arrecife centro",
          cobertura: { tipo: "codigo_postal", codigo_postal: "35500" },
          tarifa: { tipo: "fija", base_centimos: 250 },
          pedido_minimo_centimos: 1500,
          minutos_min: 30,
          minutos_max: 40,
        }),
      ]);
    });

    it("crea una zona por km y la guarda en euros, como la leen la cotización y n8n", async () => {
      const created = await call("ownerC", "POST", "/panel/prueba-c/reparto/zonas", playaZone);
      expect(created.status).toBe(201);
      const [row] = await ctx.sql<
        { fee: string; tarifa_por_km: string; tipo_tarifa: string; min_order_amount: string }[]
      >`
        SELECT fee, tarifa_por_km, tipo_tarifa, min_order_amount FROM public.delivery_zone
        WHERE  delivery_zone_id = ${created.body.id}
      `;
      expect(row).toEqual({
        fee: "1.50",
        tarifa_por_km: "0.50",
        tipo_tarifa: "por_km",
        min_order_amount: "12.00",
      });
      const listed = await call("ownerC", "GET", "/panel/prueba-c/reparto/zonas");
      expect(
        listed.body.zonas.find((zone: { id: number }) => zone.id === created.body.id),
      ).toMatchObject(playaZone);
    });

    it("valida tiempos, tope por km y códigos postales repetidos", async () => {
      const path = "/panel/prueba-a/reparto/zonas";
      const base = { ...playaZone, sucursal_id: undefined };
      const principal = (await call("ownerA", "GET", path)).body.locales[0].id;
      const zone = { ...base, sucursal_id: principal };
      expect(
        (await call("ownerA", "POST", path, { ...zone, minutos_min: 50, minutos_max: 20 })).body
          .reason,
      ).toBe("min_over_max");
      expect(
        (
          await call("ownerA", "POST", path, {
            ...zone,
            tarifa: {
              tipo: "por_km",
              base_centimos: 500,
              por_km_centimos: 50,
              maxima_centimos: 100,
            },
          })
        ).body.reason,
      ).toBe("max_below_base");
      const duplicate = await call("ownerA", "POST", path, {
        ...zone,
        nombre: "Otra",
        cobertura: { tipo: "codigo_postal", codigo_postal: "35500" },
      });
      expect(duplicate).toMatchObject({ status: 409, body: { reason: "duplicate_postal_code" } });
      const city = await call("ownerA", "POST", path, {
        ...zone,
        nombre: "Toda la ciudad",
        cobertura: { tipo: "toda_la_ciudad" },
        tarifa: { tipo: "fija", base_centimos: 300 },
      });
      expect(city.status).toBe(201);
    });

    it("edita y borra solo zonas de sus locales", async () => {
      const created = await call("ownerC", "POST", "/panel/prueba-c/reparto/zonas", {
        ...playaZone,
        nombre: "Temporal",
      });
      const id = created.body.id;
      // Encargado de Playa Honda: su zona sí; mover la zona a otro local, no.
      expect(
        (
          await call("managerPlaya", "PUT", `/panel/prueba-c/reparto/zonas/${id}`, {
            ...playaZone,
            nombre: "Temporal 2",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("managerPlaya", "PUT", `/panel/prueba-c/reparto/zonas/${id}`, {
            ...playaZone,
            sucursal_id: 3003,
          })
        ).status,
      ).toBe(404);
      // La zona del Centro (3101) no la ve ni la toca.
      const list = await call("managerPlaya", "GET", "/panel/prueba-c/reparto/zonas");
      expect(list.body.zonas.map((zone: { id: number }) => zone.id)).not.toContain(3101);
      expect(
        (await call("managerPlaya", "DELETE", "/panel/prueba-c/reparto/zonas/3101")).status,
      ).toBe(404);
      // Otro restaurante tampoco.
      expect((await call("ownerB", "DELETE", `/panel/prueba-b/reparto/zonas/${id}`)).status).toBe(
        404,
      );
      expect((await call("ownerC", "DELETE", `/panel/prueba-c/reparto/zonas/${id}`)).status).toBe(
        200,
      );
    });

    it("el personal ve las zonas pero no las cambia", async () => {
      expect((await call("cashierPlaya", "GET", "/panel/prueba-c/reparto/zonas")).status).toBe(200);
      expect(
        (await call("cashierPlaya", "POST", "/panel/prueba-c/reparto/zonas", playaZone)).status,
      ).toBe(403);
    });
  });

  describe("horas punta", () => {
    it("crea, edita y borra franjas; la general exige todos los locales", async () => {
      const peak = {
        dia: "Viernes",
        desde: "20:00",
        hasta: "22:30",
        servicio: "reparto",
        minutos_extra: 15,
      };
      const created = await call("ownerC", "POST", "/panel/prueba-c/ajustes/franjas", peak);
      expect(created.status).toBe(201);
      expect(
        (
          await call("ownerC", "PUT", `/panel/prueba-c/ajustes/franjas/${created.body.id}`, {
            ...peak,
            minutos_extra: 20,
          })
        ).status,
      ).toBe(200);
      const listed = await call("ownerC", "GET", "/panel/prueba-c/ajustes/franjas");
      expect(listed.body.franjas).toEqual([
        expect.objectContaining({
          dia: "Viernes",
          desde: "20:00",
          minutos_extra: 20,
          sucursal_id: null,
        }),
      ]);

      expect(
        (await call("managerPlaya", "POST", "/panel/prueba-c/ajustes/franjas", peak)).body.reason,
      ).toBe("branch_scope_limited");
      expect(
        (
          await call("managerPlaya", "POST", "/panel/prueba-c/ajustes/franjas", {
            ...peak,
            sucursal_id: 3002,
          })
        ).status,
      ).toBe(201);
      expect(
        (await call("managerPlaya", "DELETE", `/panel/prueba-c/ajustes/franjas/${created.body.id}`))
          .status,
      ).toBe(403);
      expect(
        (await call("ownerC", "DELETE", `/panel/prueba-c/ajustes/franjas/${created.body.id}`))
          .status,
      ).toBe(200);
    });

    it("rechaza franjas vacías y no toca las de otro restaurante", async () => {
      expect(
        (
          await call("ownerC", "POST", "/panel/prueba-c/ajustes/franjas", {
            desde: "20:00",
            hasta: "20:00",
            minutos_extra: 10,
          })
        ).body.reason,
      ).toBe("empty_range");
      const created = await call("ownerC", "POST", "/panel/prueba-c/ajustes/franjas", {
        desde: "13:00",
        hasta: "15:00",
        minutos_extra: 10,
      });
      expect(
        (await call("ownerB", "DELETE", `/panel/prueba-b/ajustes/franjas/${created.body.id}`))
          .status,
      ).toBe(404);
    });
  });

  describe("suplementos", () => {
    it("guarda los suplementos en surcharge_rules y se aplican al pedido", async () => {
      const result = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
        suplementos: [
          {
            concepto: "Envases",
            por_debajo_centimos: 2000,
            importe_centimos: 50,
            aplica_a: "recogida",
          },
        ],
      });
      expect(result.status).toBe(200);
      const [row] = await ctx.sql<{ config_value: string }[]>`
        SELECT config_value FROM public.restaurante_config
        WHERE  restaurante_id = 101 AND config_key = 'surcharge_rules'
      `;
      expect(JSON.parse(row?.config_value ?? "[]")).toEqual([
        { label: "Envases", below: 20, amount: 0.5, appliesTo: ["retiro"] },
      ]);
      const read = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(read.body.restaurante.suplementos).toEqual([
        {
          concepto: "Envases",
          por_debajo_centimos: 2000,
          importe_centimos: 50,
          aplica_a: "recogida",
        },
      ]);
      await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", { suplementos: [] });
      expect(
        (await call("ownerA", "GET", "/panel/prueba-a/ajustes")).body.restaurante.suplementos,
      ).toEqual([]);
    });
  });
});
