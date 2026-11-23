-- =============================================================================
-- Carta de Arepa's Factory · COMPLEMENTO: Bebidas, Cervezas y Batidos.
-- Transcrito de la foto de la carta de bebidas enviada por el promotor (22/11/2026) y confirmado
-- por él con los supuestos indicados abajo.
--
-- Complementa arepas-factory-carta.sql (no lo sustituye): se ejecuta DESPUÉS de arepas-factory.sql
-- y arepas-factory-carta.sql. Solo inserta: no borra ni modifica nada existente, y se puede
-- ejecutar más de una vez sin duplicar (ON CONFLICT DO NOTHING sobre las claves únicas).
-- Las categorías nuevas se añaden al final, a continuación de la última existente.
--
-- Revisar con el restaurante antes de producción:
--   * Precios: la carta puede no estar al día.
--   * «Pera piña» en los zumos se leyó como un único sabor.
--   * Opciones «elegir» (sabor de refrescos, zumos y batidos): quedan como texto en la
--     descripción y el cliente no las elige en el pedido; el local debe preguntarlas.
--   * Batido de fruta: dos variantes (Leche y Agua) al mismo precio; «Leche» queda por defecto
--     (supuesto del equipo; la foto no indica cuál).
--   * Extras de Batidos: «Pulpa extra» +0,80 € y «Bebida vegetal» +0,10 € (nuevos) y el
--     «Extra de proteína» +2,00 € que ya existe. Los extras se enlazan por categoría, así que
--     quedan disponibles en todos los batidos (pulpa extra solo tiene sentido en el de fruta, y
--     bebida vegetal y proteína en el de proteína). Pendiente de afinar si se quiere por producto.
--   * Jarra: la carta no indica el tamaño.
--   * Alérgenos: no informados (NULL), como el resto de la carta.
--   * Cervezas: el sistema no verifica la edad en pedidos online.
-- =============================================================================

\set ON_ERROR_STOP on

\echo '--- ANTES ---'
SELECT mc.name AS categoria, count(DISTINCT mi.menu_item_id) AS productos, count(mv.*) AS precios
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
LEFT   JOIN public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
LEFT   JOIN public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
GROUP  BY mc.name, mc.sort_order ORDER BY mc.sort_order;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.restaurante WHERE slug = 'arepas-factory') THEN
    RAISE EXCEPTION 'Primero ejecuta arepas-factory.sql y arepas-factory-carta.sql';
  END IF;
END $$;

CREATE TEMP TABLE carta_categoria (nombre text, orden int) ON COMMIT DROP;
INSERT INTO carta_categoria VALUES
  ('Bebidas', 1),
  ('Cervezas', 2),
  ('Batidos', 3);

-- (categoría, producto, descripción, variante, precio, por defecto, orden del producto, orden de la variante)
CREATE TEMP TABLE carta_producto (
  categoria text, producto text, descripcion text, variante text, precio numeric,
  por_defecto boolean, ord int, ord_var int
) ON COMMIT DROP;
INSERT INTO carta_producto VALUES
  -- Bebidas
  ('Bebidas', 'Agua 500 ml', NULL, 'Única', 1.50, true, 1, 0),
  ('Bebidas', 'Refrescos 330 ml', 'Elige entre Coca-Cola, Fanta, Clipper, Nestea, Sprite, Tónica, Aquarius y Appletiser.', 'Única', 1.80, true, 2, 0),
  ('Bebidas', 'Refrescos Postobón', 'Elige entre manzana, uva, colombiana y Pony Malta.', 'Única', 2.60, true, 3, 0),
  ('Bebidas', 'Refresco Coca-Cola 1,5 l', 'Solo para llevar.', 'Única', 2.60, true, 4, 0),
  ('Bebidas', 'Bebida energética', NULL, 'Única', 1.95, true, 5, 0),
  ('Bebidas', 'Zumo de naranja', NULL, 'Pequeño', 2.50, true, 6, 0),
  ('Bebidas', 'Zumo de naranja', NULL, 'Grande', 4.00, false, 6, 1),
  ('Bebidas', 'Zumos', 'Elige entre manzana, melocotón, pera piña y bifrutas tropical.', 'Única', 1.60, true, 7, 0),
  -- Cervezas
  ('Cervezas', 'Botellín', NULL, 'Única', 1.20, true, 1, 0),
  ('Cervezas', 'Caña', NULL, 'Única', 1.50, true, 2, 0),
  ('Cervezas', 'Jarra', NULL, 'Única', 3.00, true, 3, 0),
  ('Cervezas', 'Tropical', NULL, 'Única', 1.90, true, 4, 0),
  ('Cervezas', 'Tropical limón', NULL, 'Única', 1.95, true, 5, 0),
  ('Cervezas', 'Tropical 0,0', NULL, 'Única', 1.90, true, 6, 0),
  ('Cervezas', 'Dorada especial', NULL, 'Única', 2.10, true, 7, 0),
  ('Cervezas', 'Corona', NULL, 'Única', 2.10, true, 8, 0),
  -- Batidos
  ('Batidos', 'Batido de fruta', 'Con leche o con agua. Elige entre mango, maracuyá, mora, guanábana, fresa y lulo. Pulpa extra disponible (+0,80 €).', 'Leche', 4.80, true, 1, 0),
  ('Batidos', 'Batido de fruta', NULL, 'Agua', 4.80, false, 1, 1),
  ('Batidos', 'Milo frío', NULL, 'Única', 4.80, true, 2, 0),
  ('Batidos', 'Batido de proteína', 'Leche o bebida vegetal (+0,10 €), scoop de proteína, plátano y canela. Extra de proteína (+2,00 €).', 'Única', 5.00, true, 3, 0);

