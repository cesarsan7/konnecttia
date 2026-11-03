-- =============================================================================
-- Carta de Cafetería Siempre Juntos, transcrita de sus cartas «Menú» y «Menú gourmet»
-- (imágenes enviadas por el promotor, nov 2026). Ejecutar después de siempre-juntos.sql.
--
-- Revisar con el restaurante antes de producción:
--   * Precios: las cartas publicadas pueden no estar al día.
--   * «La Criolla XXL»: la descripción está cortada en la imagen.
--   * «Batidos de frutas»: cuatro precios sin nombre claro en la carta; se interpretan como
--     cuatro tipos de batido.
--   * «Carne de cerdo» (7,00 €) y «Alitas de pollo» (8,00 €) en Especiales, sin descripción.
--   * Extras: la carta dice «para cualquier otro extra preguntar al personal». Se asocian a las
--     categorías saladas (no a crepes ni batidos).
--   * Alérgenos: la carta tiene una tabla general, pero no por producto; quedan «no informados».
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE v_id int;
BEGIN
  SELECT id INTO v_id FROM public.restaurante WHERE slug = 'siempre-juntos';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Primero ejecuta siempre-juntos.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_category WHERE restaurante_id = v_id) THEN
    RAISE EXCEPTION 'Siempre Juntos ya tiene carta: no se vuelve a cargar';
  END IF;
END $$;

CREATE TEMP TABLE carta_categoria (nombre text, orden int) ON COMMIT DROP;
INSERT INTO carta_categoria VALUES
  ('Hamburguesas gourmet', 1),
  ('Perritos', 2),
  ('Especiales', 3),
  ('Salchipapas, salchimaduros y caprichos', 4),
  ('Hamburguesas', 5),
  ('Bocadillos', 6),
  ('Arepas', 7),
  ('Empanadas colombianas', 8),
  ('Tostadas', 9),
  ('Crepes y pancakes', 10),
  ('Batidos de frutas', 11);

