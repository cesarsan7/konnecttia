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

const WEEK = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const week = (overrides: Record<string, unknown> = {}) =>
  WEEK.map((dia) => ({
    dia,
    disponible: dia !== "Lunes",
    apertura_1: dia === "Lunes" ? null : "12:00",
    cierre_1: dia === "Lunes" ? null : "16:00",
    apertura_2: dia === "Lunes" ? null : "20:00",
    cierre_2: dia === "Lunes" ? null : "00:30",
    ...overrides,
  }));

const IBAN = "ES91 2100 0418 4502 0005 1332";

describe.skipIf(!TEST_DATABASE_URL)("ajustes del restaurante", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  it("lee los ajustes del propio restaurante con la semana completa", async () => {
    const result = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
    expect(result.status).toBe(200);
    expect(result.body.restaurante).toMatchObject({
      nombre: "Cafetería de prueba A",
      metodos_pago: ["efectivo", "tarjeta", "transferencia"],
      apertura_manual: "abierto",
      recogida_minutos: 15,
    });
    expect(result.body.horario.map((day: { dia: string }) => day.dia)).toEqual(WEEK);
    expect(result.body.edicion_completa).toBe(true);
  });

  it("el rol de consulta no lee los ajustes y otro restaurante tampoco", async () => {
    expect((await call("viewerA", "GET", "/panel/prueba-a/ajustes")).status).toBe(403);
    expect((await call("ownerB", "GET", "/panel/prueba-a/ajustes")).status).toBe(403);
    expect(
      (await call("ownerB", "PATCH", "/panel/prueba-a/ajustes/restaurante", { nombre: "X" }))
        .status,
    ).toBe(403);
  });

  describe("pago", () => {
    it("cambia transferencia por tarjeta y la web lo ofrece", async () => {
      const result = await call("ownerA", "PATCH", "/panel/prueba-a/ajustes/restaurante", {
        metodos_pago: ["efectivo", "tarjeta"],
      });
      expect(result.status).toBe(200);
      const menu = (await (await ctx.app.request("/public/prueba-a/menu")).json()) as {
        restaurante: { metodos_pago: string[] };
      };
      expect(menu.restaurante.metodos_pago).toEqual(["efectivo", "tarjeta"]);
    });

    it("transferencia exige IBAN válido y titular; Bizum, teléfono", async () => {
      const path = "/panel/prueba-a/ajustes/restaurante";
      expect(
        (
          await call("ownerA", "PATCH", path, {
            metodos_pago: ["transferencia"],
            datos_bancarios: null,
          })
        ).body.reason,
      ).toBe("transfer_without_iban");
      expect(
        (
          await call("ownerA", "PATCH", path, {
            metodos_pago: ["transferencia"],
            datos_bancarios: { iban: "ES00 1234", titular: "Ana" },
          })
        ).body.reason,
      ).toBe("invalid_iban");
      expect((await call("ownerA", "PATCH", path, { metodos_pago: ["bizum"] })).body.reason).toBe(
        "bizum_without_phone",
      );
      const ok = await call("ownerA", "PATCH", path, {
        metodos_pago: ["efectivo", "transferencia"],
        datos_bancarios: { iban: IBAN, titular: "Cafetería A SL", concepto: "" },
      });
      expect(ok.status).toBe(200);
      const [row] = await ctx.sql<{ datos_bancarios: Record<string, string> }[]>`
        SELECT datos_bancarios FROM public.restaurante WHERE id = 101
      `;
      // IBAN normalizado y sin campos vacíos.
      expect(row?.datos_bancarios).toEqual({
        iban: "ES9121000418450200051332",
        titular: "Cafetería A SL",
      });
    });

    it("rechaza «online» (aún no hay pasarela) y quedarse sin servicio", async () => {
      const path = "/panel/prueba-a/ajustes/restaurante";
      expect((await call("ownerA", "PATCH", path, { metodos_pago: ["online"] })).status).toBe(400);
      expect(
        (await call("ownerA", "PATCH", path, { recogida: false, reparto: false })).body.reason,
      ).toBe("no_service");
    });

    it("no guarda datos bancarios en la auditoría", async () => {
      const rows = await ctx.sql<{ detalle: Record<string, unknown> }[]>`
        SELECT detalle FROM public.auditoria
        WHERE  restaurante_id = 101 AND accion = 'ajustes.restaurante'
      `;
      expect(JSON.stringify(rows)).not.toContain("ES91");
    });
  });

  describe("tiempos y apertura", () => {
    it("guarda las claves que leen la API y n8n, y las borra con null", async () => {
      const path = "/panel/prueba-a/ajustes/restaurante";
      await call("ownerA", "PATCH", path, {
        apertura_manual: "auto",
        recogida_minutos: 20,
        reparto_minutos_min: 30,
        reparto_minutos_max: 45,
        modo_ocupado_opciones: [20, 10, 20],
        modo_ocupado_duracion_minutos: 90,
      });
      const config = new Map(
        (
          await ctx.sql<{ config_key: string; config_value: string }[]>`
            SELECT config_key, config_value FROM public.restaurante_config WHERE restaurante_id = 101
          `
        ).map((row) => [row.config_key, row.config_value]),
      );
      expect(config.has("is_open_override")).toBe(false);
      expect(config.get("pickup_eta_minutes")).toBe("20");
      expect(config.get("delivery_eta_max_minutes")).toBe("45");
      expect(config.get("modo_ocupado_opciones")).toBe("[10,20]");
      expect(config.get("modo_ocupado_duracion_minutos")).toBe("90");

      expect(
        (await call("ownerA", "PATCH", path, { reparto_minutos_min: 50, reparto_minutos_max: 40 }))
          .body.reason,
      ).toBe("min_over_max");
      await call("ownerA", "PATCH", path, { apertura_manual: "cerrado" });
      const access = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(access.body.restaurante.apertura_manual).toBe("cerrado");
      await call("ownerA", "PATCH", path, { apertura_manual: "abierto" });
    });
  });

  describe("horario y festivos", () => {
    it("guarda la semana conservando cómo escribe el día n8n", async () => {
      await ctx.sql`
        INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
        VALUES (101, 'miercoles', true, '09:00', '13:00')
      `;
      const result = await call("ownerA", "PUT", "/panel/prueba-a/ajustes/horario", {
        dias: week(),
      });
      expect(result.status).toBe(200);
      const rows = await ctx.sql<{ dia: string; cierre_2: string | null }[]>`
        SELECT dia, to_char(cierre_2, 'HH24:MI') AS cierre_2 FROM public.horarios
        WHERE  restaurante_id = 101 ORDER BY id
      `;
      expect(rows).toHaveLength(7);
      expect(rows.find((row) => row.dia === "miercoles")?.cierre_2).toBe("00:30");
    });

    it("rechaza turnos a medias o semanas incompletas", async () => {
      const bad = week({ cierre_1: null });
      expect(
        (await call("ownerA", "PUT", "/panel/prueba-a/ajustes/horario", { dias: bad })).body.reason,
      ).toBe("incomplete_shift");
      expect(
        (await call("ownerA", "PUT", "/panel/prueba-a/ajustes/horario", { dias: week().slice(1) }))
          .status,
      ).toBe(400);
    });

    it("crea y borra festivos; la misma fecha no se repite", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/ajustes/festivos", {
        fecha: "2026-12-25",
        nombre: "Navidad",
        cerrado: true,
      });
      expect(created.status).toBe(201);
      const again = await call("ownerA", "POST", "/panel/prueba-a/ajustes/festivos", {
        fecha: "2026-12-25",
      });
      expect(again.status).toBe(409);
      const listed = await call("ownerA", "GET", "/panel/prueba-a/ajustes");
      expect(listed.body.festivos).toEqual([
        expect.objectContaining({ fecha: "2026-12-25", nombre: "Navidad", cerrado: true }),
      ]);
      expect(
        (await call("ownerB", "DELETE", `/panel/prueba-b/ajustes/festivos/${created.body.id}`))
          .status,
      ).toBe(404);
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/ajustes/festivos/${created.body.id}`))
          .status,
      ).toBe(200);
    });
  });

  describe("locales", () => {
    it("el propietario edita un local y le pone horario propio", async () => {
      const edit = await call("ownerC", "PATCH", "/panel/prueba-c/ajustes/locales/3002", {
        telefono: "+34928000000",
        apertura_manual: "cerrado",
        lat: 28.95,
        lng: -13.57,
      });
      expect(edit.status).toBe(200);
      const own = await call("ownerC", "PUT", "/panel/prueba-c/ajustes/locales/3002/horario", {
        dias: week(),
      });
      expect(own.status).toBe(200);
      const read = await call("ownerC", "GET", "/panel/prueba-c/ajustes");
      const playa = read.body.locales.find((local: { id: number }) => local.id === 3002);
      expect(playa).toMatchObject({
        telefono: "+34928000000",
        apertura_manual: "cerrado",
        lat: 28.95,
      });
      expect(playa.horario_propio).toHaveLength(7);

      await call("ownerC", "PUT", "/panel/prueba-c/ajustes/locales/3002/horario", { dias: null });
      await call("ownerC", "PATCH", "/panel/prueba-c/ajustes/locales/3002", {
        apertura_manual: "auto",
      });
      const after = await call("ownerC", "GET", "/panel/prueba-c/ajustes");
      expect(
        after.body.locales.find((l: { id: number }) => l.id === 3002).horario_propio,
      ).toBeNull();
    });

    it("la principal no se desactiva y un local necesita algún servicio", async () => {
      const read = await call("ownerC", "GET", "/panel/prueba-c/ajustes");
      const principal = read.body.locales.find((local: { principal: boolean }) => local.principal);
      expect(
        (
          await call("ownerC", "PATCH", `/panel/prueba-c/ajustes/locales/${principal.id}`, {
            activo: false,
          })
        ).body.reason,
      ).toBe("principal_required");
      expect(
        (
          await call("ownerC", "PATCH", "/panel/prueba-c/ajustes/locales/3002", {
            recogida: false,
            reparto: false,
          })
        ).body.reason,
      ).toBe("no_service");
    });

    it("un encargado limitado a un local solo ve y cambia ese local", async () => {
      const read = await call("managerPlaya", "GET", "/panel/prueba-c/ajustes");
      expect(read.status).toBe(200);
      expect(read.body.locales.map((local: { id: number }) => local.id)).toEqual([3002]);
      expect(read.body.edicion_completa).toBe(false);

      expect(
        (
          await call("managerPlaya", "PATCH", "/panel/prueba-c/ajustes/locales/3002", {
            telefono: "1",
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await call("managerPlaya", "PATCH", "/panel/prueba-c/ajustes/locales/3003", {
            telefono: "1",
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await call("managerPlaya", "PATCH", "/panel/prueba-c/ajustes/restaurante", {
            nombre: "X",
          })
        ).body.reason,
      ).toBe("branch_scope_limited");
      // Festivo de su local sí; festivo general no.
      expect(
        (
          await call("managerPlaya", "POST", "/panel/prueba-c/ajustes/festivos", {
            fecha: "2026-12-31",
            sucursal_id: 3002,
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await call("managerPlaya", "POST", "/panel/prueba-c/ajustes/festivos", {
            fecha: "2026-12-31",
          })
        ).status,
      ).toBe(403);
    });

    it("no toca locales de otro restaurante ni el oculto sin módulo", async () => {
      expect(
        (await call("ownerB", "PATCH", "/panel/prueba-b/ajustes/locales/3002", { telefono: "1" }))
          .status,
      ).toBe(404);
      expect(
        (await call("ownerB", "PATCH", "/panel/prueba-b/ajustes/locales/2002", { telefono: "1" }))
          .status,
      ).toBe(404);
    });
  });
});
