import { ALL_BRANCHES, canAccessBranch, PERMISSION } from "@konnecttia/access";
import { ALLERGENS } from "@konnecttia/domain";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { TransactionSql } from "postgres";
import { z } from "zod";
import type { AppDeps, AppEnv } from "../context";
import { UNIQUE_VIOLATION } from "../lib/db";
import { API_ERROR, fail } from "../lib/http";
import { requirePermission } from "../middleware/auth";
import { audit } from "../repositories/access";
import { loadBranches } from "../repositories/branches";
import {
  allergensForStorage,
  categoriesOf,
  centsToPrice,
  detectImageType,
  existsInRestaurant,
  loadAdminMenu,
  MENU_ENTITY,
  sameIdSet,
} from "../repositories/menu-admin";

/**
 * Carta desde el panel. Reglas:
 * - menu.view para leer; menu.create / menu.update / menu.delete para cambiar.
 * - La carta es del restaurante: solo quien tiene alcance sobre TODOS los locales puede cambiarla.
 *   Quien está limitado a unos locales solo marca la disponibilidad en esos locales.
 * - Todo cambio deja rastro en auditoria.
 */

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Precio máximo admitido para un producto, variante o extra (céntimos). */
const MAX_PRICE_CENTS = 100_000;

const id = z.number().int().positive();
const name = (max: number) => z.string().trim().min(1).max(max);
const priceCents = z.number().int().min(0).max(MAX_PRICE_CENTS);
const allergens = z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).nullable();
const idList = z.array(id).max(500);
const imageUrl = z
  .string()
  .trim()
  .max(1000)
  .url()
  .refine((value) => value.startsWith("https://"), "https")
  .nullable();

