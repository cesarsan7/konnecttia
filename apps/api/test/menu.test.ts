import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectImageType } from "../src/repositories/menu-admin";
import { auth, setupTestApp, TEST_DATABASE_URL, type TestContext, type USERS } from "./harness";

let ctx: TestContext;

type User = keyof typeof USERS;

type AdminMenu = {
  categorias: { id: number; nombre: string; activa: boolean; orden: number }[];
  productos: {
    id: number;
    categoria_id: number;
    nombre: string;
    activo: boolean;
    alergenos: string[] | null;
    imagen_url: string | null;
    variantes: { id: number; nombre: string; precio_centimos: number; predeterminada: boolean }[];
    no_disponible_en: number[];
  }[];
  extras: { id: number; nombre: string; precio_centimos: number; categorias: number[] }[];
  locales: { id: number; nombre: string }[];
  subida_fotos: boolean;
  edicion_completa: boolean;
};

async function call(
  user: User,
  method: string,
  path: string,
  body?: unknown,
  app = ctx.app,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await app.request(path, {
    method,
    headers: {
      ...auth(user),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function menuOf(user: User, slug: string): Promise<AdminMenu> {
  const result = await call(user, "GET", `/panel/${slug}/carta`);
  expect(result.status).toBe(200);
  return result.body as unknown as AdminMenu;
}

async function publicMenu(slug: string, local?: number) {
  const response = await ctx.app.request(`/public/${slug}/menu${local ? `?local=${local}` : ""}`);
  return (await response.json()) as {
    categories: {
      name: string;
      items: {
        id: number;
        name: string;
        allergens: { status: string; allergens?: string[] };
        extras: { name: string; allergens: { status: string } }[];
        variants: { name: string; price: number; isDefault: boolean }[];
      }[];
    }[];
  };
}

describe("firma de imágenes", () => {
  it("reconoce JPEG, PNG y WebP por su contenido y rechaza lo demás", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))?.ext).toBe("png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(detectImageType(webp)?.ext).toBe("webp");
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("carta desde el panel", () => {
  beforeAll(async () => {
    ctx = await setupTestApp();
  }, 60_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe("lectura", () => {
    it("muestra toda la carta del restaurante, también lo oculto, con precios en céntimos", async () => {
      const menu = await menuOf("ownerA", "prueba-a");
      expect(menu.categorias.map((category) => category.nombre)).toEqual(["Salchipapas"]);
      expect(menu.productos.map((item) => item.nombre)).toEqual(["Salchimaduro", "Plato retirado"]);
      const item = menu.productos.find((product) => product.id === 1101);
      expect(item?.alergenos).toBeNull();
      expect(item?.variantes.map((variant) => variant.precio_centimos)).toEqual([900, 1400]);
      expect(menu.extras).toEqual([
        expect.objectContaining({ nombre: "Queso", precio_centimos: 250, categorias: [1001] }),
      ]);
      expect(menu.edicion_completa).toBe(true);
      expect(menu.subida_fotos).toBe(false);
    });

    it("no mezcla restaurantes", async () => {
      const menu = await menuOf("ownerB", "prueba-b");
      expect(menu.productos.map((item) => item.id)).toEqual([2101]);
      expect(menu.extras.map((extra) => extra.id)).toEqual([2301]);
      expect((await call("ownerB", "GET", "/panel/prueba-a/carta")).status).toBe(403);
    });

    it("el rol de consulta lee pero no cambia nada", async () => {
      expect((await call("viewerA", "GET", "/panel/prueba-a/carta")).status).toBe(200);
      const denied = await call("viewerA", "POST", "/panel/prueba-a/carta/categorias", {
        nombre: "Postres",
      });
      expect(denied).toMatchObject({ status: 403, body: { permission: "menu.create" } });
      expect(
        (await call("viewerA", "PATCH", "/panel/prueba-a/carta/productos/1101", { activo: false }))
          .status,
      ).toBe(403);
    });
  });

  describe("categorías", () => {
    it("crea, renombra y ordena; el orden se ve en la carta pública", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/carta/categorias", {
        nombre: "Bebidas",
      });
      expect(created.status).toBe(201);
      const bebidas = created.body.id as number;

      const duplicate = await call("ownerA", "POST", "/panel/prueba-a/carta/categorias", {
        nombre: "Bebidas",
      });
      expect(duplicate).toMatchObject({ status: 409, body: { reason: "duplicate_name" } });

      // Faltan ids: el orden debe incluir todas las categorías.
      expect(
        (await call("ownerA", "PUT", "/panel/prueba-a/carta/categorias/orden", { ids: [bebidas] }))
          .status,
      ).toBe(409);
      // Una categoría de otro restaurante tampoco vale.
      expect(
        (
          await call("ownerA", "PUT", "/panel/prueba-a/carta/categorias/orden", {
            ids: [bebidas, 2001],
          })
        ).status,
      ).toBe(409);
      const ordered = await call("ownerA", "PUT", "/panel/prueba-a/carta/categorias/orden", {
        ids: [bebidas, 1001],
      });
      expect(ordered.status).toBe(200);

      await call("ownerA", "POST", "/panel/prueba-a/carta/productos", {
        categoria_id: bebidas,
        nombre: "Agua",
        alergenos: [],
        variantes: [{ nombre: "50 cl", precio_centimos: 150 }],
      });
      const menu = await publicMenu("prueba-a");
      expect(menu.categories.map((category) => category.name)).toEqual(["Bebidas", "Salchipapas"]);
    });

    it("no borra una categoría con productos; sí una vacía", async () => {
      const blocked = await call("ownerA", "DELETE", "/panel/prueba-a/carta/categorias/1001");
      expect(blocked).toMatchObject({ status: 409, body: { reason: "category_has_items" } });
      const empty = await call("ownerA", "POST", "/panel/prueba-a/carta/categorias", {
        nombre: "Vacía",
      });
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/carta/categorias/${empty.body.id}`))
          .status,
      ).toBe(200);
    });

    it("un id de otro restaurante es inexistente", async () => {
      expect(
        (await call("ownerB", "PATCH", "/panel/prueba-b/carta/categorias/1001", { nombre: "X" }))
          .status,
      ).toBe(404);
      expect((await call("ownerB", "DELETE", "/panel/prueba-b/carta/categorias/1001")).status).toBe(
        404,
      );
    });
  });

  describe("productos y alérgenos", () => {
    it("crea un producto con variantes y alérgenos, y la web los muestra", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/carta/productos", {
        categoria_id: 1001,
        nombre: "Salchipapa especial",
        descripcion: "Con salsa de la casa",
        alergenos: ["lacteos", "gluten", "gluten"],
        variantes: [
          { nombre: "Pequeña", precio_centimos: 800 },
          { nombre: "Grande", precio_centimos: 1250, predeterminada: true },
        ],
      });
      expect(created.status).toBe(201);
      const itemId = created.body.id as number;

      const menu = await menuOf("ownerA", "prueba-a");
      const item = menu.productos.find((product) => product.id === itemId);
      // Sin repetidos y en el orden del reglamento.
      expect(item?.alergenos).toEqual(["gluten", "lacteos"]);
      expect(item?.variantes.map((variant) => [variant.nombre, variant.predeterminada])).toEqual([
        ["Pequeña", false],
        ["Grande", true],
      ]);

      const web = (await publicMenu("prueba-a")).categories
        .flatMap((category) => category.items)
        .find((product) => product.id === itemId);
      expect(web?.allergens).toEqual({ status: "declared", allergens: ["gluten", "lacteos"] });
      expect(web?.variants.map((variant) => variant.price)).toEqual([8, 12.5]);
      // Los productos sin dato siguen como «no informados».
      const old = (await publicMenu("prueba-a")).categories
        .flatMap((category) => category.items)
        .find((product) => product.id === 1101);
      expect(old?.allergens.status).toBe("not_declared");
    });

    it("rechaza alérgenos que no son de la UE, precios negativos y categorías ajenas", async () => {
      const base = { categoria_id: 1001, variantes: [{ nombre: "Única", precio_centimos: 500 }] };
      for (const body of [
        { ...base, nombre: "A", alergenos: ["picante"] },
        { ...base, nombre: "B", variantes: [{ nombre: "Única", precio_centimos: -1 }] },
        { ...base, nombre: "C", variantes: [] },
        { ...base, nombre: "D", categoria_id: 2001 },
        { ...base, nombre: "E", imagen_url: "javascript:alert(1)" },
      ]) {
        expect((await call("ownerA", "POST", "/panel/prueba-a/carta/productos", body)).status).toBe(
          400,
        );
      }
    });

    it("editar sin enviar los alérgenos los conserva; enviar null vuelve a «no informados»", async () => {
      await call("ownerA", "PATCH", "/panel/prueba-a/carta/productos/1101", {
        alergenos: ["huevos"],
      });
      await call("ownerA", "PATCH", "/panel/prueba-a/carta/productos/1101", {
        descripcion: "Plátano maduro",
      });
      let item = (await menuOf("ownerA", "prueba-a")).productos.find((p) => p.id === 1101);
      expect(item?.alergenos).toEqual(["huevos"]);

      await call("ownerA", "PATCH", "/panel/prueba-a/carta/productos/1101", { alergenos: null });
      item = (await menuOf("ownerA", "prueba-a")).productos.find((p) => p.id === 1101);
      expect(item?.alergenos).toBeNull();
    });

    it("ocultar un producto lo quita de la web; mostrarlo lo devuelve", async () => {
      const ids = async () =>
        (await publicMenu("prueba-a")).categories.flatMap((c) => c.items).map((i) => i.id);
      await call("ownerA", "PATCH", "/panel/prueba-a/carta/productos/1101", { activo: false });
      expect(await ids()).not.toContain(1101);
      await call("ownerA", "PATCH", "/panel/prueba-a/carta/productos/1101", { activo: true });
      expect(await ids()).toContain(1101);
    });

    it("ordena los productos de una categoría", async () => {
      const menu = await menuOf("ownerA", "prueba-a");
      const ids = menu.productos
        .filter((item) => item.categoria_id === 1001)
        .map((item) => item.id)
        .reverse();
      const result = await call(
        "ownerA",
        "PUT",
        "/panel/prueba-a/carta/categorias/1001/productos/orden",
        { ids },
      );
      expect(result.status).toBe(200);
      const after = (await menuOf("ownerA", "prueba-a")).productos
        .filter((item) => item.categoria_id === 1001)
        .map((item) => item.id);
      expect(after).toEqual(ids);
    });

    it("no edita ni borra productos de otro restaurante", async () => {
      expect(
        (await call("ownerB", "PATCH", "/panel/prueba-b/carta/productos/1101", { activo: false }))
          .status,
      ).toBe(404);
      expect((await call("ownerB", "DELETE", "/panel/prueba-b/carta/productos/1101")).status).toBe(
        404,
      );
      expect(
        (
          await call("ownerB", "PUT", "/panel/prueba-b/carta/productos/1101/disponibilidad", {
            sucursal_id: 2002,
            disponible: false,
          })
        ).status,
      ).toBe(404);
    });

    it("borra un producto con sus variantes y deja rastro en la auditoría", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/carta/productos", {
        categoria_id: 1001,
        nombre: "Temporal",
        variantes: [{ nombre: "Única", precio_centimos: 100 }],
      });
      const itemId = created.body.id as number;
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/carta/productos/${itemId}`)).status,
      ).toBe(200);
      const left = await ctx.sql`SELECT 1 FROM public.menu_variant WHERE menu_item_id = ${itemId}`;
      expect(left.length).toBe(0);
      const trail = await ctx.sql<{ accion: string }[]>`
        SELECT accion FROM public.auditoria
        WHERE  restaurante_id = 101 AND recurso_tipo = 'menu_item' AND recurso_id = ${String(itemId)}
        ORDER  BY id
      `;
      expect(trail.map((row) => row.accion)).toEqual([
        "menu.producto.crear",
        "menu.producto.borrar",
      ]);
    });
  });

  describe("variantes", () => {
    it("una sola predeterminada; no se borra la última; al borrar la predeterminada pasa a otra", async () => {
      const created = await call("ownerA", "POST", "/panel/prueba-a/carta/productos", {
        categoria_id: 1001,
        nombre: "Arepa",
        variantes: [{ nombre: "Sola", precio_centimos: 400 }],
      });
      const itemId = created.body.id as number;
      const variants = async () =>
        (await menuOf("ownerA", "prueba-a")).productos.find((p) => p.id === itemId)?.variantes ??
        [];
      const [only] = await variants();
      expect(only?.predeterminada).toBe(true);

      const last = await call("ownerA", "DELETE", `/panel/prueba-a/carta/variantes/${only?.id}`);
      expect(last).toMatchObject({ status: 409, body: { reason: "last_variant" } });

      const added = await call(
        "ownerA",
        "POST",
        `/panel/prueba-a/carta/productos/${itemId}/variantes`,
        {
          nombre: "Con queso",
          precio_centimos: 500,
          predeterminada: true,
        },
      );
      expect(added.status).toBe(201);
      expect((await variants()).map((v) => [v.nombre, v.predeterminada])).toEqual([
        ["Sola", false],
        ["Con queso", true],
      ]);

      await call("ownerA", "PATCH", `/panel/prueba-a/carta/variantes/${added.body.id}`, {
        precio_centimos: 550,
      });
      expect((await variants()).find((v) => v.id === added.body.id)?.precio_centimos).toBe(550);

      await call("ownerA", "DELETE", `/panel/prueba-a/carta/variantes/${added.body.id}`);
      expect((await variants()).map((v) => [v.nombre, v.predeterminada])).toEqual([["Sola", true]]);
    });

    it("no toca variantes de otro restaurante", async () => {
      expect(
        (
          await call("ownerB", "PATCH", "/panel/prueba-b/carta/variantes/1201", {
            precio_centimos: 1,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await call("ownerB", "POST", "/panel/prueba-b/carta/productos/1101/variantes", {
            nombre: "Intrusa",
            precio_centimos: 1,
          })
        ).status,
      ).toBe(404);
    });
  });

  describe("extras", () => {
    it("crea un extra con alérgenos y lo asocia a categorías del restaurante", async () => {
      const bad = await call("ownerA", "POST", "/panel/prueba-a/carta/extras", {
        nombre: "Pan sin gluten",
        precio_centimos: 100,
        categorias: [2001],
      });
      expect(bad.status).toBe(400);

      const created = await call("ownerA", "POST", "/panel/prueba-a/carta/extras", {
        nombre: "Pan sin gluten",
        precio_centimos: 100,
        alergenos: ["sesamo"],
        categorias: [1001],
      });
      expect(created.status).toBe(201);
      const web = (await publicMenu("prueba-a")).categories
        .flatMap((category) => category.items)
        .find((item) => item.id === 1101);
      expect(web?.extras.find((extra) => extra.name === "Pan sin gluten")?.allergens).toEqual({
        status: "declared",
        allergens: ["sesamo"],
      });

      await call("ownerA", "PATCH", `/panel/prueba-a/carta/extras/${created.body.id}`, {
        categorias: [],
      });
      const extra = (await menuOf("ownerA", "prueba-a")).extras.find(
        (item) => item.id === created.body.id,
      );
      expect(extra?.categorias).toEqual([]);
      expect(
        (await call("ownerA", "DELETE", `/panel/prueba-a/carta/extras/${created.body.id}`)).status,
      ).toBe(200);
    });

    it("no toca extras de otro restaurante", async () => {
      expect(
        (await call("ownerB", "PATCH", "/panel/prueba-b/carta/extras/1301", { activo: false }))
          .status,
      ).toBe(404);
      expect((await call("ownerB", "DELETE", "/panel/prueba-b/carta/extras/1301")).status).toBe(
        404,
      );
    });
  });

  describe("disponibilidad por local", () => {
    it("el propietario marca un producto como no disponible en un local", async () => {
      const result = await call(
        "ownerC",
        "PUT",
        "/panel/prueba-c/carta/productos/3201/disponibilidad",
        {
          sucursal_id: 3002,
          disponible: false,
        },
      );
      expect(result.status).toBe(200);
      const ids = async (local: number) =>
        (await publicMenu("prueba-c", local)).categories.flatMap((c) => c.items).map((i) => i.id);
      expect(await ids(3002)).not.toContain(3201);
      await call("ownerC", "PUT", "/panel/prueba-c/carta/productos/3201/disponibilidad", {
        sucursal_id: 3002,
        disponible: true,
      });
      expect(await ids(3002)).toContain(3201);
    });

    it("un encargado limitado a un local solo ve y cambia la disponibilidad de ese local", async () => {
      const menu = await menuOf("managerPlaya", "prueba-c");
      expect(menu.locales.map((local) => local.id)).toEqual([3002]);
      expect(menu.edicion_completa).toBe(false);
      expect(menu.productos.find((item) => item.id === 3202)?.no_disponible_en).toEqual([3002]);

      const own = await call(
        "managerPlaya",
        "PUT",
        "/panel/prueba-c/carta/productos/3202/disponibilidad",
        { sucursal_id: 3002, disponible: true },
      );
      expect(own.status).toBe(200);
      const centro = (await menuOf("ownerC", "prueba-c")).locales.find(
        (l) => l.nombre === "Centro",
      );
      const other = await call(
        "managerPlaya",
        "PUT",
        "/panel/prueba-c/carta/productos/3202/disponibilidad",
        { sucursal_id: centro?.id, disponible: false },
      );
      expect(other.status).toBe(404);

      // La carta es de todos los locales: no la cambia quien solo opera uno.
      const edit = await call("managerPlaya", "PATCH", "/panel/prueba-c/carta/productos/3202", {
        nombre: "Croquetas caseras",
      });
      expect(edit).toMatchObject({ status: 403, body: { reason: "branch_scope_limited" } });
    });

    it("el personal (sin menu.update) no cambia la disponibilidad", async () => {
      const result = await call(
        "cashierPlaya",
        "PUT",
        "/panel/prueba-c/carta/productos/3202/disponibilidad",
        { sucursal_id: 3002, disponible: false },
      );
      expect(result.status).toBe(403);
    });

    it("un local oculto (sin el módulo de varios locales) no se puede usar", async () => {
      const result = await call(
        "ownerB",
        "PUT",
        "/panel/prueba-b/carta/productos/2101/disponibilidad",
        {
          sucursal_id: 2002,
          disponible: false,
        },
      );
      expect(result.status).toBe(404);
    });
  });

  describe("fotos", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    async function upload(app: TestContext["app"], bytes: Uint8Array, user: User = "ownerA") {
      const form = new FormData();
      form.append("foto", new File([bytes], "foto.png", { type: "image/png" }));
      const response = await app.request("/panel/prueba-a/carta/productos/1101/foto", {
        method: "POST",
        headers: auth(user),
        body: form,
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    }

    it("sin almacén configurado responde 503 y el panel lo sabe", async () => {
      expect((await upload(ctx.app, png)).status).toBe(503);
    });

    it("sube la foto a la carpeta del restaurante y guarda la URL", async () => {
      const uploads: { path: string; contentType: string }[] = [];
      const app = ctx.appWith({
        imageStorage: {
          upload: async (path, _bytes, contentType) => {
            uploads.push({ path, contentType });
            return `https://cdn.test/${path}`;
          },
        },
      });
      const result = await upload(app, png);
      expect(result.status).toBe(200);
      expect(uploads[0]?.path).toMatch(/^101\/1101-[0-9a-f-]+\.png$/);
      expect(uploads[0]?.contentType).toBe("image/png");
      const [row] = await ctx.sql<{ image_url: string }[]>`
        SELECT image_url FROM public.menu_item WHERE menu_item_id = 1101
      `;
      expect(row?.image_url).toBe(result.body.imagen_url);

      // Un archivo que no es imagen se rechaza aunque diga ser PNG.
      expect((await upload(app, new TextEncoder().encode("<svg/>"))).status).toBe(415);
      // Quien no puede editar la carta no sube fotos.
      expect((await upload(app, png, "viewerA")).status).toBe(403);
    });
  });
});