-- (categoría, producto, descripción, variante, precio, por defecto)
CREATE TEMP TABLE carta_producto (
  categoria text, producto text, descripcion text, variante text, precio numeric, por_defecto boolean
) ON COMMIT DROP;
INSERT INTO carta_producto VALUES
  -- Hamburguesas gourmet (todas con papas fritas)
  ('Hamburguesas gourmet', 'Clásica', 'Carne 160 g, doble queso cheddar, cebolla caramelizada, tomate, lechuga, pan brioche y salsas de la casa. Con papas fritas.', 'Única', 7.50, true),
  ('Hamburguesas gourmet', 'Hawái', 'Carne 160 g, doble queso cheddar, bacon caramelizado, rodaja de piña asada, tomate, lechuga, pan brioche y salsas de la casa. Con papas fritas.', 'Única', 10.50, true),
  ('Hamburguesas gourmet', 'La Bacana', 'Carne 160 g, bacon, maíz dulce, queso fundido, tomate, lechuga, tajada de plátano maduro, cebolla caramelizada y salsas de la casa. Con papas fritas.', 'Única', 12.50, true),
  ('Hamburguesas gourmet', 'XL', 'Carne 160 g, doble queso cheddar, bacon caramelizado, carne mechada, tomate, lechuga, pan brioche y salsas de la casa. Con papas fritas.', 'Única', 11.50, true),
  -- Perritos
  ('Perritos', 'De la casa', 'Salchicha de cerdo, papa ripio, cebolla crispy, bacon caramelizado, queso fundido y salsas de la casa.', 'Única', 6.50, true),
  ('Perritos', 'El Matahambre', 'Salchicha o chorizo, queso, cebolla caramelizada, ripio, bacon caramelizado, maíz dulce y carne mechada.', 'Con salchicha', 8.00, true),
  ('Perritos', 'El Matahambre', NULL, 'Con chorizo', 9.00, false),
  ('Perritos', 'Santarrosano', 'Chorizo santarrosano, papa ripio, cebolla crispy, bacon caramelizado, queso fundido y salsas de la casa.', 'Única', 7.50, true),
  -- Especiales
  ('Especiales', 'Picada de carnes', 'Carne de cerdo, pollo, costilla, chorizo, chicharrón, papas, plátano y salsas.', 'Pequeña', 15.00, true),
  ('Especiales', 'Picada de carnes', NULL, 'Grande', 25.00, false),
  ('Especiales', 'Desgranado de mazorca de maíz', 'Carne de cerdo, pollo, maíz dulce, queso fundido, papas fritas, cebolla caramelizada, ripio, lechuga y salsas.', 'Única', 12.50, true),
  ('Especiales', 'Chicharrada', 'Chicharrón, chorizo santarrosano y yuca o papa.', 'Única', 12.00, true),
  ('Especiales', 'Carne de cerdo', NULL, 'Única', 7.00, true),
  ('Especiales', 'Alitas de pollo', NULL, 'Única', 8.00, true),
  -- Salchipapas, salchimaduros y caprichos
  ('Salchipapas, salchimaduros y caprichos', 'Salchimaduro', 'Salchicha, plátano maduro, carne mechada de pollo y de ternera, bacon, queso y salsas.', 'Pequeño', 9.00, true),
  ('Salchipapas, salchimaduros y caprichos', 'Salchimaduro', NULL, 'Grande', 14.00, false),
  ('Salchipapas, salchimaduros y caprichos', 'Sencilla', 'Papas, salchicha, pollo, queso y salsas.', 'Única', 7.50, true),
  ('Salchipapas, salchimaduros y caprichos', 'La Criolla XXL', 'Papas, salchicha, queso, pollo, carne mechada, bacon, plátano maduro, chorizo santarrosano y maíz dulce.', 'Pequeña', 17.00, true),
  ('Salchipapas, salchimaduros y caprichos', 'La Criolla XXL', NULL, 'Grande', 23.00, false),
  ('Salchipapas, salchimaduros y caprichos', 'El Inmaduro', 'Plátano maduro frito, queso, chicharrón, chorizo santarrosano, papa ripio y salsa a elegir.', 'Única', 9.50, true),
  ('Salchipapas, salchimaduros y caprichos', 'Salchipapa Bomba', 'Papas, queso, salchicha, mahonesa, kétchup y mostaza.', 'Única', 6.50, true),
  ('Salchipapas, salchimaduros y caprichos', 'Con todo', 'Papas, salchicha, carne mechada de pollo y ternera, bacon, queso y salsas.', 'Única', 12.50, true),
  ('Salchipapas, salchimaduros y caprichos', 'Papas locas', 'Papas con salsa a elegir.', 'Única', 2.40, true),
  ('Salchipapas, salchimaduros y caprichos', 'Dorilocos', 'Doritos, queso, maíz dulce, pollo, bacon, chorizo santarrosano, guacamole y pico de gallo.', 'Única', 8.50, true),
  -- Hamburguesas
  ('Hamburguesas', 'De la casa', 'Lechuga, tomate, jamón, queso, bacon, huevo, cebolla, kétchup, mostaza y mahonesa.', 'Única', 4.80, true),
  ('Hamburguesas', 'Cheddar', 'Bacon, queso cheddar, cebolla crispy y salsa burguer.', 'Única', 4.70, true),
  ('Hamburguesas', 'Bikini', 'Huevo, jamón, queso, kétchup, mostaza y cebolla crispy.', 'Única', 4.50, true),
  -- Bocadillos
  ('Bocadillos', 'El Empanado', 'Pollo empanado, queso cheddar, tomate, lechuga y salsa miel mostaza.', 'Única', 4.80, true),
  ('Bocadillos', 'Arrenquitado', 'Lechuga, tomate, jamón, queso, huevo, mahonesa, salchicha, bacon y carne, pollo o lomo.', 'Única', 5.20, true),
  ('Bocadillos', 'Chicha', 'Lomo, bacon, jamón, queso, cebolla frita y salsa remolada.', 'Única', 4.50, true),
  ('Bocadillos', 'Carne o pollo mechado', 'Queso, aguacate y mahonesa.', 'Única', 4.50, true),
  ('Bocadillos', 'Manguito', 'Lechuga, pechuga, bacon, queso, mango curry y mahonesa.', 'Única', 4.90, true),
  -- Arepas
  ('Arepas', 'Mechada', 'Carne o pollo mechado, aguacate, queso y mahonesa.', 'Única', 5.20, true),
  ('Arepas', 'Vegetal', 'Lechuga, tomate, queso, huevo y mahonesa.', 'Única', 4.50, true),
  ('Arepas', 'Sabrosa', 'Atún, maíz dulce y mahonesa.', 'Única', 4.20, true),
  ('Arepas', 'De la casa', 'Lomo, bacon, jamón, queso, huevo, lechuga, tomate y alioli.', 'Única', 5.20, true),
  ('Arepas', 'Reina pepiada', 'Pollo desmenuzado, aguacate, mayonesa y mostaza.', 'Única', 5.50, true),
  -- Empanadas colombianas
  ('Empanadas colombianas', 'Empanada', NULL, 'Unidad', 2.00, true),
  -- Tostadas
  ('Tostadas', 'Serrano', 'Tomate, jamón serrano, queso fresco, aceite de oliva y orégano.', 'Única', 5.50, true),
  ('Tostadas', 'Ranchera', 'Aguacate, queso, bacon, huevo y tomate.', 'Única', 6.00, true),
  ('Tostadas', 'Hawái', 'Envuelto, queso fresco y aguacate.', 'Única', 5.80, true),
  ('Tostadas', 'Clásica', 'Mantequilla y mermelada.', 'Única', 2.00, true),
  -- Crepes y pancakes
  ('Crepes y pancakes', 'El Goloso', 'Dulce de leche o Nutella.', 'Única', 5.00, true),
  ('Crepes y pancakes', 'El Goloso con fruta de temporada', 'Dulce de leche o Nutella con frutas de temporada.', 'Única', 6.00, true),
  ('Crepes y pancakes', 'El Goloso con helado', 'Dulce de leche o Nutella con helado a elegir.', 'Única', 6.00, true),
  -- Batidos de frutas
  ('Batidos de frutas', 'Batido de frutas o pulpa', NULL, 'Único', 4.20, true),
  ('Batidos de frutas', 'Batido helado', NULL, 'Único', 3.50, true),
  ('Batidos de frutas', 'Batido de fresa, chocolate o vainilla', NULL, 'Único', 3.20, true),
  ('Batidos de frutas', 'Batido de sabores especiales', NULL, 'Único', 4.00, true);