const categoryCreate = z.object({ nombre: name(100), activa: z.boolean().default(true) });
const categoryUpdate = z
  .object({ nombre: name(100), activa: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const variantInput = z.object({
  nombre: name(80),
  precio_centimos: priceCents,
  predeterminada: z.boolean().default(false),
  activa: z.boolean().default(true),
});
const variantUpdate = z
  .object({
    nombre: name(80),
    precio_centimos: priceCents,
    predeterminada: z.boolean(),
    activa: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const itemCreate = z.object({
  categoria_id: id,
  nombre: name(150),
  descripcion: z.string().trim().max(500).nullable().default(null),
  activo: z.boolean().default(true),
  alergenos: allergens.default(null),
  imagen_url: imageUrl.default(null),
  variantes: z.array(variantInput).min(1).max(20),
});
const itemUpdate = z
  .object({
    categoria_id: id,
    nombre: name(150),
    descripcion: z.string().trim().max(500).nullable(),
    activo: z.boolean(),
    alergenos: allergens,
    imagen_url: imageUrl,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const extraCreate = z.object({
  nombre: name(120),
  precio_centimos: priceCents,
  activo: z.boolean().default(true),
  alergenos: allergens.default(null),
  categorias: idList.default([]),
});
const extraUpdate = z
  .object({
    nombre: name(120),
    precio_centimos: priceCents,
    activo: z.boolean(),
    alergenos: allergens,
    categorias: idList,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0);

const orderBody = z.object({ ids: idList.min(1) });
const availabilityBody = z.object({ sucursal_id: id, disponible: z.boolean() });

type Ctx = Context<AppEnv>;

async function parse<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

function invalid(c: Ctx, field?: string) {
  return fail(c, 400, API_ERROR.InvalidBody, field ? { field } : {});
}

function paramId(c: Ctx, key = "id"): number | null {
  const value = Number(c.req.param(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}

export function registerMenuRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const { sql } = deps;

  const record = (
    c: Ctx,
    accion: string,
    recursoTipo: string,
    recursoId: number | null,
    detalle: Record<string, unknown> = {},
    resultado: "ok" | "denegado" = "ok",
  ) =>
    audit(sql, {
      restauranteId: c.get("restaurant").id,
      actorTipo: "usuario",
      actorId: c.get("user").userId,
      accion,
      recursoTipo,
      recursoId: recursoId === null ? null : String(recursoId),
      resultado,
      detalle,
      requestId: c.get("requestId"),
    });

  /** La carta es común a todos los locales: cambiarla exige alcance sobre todos. */
  const requireAllBranches = async (c: Ctx, accion: string) => {
    if (c.get("access").branchScope === ALL_BRANCHES) return null;
    await record(c, accion, "carta", null, { motivo: "branch_scope_limited" }, "denegado");
    return fail(c, 403, API_ERROR.Forbidden, { reason: "branch_scope_limited" });
  };

  const notFound = (c: Ctx) => fail(c, 404, API_ERROR.NotFound);
  const conflict = (c: Ctx, reason: string) => fail(c, 409, API_ERROR.Conflict, { reason });

  /** Locales visibles para el usuario (respeta el módulo de varios locales y su alcance). */
  const visibleBranches = async (c: Ctx) => {
    const branches = await loadBranches(sql, c.get("restaurant").id);
    return branches.filter((branch) => canAccessBranch(c.get("access"), branch.id));
  };

  // ---------------------------------------------------------------------------------- lectura

  app.get("/:slug/carta", requirePermission(deps, PERMISSION.MenuView), async (c) => {
    const branches = await visibleBranches(c);
    const menu = await loadAdminMenu(
      sql,
      c.get("restaurant").id,
      branches.map((branch) => branch.id),
    );
    return c.json({
      ...menu,
      locales: branches.map((branch) => ({
        id: branch.id,
        nombre: branch.name,
        activo: branch.active,
      })),
      // El panel ofrece subir fotos solo si hay almacén configurado.
      subida_fotos: Boolean(deps.imageStorage),
      edicion_completa: c.get("access").branchScope === ALL_BRANCHES,
    });
  });

  // ------------------------------------------------------------------------------- categorías

  app.post("/:slug/carta/categorias", requirePermission(deps, PERMISSION.MenuCreate), async (c) => {
    const denied = await requireAllBranches(c, PERMISSION.MenuCreate);
    if (denied) return denied;
    const body = await parse(c, categoryCreate);
    if (!body) return invalid(c);
    const restauranteId = c.get("restaurant").id;
    try {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO public.menu_category (name, is_active, sort_order, restaurante_id)
        SELECT ${body.nombre}, ${body.activa},
               COALESCE(max(sort_order), 0) + 1, ${restauranteId}
        FROM   public.menu_category WHERE restaurante_id = ${restauranteId}
        RETURNING menu_category_id AS id
      `;
      await record(c, "menu.categoria.crear", MENU_ENTITY.Category, row?.id ?? null, body);
      return c.json({ id: row?.id }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
      throw error;
    }
  });

  app.patch(
    "/:slug/carta/categorias/:id",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const categoryId = paramId(c);
      const body = await parse(c, categoryUpdate);
      if (!categoryId || !body) return invalid(c);
      try {
        const updated = await sql`
          UPDATE public.menu_category
          SET    name       = COALESCE(${body.nombre ?? null}, name),
                 is_active  = COALESCE(${body.activa ?? null}::boolean, is_active),
                 updated_at = now()
          WHERE  menu_category_id = ${categoryId} AND restaurante_id = ${c.get("restaurant").id}
        `;
        if (updated.count === 0) return notFound(c);
      } catch (error) {
        if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
        throw error;
      }
      await record(c, "menu.categoria.editar", MENU_ENTITY.Category, categoryId, body);
      return c.json({ id: categoryId });
    },
  );

  app.delete(
    "/:slug/carta/categorias/:id",
    requirePermission(deps, PERMISSION.MenuDelete),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuDelete);
      if (denied) return denied;
      const categoryId = paramId(c);
      if (!categoryId) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      const result = await sql.begin(async (tx) => {
        const rows = await tx<{ productos: number }[]>`
          SELECT (SELECT count(*)::int FROM public.menu_item mi
                  WHERE mi.menu_category_id = mc.menu_category_id) AS productos
          FROM   public.menu_category mc
          WHERE  mc.menu_category_id = ${categoryId} AND mc.restaurante_id = ${restauranteId}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) return "not_found" as const;
        // Borrar una categoría con productos dejaría productos huérfanos: primero se mueven o borran.
        if (row.productos > 0) return "has_items" as const;
        await tx`
          DELETE FROM public.menu_category
          WHERE  menu_category_id = ${categoryId} AND restaurante_id = ${restauranteId}
        `;
        return "deleted" as const;
      });
      if (result === "not_found") return notFound(c);
      if (result === "has_items") return conflict(c, "category_has_items");
      await record(c, "menu.categoria.borrar", MENU_ENTITY.Category, categoryId);
      return c.json({ id: categoryId });
    },
  );

  app.put(
    "/:slug/carta/categorias/orden",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const body = await parse(c, orderBody);
      if (!body) return invalid(c, "ids");
      const restauranteId = c.get("restaurant").id;
      const ok = await sql.begin(async (tx) => {
        const rows = await tx<{ id: number }[]>`
          SELECT menu_category_id AS id FROM public.menu_category
          WHERE  restaurante_id = ${restauranteId} FOR UPDATE
        `;
        if (
          !sameIdSet(
            rows.map((row) => row.id),
            body.ids,
          )
        )
          return false;
        await reorder(tx, "menu_category", body.ids, restauranteId);
        return true;
      });
      if (!ok) return conflict(c, "order_mismatch");
      await record(c, "menu.categoria.ordenar", MENU_ENTITY.Category, null, { ids: body.ids });
      return c.json({ ids: body.ids });
    },
  );

  app.put(
    "/:slug/carta/categorias/:id/productos/orden",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const categoryId = paramId(c);
      const body = await parse(c, orderBody);
      if (!categoryId || !body) return invalid(c, "ids");
      const restauranteId = c.get("restaurant").id;
      const ok = await sql.begin(async (tx) => {
        const rows = await tx<{ id: number }[]>`
          SELECT menu_item_id AS id FROM public.menu_item
          WHERE  restaurante_id = ${restauranteId} AND menu_category_id = ${categoryId}
          FOR UPDATE
        `;
        if (
          rows.length === 0 ||
          !sameIdSet(
            rows.map((row) => row.id),
            body.ids,
          )
        )
          return false;
        await reorder(tx, "menu_item", body.ids, restauranteId);
        return true;
      });
      if (!ok) return conflict(c, "order_mismatch");
      await record(c, "menu.producto.ordenar", MENU_ENTITY.Category, categoryId, { ids: body.ids });
      return c.json({ ids: body.ids });
    },
  );

  // -------------------------------------------------------------------------------- productos

  app.post("/:slug/carta/productos", requirePermission(deps, PERMISSION.MenuCreate), async (c) => {
    const denied = await requireAllBranches(c, PERMISSION.MenuCreate);
    if (denied) return denied;
    const body = await parse(c, itemCreate);
    if (!body) return invalid(c);
    const restauranteId = c.get("restaurant").id;
    if (!(await existsInRestaurant(sql, MENU_ENTITY.Category, body.categoria_id, restauranteId))) {
      return invalid(c, "categoria_id");
    }
    const names = body.variantes.map((variant) => variant.nombre.toLocaleLowerCase("es"));
    if (new Set(names).size !== names.length) return conflict(c, "duplicate_variant_name");
    // Una sola predeterminada: la primera marcada o, si ninguna, la primera.
    const defaultIndex = Math.max(
      0,
      body.variantes.findIndex((variant) => variant.predeterminada),
    );
    try {
      const itemId = await sql.begin(async (tx) => {
        const [item] = await tx<{ id: number }[]>`
          INSERT INTO public.menu_item
            (menu_category_id, name, description, is_active, alergenos, image_url, sort_order,
             base_price, restaurante_id)
          SELECT ${body.categoria_id}, ${body.nombre}, ${body.descripcion}, ${body.activo},
                 ${allergensForStorage(body.alergenos)}::text[], ${body.imagen_url},
                 COALESCE(max(sort_order), 0) + 1,
                 ${centsToPrice(body.variantes[defaultIndex]?.precio_centimos ?? 0)},
                 ${restauranteId}
          FROM   public.menu_item
          WHERE  restaurante_id = ${restauranteId} AND menu_category_id = ${body.categoria_id}
          RETURNING menu_item_id AS id
        `;
        if (!item) throw new Error("No se pudo crear el producto");
        for (const [index, variant] of body.variantes.entries()) {
          await tx`
            INSERT INTO public.menu_variant
              (menu_item_id, variant_name, price, is_default, is_active, sort_order, restaurante_id)
            VALUES (${item.id}, ${variant.nombre}, ${centsToPrice(variant.precio_centimos)},
                    ${index === defaultIndex}, ${variant.activa}, ${index + 1}, ${restauranteId})
          `;
        }
        return item.id;
      });
      await record(c, "menu.producto.crear", MENU_ENTITY.Item, itemId, {
        nombre: body.nombre,
        categoria_id: body.categoria_id,
        variantes: body.variantes.length,
      });
      return c.json({ id: itemId }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
      throw error;
    }
  });

  app.patch(
    "/:slug/carta/productos/:id",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const itemId = paramId(c);
      const body = await parse(c, itemUpdate);
      if (!itemId || !body) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      if (
        body.categoria_id !== undefined &&
        !(await existsInRestaurant(sql, MENU_ENTITY.Category, body.categoria_id, restauranteId))
      ) {
        return invalid(c, "categoria_id");
      }
      // Los campos que admiten null (alérgenos, descripción, foto) solo cambian si vienen.
      const has = (key: keyof typeof body) => Object.hasOwn(body, key);
      try {
        const updated = await sql`
          UPDATE public.menu_item
          SET    menu_category_id = COALESCE(${body.categoria_id ?? null}::bigint, menu_category_id),
                 name             = COALESCE(${body.nombre ?? null}, name),
                 is_active        = COALESCE(${body.activo ?? null}::boolean, is_active),
                 description      = CASE WHEN ${has("descripcion")} THEN ${body.descripcion ?? null} ELSE description END,
                 alergenos        = CASE WHEN ${has("alergenos")}
                                         THEN ${allergensForStorage(body.alergenos ?? null)}::text[]
                                         ELSE alergenos END,
                 image_url        = CASE WHEN ${has("imagen_url")} THEN ${body.imagen_url ?? null} ELSE image_url END,
                 updated_at       = now()
          WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
        `;
        if (updated.count === 0) return notFound(c);
      } catch (error) {
        if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
        throw error;
      }
      await record(c, "menu.producto.editar", MENU_ENTITY.Item, itemId, body);
      return c.json({ id: itemId });
    },
  );

  app.delete(
    "/:slug/carta/productos/:id",
    requirePermission(deps, PERMISSION.MenuDelete),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuDelete);
      if (denied) return denied;
      const itemId = paramId(c);
      if (!itemId) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      // Los pedidos guardan una copia (items JSON), así que borrar no altera el historial.
      const deleted = await sql.begin(async (tx) => {
        const rows = await tx<{ name: string }[]>`
          SELECT name FROM public.menu_item
          WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
          FOR UPDATE
        `;
        if (!rows[0]) return null;
        await tx`DELETE FROM public.menu_item_extra WHERE menu_item_id = ${itemId}`;
        await tx`
          DELETE FROM public.menu_variant
          WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
        `;
        await tx`
          DELETE FROM public.menu_item
          WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
        `;
        return rows[0].name;
      });
      if (deleted === null) return notFound(c);
      await record(c, "menu.producto.borrar", MENU_ENTITY.Item, itemId, { nombre: deleted });
      return c.json({ id: itemId });
    },
  );

  /** Disponible o no en un local (agotado, o no se sirve allí). */
  app.put(
    "/:slug/carta/productos/:id/disponibilidad",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const itemId = paramId(c);
      const body = await parse(c, availabilityBody);
      if (!itemId || !body) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      const branches = await visibleBranches(c);
      if (!branches.some((branch) => branch.id === body.sucursal_id)) {
        await record(
          c,
          "menu.producto.disponibilidad",
          MENU_ENTITY.Item,
          itemId,
          { sucursal_id: body.sucursal_id, motivo: "branch_out_of_scope" },
          "denegado",
        );
        return fail(c, 404, API_ERROR.BranchNotAvailable);
      }
      if (!(await existsInRestaurant(sql, MENU_ENTITY.Item, itemId, restauranteId))) {
        return notFound(c);
      }
      if (body.disponible) {
        await sql`
          DELETE FROM public.sucursal_item_no_disponible
          WHERE  sucursal_id = ${body.sucursal_id} AND menu_item_id = ${itemId}
        `;
      } else {
        await sql`
          INSERT INTO public.sucursal_item_no_disponible (sucursal_id, menu_item_id)
          VALUES (${body.sucursal_id}, ${itemId})
          ON CONFLICT DO NOTHING
        `;
      }
      await record(c, "menu.producto.disponibilidad", MENU_ENTITY.Item, itemId, body);
      return c.json({ id: itemId, ...body });
    },
  );

  app.post(
    "/:slug/carta/productos/:id/foto",
    requirePermission(deps, PERMISSION.MenuUpdate),
    bodyLimit({
      maxSize: MAX_IMAGE_BYTES + 64 * 1024,
      onError: (c) => fail(c, 413, API_ERROR.InvalidImage, { reason: "too_large" }),
    }),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const itemId = paramId(c);
      if (!itemId) return invalid(c);
      const storage = deps.imageStorage;
      if (!storage) return fail(c, 503, API_ERROR.StorageNotConfigured);
      const restauranteId = c.get("restaurant").id;
      if (!(await existsInRestaurant(sql, MENU_ENTITY.Item, itemId, restauranteId))) {
        return notFound(c);
      }
      const form = await c.req.parseBody().catch(() => null);
      const file = form?.foto;
      if (!(file instanceof File)) return invalid(c, "foto");
      if (file.size > MAX_IMAGE_BYTES) {
        return fail(c, 413, API_ERROR.InvalidImage, { reason: "too_large" });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const type = detectImageType(bytes);
      if (!type) return fail(c, 415, API_ERROR.InvalidImage, { reason: "unsupported_type" });
      const path = `${restauranteId}/${itemId}-${crypto.randomUUID()}.${type.ext}`;
      const url = await storage.upload(path, bytes, type.mime);
      await sql`
        UPDATE public.menu_item SET image_url = ${url}, updated_at = now()
        WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
      `;
      await record(c, "menu.producto.foto", MENU_ENTITY.Item, itemId, { ruta: path });
      return c.json({ id: itemId, imagen_url: url });
    },
  );

  // -------------------------------------------------------------------------------- variantes

  app.post(
    "/:slug/carta/productos/:id/variantes",
    requirePermission(deps, PERMISSION.MenuCreate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuCreate);
      if (denied) return denied;
      const itemId = paramId(c);
      const body = await parse(c, variantInput);
      if (!itemId || !body) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      try {
        const variantId = await sql.begin(async (tx) => {
          const items = await tx`
            SELECT 1 FROM public.menu_item
            WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
            FOR UPDATE
          `;
          if (items.length === 0) return null;
          if (body.predeterminada) {
            await tx`UPDATE public.menu_variant SET is_default = false WHERE menu_item_id = ${itemId}`;
          }
          const [row] = await tx<{ id: number }[]>`
            INSERT INTO public.menu_variant
              (menu_item_id, variant_name, price, is_default, is_active, sort_order, restaurante_id)
            SELECT ${itemId}, ${body.nombre}, ${centsToPrice(body.precio_centimos)},
                   ${body.predeterminada}, ${body.activa}, COALESCE(max(sort_order), 0) + 1,
                   ${restauranteId}
            FROM   public.menu_variant WHERE menu_item_id = ${itemId}
            RETURNING menu_variant_id AS id
          `;
          return row?.id ?? null;
        });
        if (variantId === null) return notFound(c);
        await record(c, "menu.variante.crear", MENU_ENTITY.Variant, variantId, {
          producto_id: itemId,
          ...body,
        });
        return c.json({ id: variantId }, 201);
      } catch (error) {
        if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
        throw error;
      }
    },
  );

  app.patch(
    "/:slug/carta/variantes/:id",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const variantId = paramId(c);
      const body = await parse(c, variantUpdate);
      if (!variantId || !body) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      try {
        const found = await sql.begin(async (tx) => {
          const rows = await tx<{ menu_item_id: number }[]>`
            SELECT menu_item_id FROM public.menu_variant
            WHERE  menu_variant_id = ${variantId} AND restaurante_id = ${restauranteId}
            FOR UPDATE
          `;
          const row = rows[0];
          if (!row) return false;
          if (body.predeterminada === true) {
            await tx`
              UPDATE public.menu_variant SET is_default = false
              WHERE  menu_item_id = ${row.menu_item_id} AND menu_variant_id <> ${variantId}
            `;
          }
          await tx`
            UPDATE public.menu_variant
            SET    variant_name = COALESCE(${body.nombre ?? null}, variant_name),
                   price        = COALESCE(${body.precio_centimos === undefined ? null : centsToPrice(body.precio_centimos)}::numeric, price),
                   is_default   = COALESCE(${body.predeterminada ?? null}::boolean, is_default),
                   is_active    = COALESCE(${body.activa ?? null}::boolean, is_active),
                   updated_at   = now()
            WHERE  menu_variant_id = ${variantId} AND restaurante_id = ${restauranteId}
          `;
          return true;
        });
        if (!found) return notFound(c);
      } catch (error) {
        if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
        throw error;
      }
      await record(c, "menu.variante.editar", MENU_ENTITY.Variant, variantId, body);
      return c.json({ id: variantId });
    },
  );

  app.delete(
    "/:slug/carta/variantes/:id",
    requirePermission(deps, PERMISSION.MenuDelete),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuDelete);
      if (denied) return denied;
      const variantId = paramId(c);
      if (!variantId) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      const result = await sql.begin(async (tx) => {
        const rows = await tx<{ menu_item_id: number; is_default: boolean }[]>`
          SELECT menu_item_id, is_default FROM public.menu_variant
          WHERE  menu_variant_id = ${variantId} AND restaurante_id = ${restauranteId}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) return "not_found" as const;
        const [siblings] = await tx<{ total: number }[]>`
          SELECT count(*)::int AS total FROM public.menu_variant
          WHERE  menu_item_id = ${row.menu_item_id}
        `;
        // Un producto sin variantes no tiene precio: se oculta el producto en su lugar.
        if ((siblings?.total ?? 0) <= 1) return "last_variant" as const;
        await tx`DELETE FROM public.menu_variant WHERE menu_variant_id = ${variantId}`;
        if (row.is_default) {
          await tx`
            UPDATE public.menu_variant SET is_default = true
            WHERE  menu_variant_id = (
              SELECT menu_variant_id FROM public.menu_variant
              WHERE  menu_item_id = ${row.menu_item_id}
              ORDER  BY sort_order, price, menu_variant_id LIMIT 1)
          `;
        }
        return "deleted" as const;
      });
      if (result === "not_found") return notFound(c);
      if (result === "last_variant") return conflict(c, "last_variant");
      await record(c, "menu.variante.borrar", MENU_ENTITY.Variant, variantId);
      return c.json({ id: variantId });
    },
  );

  app.put(
    "/:slug/carta/productos/:id/variantes/orden",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const itemId = paramId(c);
      const body = await parse(c, orderBody);
      if (!itemId || !body) return invalid(c, "ids");
      const restauranteId = c.get("restaurant").id;
      const ok = await sql.begin(async (tx) => {
        const rows = await tx<{ id: number }[]>`
          SELECT menu_variant_id AS id FROM public.menu_variant
          WHERE  menu_item_id = ${itemId} AND restaurante_id = ${restauranteId}
          FOR UPDATE
        `;
        if (
          rows.length === 0 ||
          !sameIdSet(
            rows.map((row) => row.id),
            body.ids,
          )
        )
          return false;
        await reorder(tx, "menu_variant", body.ids, restauranteId);
        return true;
      });
      if (!ok) return conflict(c, "order_mismatch");
      await record(c, "menu.variante.ordenar", MENU_ENTITY.Item, itemId, { ids: body.ids });
      return c.json({ ids: body.ids });
    },
  );

  // ----------------------------------------------------------------------------------- extras

  const linkCategories = async (tx: Tx, extraId: number, categoryIds: readonly number[]) => {
    await tx`DELETE FROM public.menu_category_extra WHERE extra_id = ${extraId}`;
    for (const categoryId of categoryIds) {
      await tx`
        INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
        VALUES (${categoryId}, ${extraId}) ON CONFLICT DO NOTHING
      `;
    }
  };

  const validCategories = async (c: Ctx, ids: readonly number[] | undefined) => {
    if (ids === undefined) return true;
    const unique = [...new Set(ids)];
    const found = await categoriesOf(sql, c.get("restaurant").id, unique);
    return found.length === unique.length;
  };

  app.post("/:slug/carta/extras", requirePermission(deps, PERMISSION.MenuCreate), async (c) => {
    const denied = await requireAllBranches(c, PERMISSION.MenuCreate);
    if (denied) return denied;
    const body = await parse(c, extraCreate);
    if (!body) return invalid(c);
    if (!(await validCategories(c, body.categorias))) return invalid(c, "categorias");
    const restauranteId = c.get("restaurant").id;
    try {
      const extraId = await sql.begin(async (tx) => {
        const [row] = await tx<{ id: number }[]>`
          INSERT INTO public.extra (name, price, is_active, alergenos, sort_order, restaurante_id)
          SELECT ${body.nombre}, ${centsToPrice(body.precio_centimos)}, ${body.activo},
                 ${allergensForStorage(body.alergenos)}::text[], COALESCE(max(sort_order), 0) + 1,
                 ${restauranteId}
          FROM   public.extra WHERE restaurante_id = ${restauranteId}
          RETURNING extra_id AS id
        `;
        if (!row) throw new Error("No se pudo crear el extra");
        await linkCategories(tx, row.id, [...new Set(body.categorias)]);
        return row.id;
      });
      await record(c, "menu.extra.crear", MENU_ENTITY.Extra, extraId, body);
      return c.json({ id: extraId }, 201);
    } catch (error) {
      if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
      throw error;
    }
  });

  app.patch(
    "/:slug/carta/extras/:id",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const extraId = paramId(c);
      const body = await parse(c, extraUpdate);
      if (!extraId || !body) return invalid(c);
      if (!(await validCategories(c, body.categorias))) return invalid(c, "categorias");
      const restauranteId = c.get("restaurant").id;
      const has = (key: keyof typeof body) => Object.hasOwn(body, key);
      try {
        const found = await sql.begin(async (tx) => {
          const updated = await tx`
          UPDATE public.extra
          SET    name       = COALESCE(${body.nombre ?? null}, name),
                 price      = COALESCE(${body.precio_centimos === undefined ? null : centsToPrice(body.precio_centimos)}::numeric, price),
                 is_active  = COALESCE(${body.activo ?? null}::boolean, is_active),
                 alergenos  = CASE WHEN ${has("alergenos")}
                                   THEN ${allergensForStorage(body.alergenos ?? null)}::text[]
                                   ELSE alergenos END,
                 updated_at = now()
          WHERE  extra_id = ${extraId} AND restaurante_id = ${restauranteId}
        `;
          if (updated.count === 0) return false;
          if (body.categorias !== undefined) {
            await linkCategories(tx, extraId, [...new Set(body.categorias)]);
          }
          return true;
        });
        if (!found) return notFound(c);
      } catch (error) {
        if (isUniqueViolation(error)) return conflict(c, "duplicate_name");
        throw error;
      }
      await record(c, "menu.extra.editar", MENU_ENTITY.Extra, extraId, body);
      return c.json({ id: extraId });
    },
  );

  app.delete(
    "/:slug/carta/extras/:id",
    requirePermission(deps, PERMISSION.MenuDelete),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuDelete);
      if (denied) return denied;
      const extraId = paramId(c);
      if (!extraId) return invalid(c);
      const restauranteId = c.get("restaurant").id;
      const deleted = await sql.begin(async (tx) => {
        const rows = await tx<{ name: string }[]>`
          SELECT name FROM public.extra
          WHERE  extra_id = ${extraId} AND restaurante_id = ${restauranteId}
          FOR UPDATE
        `;
        if (!rows[0]) return null;
        // menu_item_extra (modelo antiguo) no borra en cascada.
        await tx`DELETE FROM public.menu_item_extra WHERE extra_id = ${extraId}`;
        await tx`DELETE FROM public.extra WHERE extra_id = ${extraId} AND restaurante_id = ${restauranteId}`;
        return rows[0].name;
      });
      if (deleted === null) return notFound(c);
      await record(c, "menu.extra.borrar", MENU_ENTITY.Extra, extraId, { nombre: deleted });
      return c.json({ id: extraId });
    },
  );

  app.put(
    "/:slug/carta/extras/orden",
    requirePermission(deps, PERMISSION.MenuUpdate),
    async (c) => {
      const denied = await requireAllBranches(c, PERMISSION.MenuUpdate);
      if (denied) return denied;
      const body = await parse(c, orderBody);
      if (!body) return invalid(c, "ids");
      const restauranteId = c.get("restaurant").id;
      const ok = await sql.begin(async (tx) => {
        const rows = await tx<{ id: number }[]>`
        SELECT extra_id AS id FROM public.extra WHERE restaurante_id = ${restauranteId} FOR UPDATE
      `;
        if (
          !sameIdSet(
            rows.map((row) => row.id),
            body.ids,
          )
        )
          return false;
        await reorder(tx, "extra", body.ids, restauranteId);
        return true;
      });
      if (!ok) return conflict(c, "order_mismatch");
      await record(c, "menu.extra.ordenar", MENU_ENTITY.Extra, null, { ids: body.ids });
      return c.json({ ids: body.ids });
    },
  );
}

type Tx = TransactionSql<{ bigint: number }>;

const ORDERABLE = {
  menu_category: "menu_category_id",
  menu_item: "menu_item_id",
  menu_variant: "menu_variant_id",
  extra: "extra_id",
} as const;

/** Guarda el orden recibido (1, 2, 3…) en una sola sentencia. */
async function reorder(
  tx: Tx,
  table: keyof typeof ORDERABLE,
  ids: readonly number[],
  restauranteId: number,
) {
  const key: string = ORDERABLE[table];
  const positions = ids.map((_, index) => index + 1);
  await tx`
    UPDATE ${tx(`public.${table}`)} AS t
    SET    sort_order = v.pos, updated_at = now()
    FROM   unnest(${[...ids]}::bigint[], ${positions}::int[]) AS v(id, pos)
    WHERE  t.${tx(key)} = v.id AND t.restaurante_id = ${restauranteId}
  `;
}
