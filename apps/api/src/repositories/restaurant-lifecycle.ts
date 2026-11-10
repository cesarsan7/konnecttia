import type { TransactionSql } from "postgres";
import type { AppDeps } from "../context";
import { DELIVERY_PHOTO_PREFIX } from "./delivery-photos";
import { CONFIG_KEY } from "./restaurants";

type Tx = TransactionSql;

/** Qué se copia de un restaurante al crear otro «a partir de» él. */
export type CloneParts = {
  readonly carta: boolean;
  readonly horario: boolean;
  readonly reparto: boolean;
  readonly ajustes: boolean;
};

/**
 * Claves de `restaurante_config` que se copian con «ajustes»: tiempos, cola, modo ocupado,
 * suplementos y límites de uso. NO se copian webhooks, antifraude, privacidad ni apertura manual:
 * son del restaurante original (o llevan URLs/claves suyas).
 */
const CLONED_CONFIG_KEYS: readonly string[] = [
  CONFIG_KEY.PickupEtaText,
  CONFIG_KEY.PickupEtaMinutes,
  CONFIG_KEY.DeliveryEtaText,
  CONFIG_KEY.DeliveryEtaMin,
  CONFIG_KEY.DeliveryEtaMax,
  CONFIG_KEY.QueueMinutesPerOrder,
  CONFIG_KEY.QueueFreeOrders,
  CONFIG_KEY.BusyModeOptions,
  CONFIG_KEY.BusyModeDuration,
  CONFIG_KEY.SurchargeRules,
  CONFIG_KEY.LookupOrdersLimit,
  CONFIG_KEY.TableWaitAlert,
  CONFIG_KEY.TableStayAlert,
  CONFIG_KEY.ProofsMaxPerOrder,
  CONFIG_KEY.DeliveryPhoto,
];

export async function restaurantExists(tx: Tx | import("../lib/db").Sql, id: number) {
  const rows = await tx`SELECT 1 FROM public.restaurante WHERE id = ${id}`;
  return rows.length > 0;
}

/**
 * Copia datos de `sourceId` al restaurante recién creado `targetId` (misma transacción que su
 * alta). Nunca copia datos propios del negocio: nombre, enlace, teléfono, dirección, ubicación,
 * datos bancarios, logo, redes, equipo, pedidos ni clientes. Las imágenes de los productos se
 * comparten por URL (no se duplican los archivos).
 */