-- Categorías
INSERT INTO public.menu_category (name, sort_order, restaurante_id)
SELECT c.nombre, c.orden, r.id
FROM   carta_categoria c CROSS JOIN public.restaurante r
WHERE  r.slug = 'siempre-juntos';

-- Productos (la descripción viene en la primera fila de cada producto)
INSERT INTO public.menu_item (menu_category_id, name, description, restaurante_id, base_price)
SELECT mc.menu_category_id, p.producto,
       max(p.descripcion), mc.restaurante_id, min(p.precio)
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'siempre-juntos'
GROUP  BY mc.menu_category_id, mc.restaurante_id, p.producto;

-- Variantes y precios
INSERT INTO public.menu_variant (menu_item_id, variant_name, price, is_default, restaurante_id)
SELECT mi.menu_item_id, p.variante, p.precio, p.por_defecto, mi.restaurante_id
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'siempre-juntos'
JOIN   public.menu_item mi ON mi.menu_category_id = mc.menu_category_id AND mi.name = p.producto;

-- Extras / complementos
INSERT INTO public.extra (name, price, restaurante_id)
SELECT e.nombre, e.precio, r.id
FROM   (VALUES
  ('Carne mechada o pollo mechado', 2.50),
  ('Queso', 2.50),
  ('Salchicha', 2.50),
  ('Maduro', 2.50),
  ('Chicharrón', 3.50),
  ('Chorizo', 3.50)
) AS e(nombre, precio)
CROSS JOIN public.restaurante r
WHERE  r.slug = 'siempre-juntos';

INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
SELECT mc.menu_category_id, x.extra_id
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'siempre-juntos'
JOIN   public.extra x ON x.restaurante_id = r.id
WHERE  mc.name NOT IN ('Crepes y pancakes', 'Batidos de frutas');

COMMIT;

SELECT mc.name AS categoria, count(DISTINCT mi.menu_item_id) AS productos, count(mv.*) AS precios
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'siempre-juntos'
LEFT   JOIN public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
LEFT   JOIN public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
GROUP  BY mc.name, mc.sort_order ORDER BY mc.sort_order;
