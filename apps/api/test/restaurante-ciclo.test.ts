import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, USERS } from "./harness";

let ctx: TestContext;
type User = keyof typeof USERS;
// biome-ignore lint/suspicious/noExplicitAny: respuestas JSON de la API en las pruebas
type Json = Record<string, any>;

async function call(user: User | null, method: string, path: string, body?: unknown) {
  const response = await ctx.app.request(path, {
    method,
    headers: {
      ...(user ? auth(user) : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Json };
}

const newRestaurant = (overrides: Record<string, unknown> = {}) => ({
  nombre: "Bar Origen",
  slug: "bar-origen",
  zona_horaria: "Atlantic/Canary",
  plan: "basico",
  local: { nombre: "Origen Centro", direccion: "Calle 1", telefono: "+34900000001" },
  propietario_email: "dueno@origen.test",
  ...overrides,
});

const ALL = { carta: true, horario: true, reparto: true, ajustes: true };

describe.skipIf(!TEST_DATABASE_URL)("borrar y clonar restaurantes desde /interno", () => {
  let sourceId = 0;

  beforeAll(async () => {
    ctx = await setupTestApp();
    await ctx.sql`
      INSERT INTO public.plataforma_miembro (user_id, email, rol, activo) VALUES
        (${USERS.platformAdmin.userId}::uuid, ${USERS.platformAdmin.email}, 'admin', true),
        (${USERS.platformSupport.userId}::uuid, ${USERS.platformSupport.email}, 'soporte', true)
    `;
    const created = await call(
      "platformAdmin",
      "POST",
      "/plataforma/restaurantes",
      newRestaurant(),
    );
    sourceId = created.body.id as number;

    // Datos del origen: carta con variante y extra ligado, horario, reparto, ajustes y secretos.
    const [category] = await ctx.sql<{ menu_category_id: string }[]>`
      INSERT INTO public.menu_category (name, sort_order, restaurante_id)
      VALUES ('Pizzas', 1, ${sourceId}) RETURNING menu_category_id`;
    const [item] = await ctx.sql<{ menu_item_id: string }[]>`
      INSERT INTO public.menu_item (menu_category_id, name, description, base_price, restaurante_id, image_url)
      VALUES (${category?.menu_category_id ?? "0"}, 'Margarita', 'Clásica', 9.5, ${sourceId}, 'https://img.test/m.jpg')
      RETURNING menu_item_id`;
    await ctx.sql`
      INSERT INTO public.menu_variant (menu_item_id, variant_name, price, is_default, restaurante_id)
      VALUES (${item?.menu_item_id ?? "0"}, 'Grande', 12, true, ${sourceId})`;
    const [extra] = await ctx.sql<{ extra_id: string }[]>`
      INSERT INTO public.extra (name, price, restaurante_id) VALUES ('Queso extra', 1.5, ${sourceId})
      RETURNING extra_id`;
    await ctx.sql`
      INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
      VALUES (${category?.menu_category_id ?? "0"}, ${extra?.extra_id ?? "0"})`;
    await ctx.sql`DELETE FROM public.horarios WHERE restaurante_id = ${sourceId}`;
    await ctx.sql`
      INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
      VALUES (${sourceId}, 'lunes', true, '12:00', '23:00')`;
    await ctx.sql`
      INSERT INTO public.delivery_zone (zone_name, fee, restaurante_id, lat_center, lng_center, radius_km)
      VALUES ('Centro', 2.5, ${sourceId}, 28.9, -13.5, 3)`;
    await ctx.sql`
      UPDATE public.restaurante
      SET eslogan = 'El origen', brand_color = '#112233',
          datos_bancarios = '{"iban":"ES0000000000000000000000"}'::jsonb,
          logo_url = 'https://img.test/logo.png', descripcion = 'Desc origen'
      WHERE id = ${sourceId}`;
    await ctx.sql`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
        (${sourceId}, 'pickup_eta_minutes', '25'),
        (${sourceId}, 'n8n_webhook_avisos', 'https://secreto.test/hook')`;
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("clonar", () => {
    it("copia carta, horario, reparto y ajustes sin datos propios del negocio", async () => {
      const result = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({
          nombre: "Bar Clon",
          slug: "bar-clon",
          local: { nombre: "Clon Centro" },
          propietario_email: "dueno@clon.test",
          clonar_de: { restaurante_id: sourceId, ...ALL },
        }),
      );
      expect(result.status).toBe(201);
      const id = result.body.id as number;

      const menu = await ctx.sql`
        SELECT c.name AS categoria, i.name AS producto, i.image_url, v.variant_name, v.price::float AS price
        FROM   public.menu_category c
        JOIN   public.menu_item i ON i.menu_category_id = c.menu_category_id
        JOIN   public.menu_variant v ON v.menu_item_id = i.menu_item_id
        WHERE  c.restaurante_id = ${id} AND i.restaurante_id = ${id} AND v.restaurante_id = ${id}`;
      expect(menu).toEqual([
        {
          categoria: "Pizzas",
          producto: "Margarita",
          image_url: "https://img.test/m.jpg",
          variant_name: "Grande",
          price: 12,
        },
      ]);
      const links = await ctx.sql`
        SELECT e.name FROM public.menu_category_extra mce
        JOIN public.extra e ON e.extra_id = mce.extra_id
        JOIN public.menu_category c ON c.menu_category_id = mce.menu_category_id
        WHERE c.restaurante_id = ${id} AND e.restaurante_id = ${id}`;
      expect(links).toEqual([{ name: "Queso extra" }]);

      const schedule = await ctx.sql`SELECT dia FROM public.horarios WHERE restaurante_id = ${id}`;
      expect(schedule).toEqual([{ dia: "lunes" }]);
      const [branch] = await ctx.sql`
        SELECT id FROM public.sucursal WHERE restaurante_id = ${id} AND es_principal`;
      const zones = await ctx.sql`
        SELECT zone_name, sucursal_id FROM public.delivery_zone WHERE restaurante_id = ${id}`;
      expect(zones).toEqual([{ zone_name: "Centro", sucursal_id: branch?.id }]);

      const [restaurant] = await ctx.sql`
        SELECT eslogan, brand_color, descripcion, datos_bancarios, logo_url, telefono
        FROM public.restaurante WHERE id = ${id}`;
      expect(restaurant).toMatchObject({
        eslogan: "El origen",
        brand_color: "#112233",
        descripcion: "Desc origen",
        datos_bancarios: null,
        logo_url: null,
        telefono: null,
      });
      const config = await ctx.sql`
        SELECT config_key FROM public.restaurante_config WHERE restaurante_id = ${id}`;
      expect(config.map((row) => row.config_key)).toEqual(["pickup_eta_minutes"]);

      // El origen no cambia.
      const [origin] = await ctx.sql<{ total: number }[]>`
        SELECT count(*)::int AS total FROM public.menu_item WHERE restaurante_id = ${sourceId}`;
      expect(origin?.total).toBe(1);
      const [log] = await ctx.sql`
        SELECT detalle FROM public.auditoria
        WHERE restaurante_id = ${id} AND accion = 'plataforma.restaurante.crear'`;
      expect(log?.detalle.clonado).toMatchObject({ origen_id: sourceId });
    });

    it("copia solo lo que se pide", async () => {
      const result = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({
          nombre: "Bar Solo Carta",
          slug: "bar-solo-carta",
          local: { nombre: "Solo Carta" },
          propietario_email: "dueno@carta.test",
          clonar_de: {
            restaurante_id: sourceId,
            carta: true,
            horario: false,
            reparto: false,
            ajustes: false,
          },
        }),
      );
      expect(result.status).toBe(201);
      const id = result.body.id as number;
      const [counts] = await ctx.sql`
        SELECT (SELECT count(*)::int FROM public.menu_item WHERE restaurante_id = ${id}) AS items,
               (SELECT count(*)::int FROM public.horarios WHERE restaurante_id = ${id}) AS horarios,
               (SELECT count(*)::int FROM public.delivery_zone WHERE restaurante_id = ${id}) AS zonas,
               (SELECT eslogan FROM public.restaurante WHERE id = ${id}) AS eslogan`;
      expect(counts).toEqual({ items: 1, horarios: 0, zonas: 0, eslogan: null });
    });

    it("rechaza un restaurante de origen que no existe y no crea nada", async () => {
      const result = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({
          slug: "bar-fantasma",
          clonar_de: { restaurante_id: 999999, ...ALL },
        }),
      );
      expect(result.status).toBe(422);
      expect(result.body).toMatchObject({ reason: "unknown_source" });
      const rows = await ctx.sql`SELECT 1 FROM public.restaurante WHERE slug = 'bar-fantasma'`;
      expect(rows).toHaveLength(0);
    });
  });

  describe("borrar", () => {
    let id = 0;

    beforeAll(async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({
          nombre: "Bar Borrable",
          slug: "bar-borrable",
          local: { nombre: "Borrable Centro" },
          propietario_email: "dueno@borrable.test",
          clonar_de: { restaurante_id: sourceId, ...ALL },
        }),
      );
      id = created.body.id as number;
      const [mesero] = await ctx.sql<{ id: number }[]>`
        INSERT INTO public.meseros (restaurante_id, nombre) VALUES (${id}, 'Ana') RETURNING id`;
      await ctx.sql`
        INSERT INTO public.pedidos (restaurante_id, telefono, mesero_id, estado)
        VALUES (${id}, '+34600000001', ${mesero?.id ?? null}, 'recibido'),
               (${id}, '+34600000002', NULL, 'entregado')`;
    });

    it("el detalle avisa de cuántos pedidos hay", async () => {
      const detail = await call("platformAdmin", "GET", `/plataforma/restaurantes/${id}`);
      expect(detail.body.pedidos_total).toBe(2);
    });

    it("soporte no puede, sin sesión 401 y un id inexistente 404", async () => {
      expect(
        (
          await call("platformSupport", "DELETE", `/plataforma/restaurantes/${id}`, {
            confirmar: "bar-borrable",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await call(null, "DELETE", `/plataforma/restaurantes/${id}`, {
            confirmar: "bar-borrable",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await call("platformAdmin", "DELETE", "/plataforma/restaurantes/999999", {
            confirmar: "x",
          })
        ).status,
      ).toBe(404);
    });

    it("exige repetir el enlace del restaurante y no borra si no coincide", async () => {
      const wrong = await call("platformAdmin", "DELETE", `/plataforma/restaurantes/${id}`, {
        confirmar: "otro-bar",
      });
      expect(wrong.status).toBe(422);
      expect(wrong.body).toMatchObject({ reason: "confirmation_mismatch" });
      const rows = await ctx.sql`SELECT 1 FROM public.restaurante WHERE id = ${id}`;
      expect(rows).toHaveLength(1);
    });

    it("borra el restaurante con sus pedidos, meseros y datos, y conserva la auditoría", async () => {
      const result = await call("platformAdmin", "DELETE", `/plataforma/restaurantes/${id}`, {
        confirmar: "bar-borrable",
      });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        id,
        eliminado: true,
        pedidos: 2,
        archivos: { carta: "sin_almacen" },
      });

      const [left] = await ctx.sql<{ n: number }[]>`
        SELECT (SELECT count(*)::int FROM public.restaurante WHERE id = ${id})
             + (SELECT count(*)::int FROM public.pedidos WHERE restaurante_id = ${id})
             + (SELECT count(*)::int FROM public.meseros WHERE restaurante_id = ${id})
             + (SELECT count(*)::int FROM public.menu_item WHERE restaurante_id = ${id})
             + (SELECT count(*)::int FROM public.sucursal WHERE restaurante_id = ${id})
             + (SELECT count(*)::int FROM public.local_memberships WHERE restaurante_id = ${id}) AS n`;
      expect(left?.n).toBe(0);

      // La auditoría sigue ahí, desvinculada, con el registro del borrado.
      const audit = await ctx.sql`
        SELECT accion, restaurante_id, detalle FROM public.auditoria
        WHERE accion = 'plataforma.restaurante.borrar' AND recurso_id = ${String(id)}`;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ restaurante_id: null });
      expect(audit[0]?.detalle).toMatchObject({ slug: "bar-borrable", pedidos: 2 });
      const created = await ctx.sql`
        SELECT restaurante_id FROM public.auditoria
        WHERE accion = 'plataforma.restaurante.crear' AND detalle->>'slug' = 'bar-borrable'`;
      expect(created).toHaveLength(1);
      expect(created[0]?.restaurante_id).toBeNull();
    });

    it("borra también los archivos de Storage del restaurante y anota el resultado", async () => {
      const created = await call(
        "platformAdmin",
        "POST",
        "/plataforma/restaurantes",
        newRestaurant({
          nombre: "Bar Con Archivos",
          slug: "bar-con-archivos",
          local: { nombre: "Archivos Centro" },
          propietario_email: "dueno@archivos.test",
        }),
      );
      const fid = created.body.id as number;
      const asked: string[] = [];
      const app = ctx.appWith({
        imageStorage: {
          upload: async () => "x",
          removeFolder: async (prefix) => {
            asked.push(`carta:${prefix}`);
            return 3;
          },
        },
        proofStorage: {
          upload: async () => {},
          signedUrl: async () => "x",
          remove: async () => {},
          removeFolder: async (prefix) => {
            asked.push(`privado:${prefix}`);
            if (prefix.startsWith("entregas")) throw new Error("fallo simulado");
            return 2;
          },
        },
      });
      const response = await app.request(`/plataforma/restaurantes/${fid}`, {
        method: "DELETE",
        headers: { ...auth("platformAdmin"), "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: "bar-con-archivos" }),
      });
      const body = (await response.json()) as Json;
      expect(response.status).toBe(200);
      expect(asked.sort()).toEqual(
        [`carta:${fid}`, `privado:${fid}`, `privado:entregas/${fid}`].sort(),
      );
      // Un fallo en una parte no deshace el borrado ni impide las demás.
      expect(body.archivos).toEqual({ carta: 3, justificantes: 2, fotos_entrega: "error" });
      const audit = await ctx.sql`
        SELECT detalle FROM public.auditoria
        WHERE accion = 'plataforma.restaurante.borrar' AND recurso_id = ${String(fid)}`;
      expect(audit[0]?.detalle).toMatchObject({ archivos: body.archivos });
    });

    it("la auditoría sigue siendo inmutable: no se edita ni se borra", async () => {
      await expect(ctx.sql`UPDATE public.auditoria SET accion = 'x'`).rejects.toThrow(/auditoría/);
      await expect(ctx.sql`DELETE FROM public.auditoria`).rejects.toThrow(/auditoría/);
      // Ni siquiera desvincular a la vez que se cambia otra columna.
      await expect(
        ctx.sql`UPDATE public.auditoria SET restaurante_id = NULL, accion = 'x' WHERE restaurante_id = ${sourceId}`,
      ).rejects.toThrow(/auditoría/);
    });
  });
});