export async function cloneRestaurantData(
  tx: Tx,
  sourceId: number,
  targetId: number,
  targetBranchId: number,
  parts: CloneParts,
): Promise<{ categorias: number; productos: number; extras: number; zonas: number }> {
  const summary = { categorias: 0, productos: 0, extras: 0, zonas: 0 };

  if (parts.carta) {
    const categoryMap = new Map<number, number>();
    const categories = await tx<
      { menu_category_id: string; name: string; sort_order: number; is_active: boolean }[]
    >`
      SELECT menu_category_id, name, sort_order, is_active
      FROM public.menu_category WHERE restaurante_id = ${sourceId} ORDER BY menu_category_id
    `;
    for (const category of categories) {
      const [created] = await tx<{ menu_category_id: string }[]>`
        INSERT INTO public.menu_category (name, sort_order, is_active, restaurante_id)
        VALUES (${category.name}, ${category.sort_order}, ${category.is_active}, ${targetId})
        RETURNING menu_category_id
      `;
      if (created)
        categoryMap.set(Number(category.menu_category_id), Number(created.menu_category_id));
    }
    summary.categorias = categoryMap.size;

    const items = await tx<
      {
        menu_item_id: string;
        menu_category_id: string;
        name: string;
        description: string | null;
        is_pizza: boolean;
        is_active: boolean;
        tags: string | null;
        image_url: string | null;
        base_price: string | null;
        sort_order: number;
        alergenos: string[] | null;
      }[]
    >`
      SELECT menu_item_id, menu_category_id, name, description, is_pizza, is_active, tags,
             image_url, base_price, sort_order, alergenos
      FROM   public.menu_item WHERE restaurante_id = ${sourceId} ORDER BY menu_item_id
    `;
    for (const item of items) {
      const category = categoryMap.get(Number(item.menu_category_id));
      if (category === undefined) continue;
      const [created] = await tx<{ menu_item_id: string }[]>`
        INSERT INTO public.menu_item
          (menu_category_id, name, description, is_pizza, is_active, tags, image_url, base_price,
           sort_order, alergenos, restaurante_id)
        VALUES (${category}, ${item.name}, ${item.description}, ${item.is_pizza}, ${item.is_active},
                ${item.tags}, ${item.image_url}, ${item.base_price}, ${item.sort_order},
                ${item.alergenos}, ${targetId})
        RETURNING menu_item_id
      `;
      if (!created) continue;
      summary.productos += 1;
      await tx`
        INSERT INTO public.menu_variant
          (menu_item_id, variant_name, price, sku, is_default, is_active, sort_order, restaurante_id)
        SELECT ${created.menu_item_id}, variant_name, price, sku, is_default, is_active, sort_order,
               ${targetId}
        FROM   public.menu_variant WHERE menu_item_id = ${item.menu_item_id}
      `;
    }

    const extraMap = new Map<number, number>();
    const extras = await tx<
      {
        extra_id: string;
        name: string;
        price: string;
        is_active: boolean;
        allergens: string | null;
        sort_order: number;
        alergenos: string[] | null;
      }[]
    >`
      SELECT extra_id, name, price, is_active, allergens, sort_order, alergenos
      FROM   public.extra WHERE restaurante_id = ${sourceId} ORDER BY extra_id
    `;
    for (const extra of extras) {
      const [created] = await tx<{ extra_id: string }[]>`
        INSERT INTO public.extra (name, price, is_active, allergens, sort_order, alergenos, restaurante_id)
        VALUES (${extra.name}, ${extra.price}, ${extra.is_active}, ${extra.allergens},
                ${extra.sort_order}, ${extra.alergenos}, ${targetId})
        RETURNING extra_id
      `;
      if (created) extraMap.set(Number(extra.extra_id), Number(created.extra_id));
    }
    summary.extras = extraMap.size;

    const links = await tx<{ menu_category_id: string; extra_id: string }[]>`
      SELECT mce.menu_category_id, mce.extra_id
      FROM   public.menu_category_extra mce
      JOIN   public.menu_category c ON c.menu_category_id = mce.menu_category_id
      WHERE  c.restaurante_id = ${sourceId}
    `;
    for (const link of links) {
      const category = categoryMap.get(Number(link.menu_category_id));
      const extra = extraMap.get(Number(link.extra_id));
      if (category !== undefined && extra !== undefined) {
        await tx`
          INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
          VALUES (${category}, ${extra}) ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  if (parts.horario) {
    await tx`DELETE FROM public.horarios WHERE restaurante_id = ${targetId}`;
    await tx`
      INSERT INTO public.horarios
        (restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
      SELECT ${targetId}, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2
      FROM   public.horarios WHERE restaurante_id = ${sourceId}
    `;
  }

  if (parts.reparto) {
    const zones = await tx<{ delivery_zone_id: string }[]>`
      INSERT INTO public.delivery_zone
        (postal_code, zone_name, fee, is_active, description, min_order_amount,
         estimated_minutes_min, estimated_minutes_max, restaurante_id, lat_center, lng_center,
         radius_km, sucursal_id, tipo_tarifa, tarifa_por_km, tarifa_maxima, envio_gratis_desde,
         cubre_todo)
      SELECT postal_code, zone_name, fee, is_active, description, min_order_amount,
             estimated_minutes_min, estimated_minutes_max, ${targetId}, lat_center, lng_center,
             radius_km, ${targetBranchId}, tipo_tarifa, tarifa_por_km, tarifa_maxima,
             envio_gratis_desde, cubre_todo
      FROM   public.delivery_zone WHERE restaurante_id = ${sourceId}
      RETURNING delivery_zone_id
    `;
    summary.zonas = zones.length;
  }

  if (parts.ajustes) {
    await tx`
      UPDATE public.restaurante AS t
      SET    descripcion = s.descripcion, eslogan = s.eslogan, brand_color = s.brand_color,
             theme_id = s.theme_id, mensaje_bienvenida = s.mensaje_bienvenida,
             mensaje_cerrado = s.mensaje_cerrado, moneda = s.moneda,
             delivery_min_order = s.delivery_min_order
      FROM   public.restaurante s
      WHERE  t.id = ${targetId} AND s.id = ${sourceId}
    `;
    await tx`
      INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
      SELECT ${targetId}, config_key, config_value, description
      FROM   public.restaurante_config
      WHERE  restaurante_id = ${sourceId} AND config_key IN ${tx(CLONED_CONFIG_KEYS)}
      ON CONFLICT (restaurante_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value
    `;
  }
  return summary;
}

/**
 * Borra un restaurante y todo lo suyo (pedidos, carta, equipo, clientes…). Casi todas las tablas
 * cuelgan de `restaurante` con ON DELETE CASCADE; `meseros` no, y `pedidos.mesero_id` apunta a
 * `meseros`, así que el orden es pedidos → meseros → restaurante. La auditoría se conserva (queda
 * sin restaurante: ver 0031). Los archivos de Storage se borran aparte (`removeRestaurantFiles`).
 */
export async function deleteRestaurant(
  tx: Tx,
  id: number,
): Promise<{ pedidos: number; miembros: number }> {
  const [counts] = await tx<{ pedidos: number; miembros: number }[]>`
    SELECT (SELECT count(*)::int FROM public.pedidos WHERE restaurante_id = ${id}) AS pedidos,
           (SELECT count(*)::int FROM public.local_memberships WHERE restaurante_id = ${id}) AS miembros
  `;
  await tx`DELETE FROM public.pedidos WHERE restaurante_id = ${id}`;
  await tx`DELETE FROM public.meseros WHERE restaurante_id = ${id}`;
  await tx`DELETE FROM public.restaurante WHERE id = ${id}`;
  return counts ?? { pedidos: 0, miembros: 0 };
}

/** Resultado del borrado de archivos: cuántos se borraron o `error` si esa parte falló. */
export type FilesResult = {
  readonly carta: number | "sin_almacen" | "error";
  readonly justificantes: number | "sin_almacen" | "error";
  readonly fotos_entrega: number | "sin_almacen" | "error";
};

async function attempt(
  run: (() => Promise<number>) | undefined,
): Promise<number | "sin_almacen" | "error"> {
  if (!run) return "sin_almacen";
  try {
    return await run();
  } catch {
    return "error";
  }
}

/**
 * Borra de Storage lo del restaurante: logo y fotos de producto (bucket de la carta, carpeta
 * `<id>/`), justificantes de pago (`<id>/` del bucket privado) y fotos de entrega
 * (`entregas/<id>/`). Mejor esfuerzo: cada parte informa su resultado y ninguna lanza.
 */
export async function removeRestaurantFiles(
  deps: Pick<AppDeps, "imageStorage" | "proofStorage">,
  id: number,
): Promise<FilesResult> {
  const images = deps.imageStorage?.removeFolder;
  const proofs = deps.proofStorage?.removeFolder;
  return {
    carta: await attempt(images && (() => images(String(id)))),
    justificantes: await attempt(proofs && (() => proofs(String(id)))),
    fotos_entrega: await attempt(proofs && (() => proofs(`${DELIVERY_PHOTO_PREFIX}/${id}`))),
  };
}