-- Categorías: se añaden al final, tras la última existente
INSERT INTO public.menu_category (name, sort_order, restaurante_id)
SELECT c.nombre, base.maximo + c.orden, r.id
FROM   carta_categoria c
CROSS  JOIN public.restaurante r
CROSS  JOIN LATERAL (
         SELECT coalesce(max(sort_order), 0) AS maximo
         FROM   public.menu_category WHERE restaurante_id = r.id
       ) base
WHERE  r.slug = 'arepas-factory'
ON CONFLICT (restaurante_id, name) DO NOTHING;

-- Productos (la descripción viene en la primera fila de cada producto)
INSERT INTO public.menu_item (menu_category_id, name, description, restaurante_id, base_price, sort_order)
SELECT mc.menu_category_id, p.producto,
       max(p.descripcion), mc.restaurante_id, min(p.precio), min(p.ord)
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
GROUP  BY mc.menu_category_id, mc.restaurante_id, p.producto
ON CONFLICT (restaurante_id, menu_category_id, name) DO NOTHING;

-- Variantes y precios
INSERT INTO public.menu_variant (menu_item_id, variant_name, price, is_default, restaurante_id, sort_order)
SELECT mi.menu_item_id, p.variante, p.precio, p.por_defecto, mi.restaurante_id, p.ord_var
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.menu_item mi ON mi.menu_category_id = mc.menu_category_id AND mi.name = p.producto
ON CONFLICT (menu_item_id, variant_name) DO NOTHING;

-- Extras nuevos
INSERT INTO public.extra (name, price, restaurante_id)
SELECT e.nombre, e.precio, r.id
FROM   (VALUES
  ('Pulpa extra', 0.80),
  ('Bebida vegetal', 0.10)
) AS e(nombre, precio)
CROSS JOIN public.restaurante r
WHERE  r.slug = 'arepas-factory'
ON CONFLICT (restaurante_id, name) DO NOTHING;

-- Extras de Batidos (reutiliza «Extra de proteína» si ya existe)
INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
SELECT mc.menu_category_id, x.extra_id
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.extra x ON x.restaurante_id = r.id
WHERE  mc.name = 'Batidos'
  AND  x.name IN ('Pulpa extra', 'Bebida vegetal', 'Extra de proteína')
ON CONFLICT (menu_category_id, extra_id) DO NOTHING;

COMMIT;

\echo '--- DESPUÉS ---'
SELECT mc.name AS categoria, count(DISTINCT mi.menu_item_id) AS productos, count(mv.*) AS precios
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
LEFT   JOIN public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
LEFT   JOIN public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
GROUP  BY mc.name, mc.sort_order ORDER BY mc.sort_order;

\echo '--- LO INSERTADO ---'
SELECT mc.name AS categoria, mi.name AS producto, mv.variant_name AS variante, mv.price
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
JOIN   public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
WHERE  mc.name IN ('Bebidas', 'Cervezas', 'Batidos')
ORDER  BY mc.sort_order, mi.sort_order, mv.sort_order;
