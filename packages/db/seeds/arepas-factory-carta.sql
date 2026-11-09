-- =============================================================================
-- Carta de Arepa's Factory, transcrita del folleto del local (fotos enviadas por el promotor,
-- nov 2026). Ejecutar después de arepas-factory.sql.
--
-- Revisar con el restaurante antes de producción:
--   * Precios: el folleto puede no estar al día.
--   * Cachapas: la foto está girada y los precios se leen desalineados. Los tres últimos
--     (Reina 8,00 · Mixta 7,80 · Campesina 8,70) son los más dudosos.
--   * Opciones «elegir» (Tostada 6, Arepa Factory, Patacones, Bocadillo «Elige pollo / carne»,
--     Chorizos Santa Rosanos): quedan como texto en la descripción, con un solo precio.
--   * Alérgenos: el folleto trae iconos por producto, pero son demasiado pequeños para
--     transcribirlos con seguridad; quedan «no informados» (NULL) hasta confirmarlos.
--   * Horario de desayunos (08:00–12:00): el sistema no tiene disponibilidad por franja; los
--     desayunos y pancakes de desayuno se muestran todo el día. Pendiente.
--   * No cargados como extras: «Estuches para llevar» (0,20 €, es un suplemento de envases de
--     Ajustes → Reparto) y «Otros extras» (1,00 €, sin detalle).
--   * Extras: «Extra de tostada» 1,00 € solo en Desayunos; «Extra de salsa» 0,80 € y «Extra de
--     proteína» 2,00 € en las categorías saladas; bola de helado / topping 1,00 € en Postres.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE v_id int;
BEGIN
  SELECT id INTO v_id FROM public.restaurante WHERE slug = 'arepas-factory';
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Primero ejecuta arepas-factory.sql';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_category WHERE restaurante_id = v_id) THEN
    RAISE EXCEPTION 'Arepa''s Factory ya tiene carta: no se vuelve a cargar';
  END IF;
END $$;

CREATE TEMP TABLE carta_categoria (nombre text, orden int) ON COMMIT DROP;
INSERT INTO carta_categoria VALUES
  ('Desayunos', 1),
  ('Bowls', 2),
  ('Combo Factory', 3),
  ('Pancakes', 4),
  ('Cachapas', 5),
  ('Papas', 6),
  ('Salchipapas', 7),
  ('Postres', 8),
  ('Perritos', 9),
  ('Arepas', 10),
  ('Sandwich', 11),
  ('Picoteo', 12),
  ('Bocadillos', 13);

-- (categoría, producto, descripción, variante, precio, por defecto)
CREATE TEMP TABLE carta_producto (
  categoria text, producto text, descripcion text, variante text, precio numeric, por_defecto boolean
) ON COMMIT DROP;
INSERT INTO carta_producto VALUES
  -- Desayunos (tostadas de pan payés)
  ('Desayunos', 'Tostada 1', 'Tomate rallado y aceite. Pan payés.', 'Única', 3.00, true),
  ('Desayunos', 'Tostada 2', 'Mantequilla y mermelada. Pan payés.', 'Única', 2.90, true),
  ('Desayunos', 'Tostada 3', 'Tomate rallado, queso fresco, orégano y aceite. Pan payés.', 'Única', 3.90, true),
  ('Desayunos', 'Tostada 4', 'Tomate rallado, huevo revuelto, bacon, aguacate y aceite. Pan payés.', 'Única', 6.00, true),
  ('Desayunos', 'Tostada 5', 'Cebolla caramelizada, queso de rulo a la plancha, rúcula, nueces y miel. Pan payés.', 'Única', 5.60, true),
  ('Desayunos', 'Tostada 6', 'Tomate rallado, aguacate y bacon. Elegir pollo o carne. Pan payés.', 'Única', 5.70, true),
  ('Desayunos', 'Tostada 7', 'Salmón, queso crema, aguacate, rúcula y semillas de sésamo. Pan payés.', 'Única', 6.00, true),
  -- Bowls
  ('Bowls', 'Bowl 1', 'Yogurt griego natural, mezcla de frutos secos, chips de chocolate y sirope de arce.', 'Única', 4.50, true),
  ('Bowls', 'Bowl 2', 'Yogurt griego natural, plátano, crema de cacahuete, chía y mezcla de semillas.', 'Única', 5.00, true),
  ('Bowls', 'Bowl 3', 'Yogurt griego natural, fruta de temporada, muesli, chía, almendra laminada y 1 topping.', 'Única', 6.50, true),
  -- Combo Factory
  ('Combo Factory', 'Combo Factory', 'Huevos pericos, queso fresco, arepa frita y café con leche.', 'Única', 7.50, true),
  -- Pancakes (3 unidades)
  ('Pancakes', 'Pancakes de huevo', 'Tres unidades. Huevo, bacon, queso rallado y sirope de arce.', 'Única', 6.50, true),
  ('Pancakes', 'Pancakes de fruta', 'Tres unidades. Fruta de temporada, miel y nata.', 'Única', 5.50, true),
  -- Cachapas (versión del plato típico elaborado con maíz dulce)
  ('Cachapas', 'Cachapa', 'Versión de este plato típico elaborado con maíz dulce.', 'Única', 4.90, true),
  ('Cachapas', 'Cachapa de queso fresco', NULL, 'Única', 6.80, true),
  ('Cachapas', 'Cachapa de queso fresco y guayaba', NULL, 'Única', 7.00, true),
  ('Cachapas', 'Cachapa de queso fresco y mermelada de arándanos', NULL, 'Única', 7.00, true),
  ('Cachapas', 'Cachapa de pollo mechado con guiso y queso amarillo', NULL, 'Única', 7.60, true),
  ('Cachapas', 'Cachapa de pollo mechado con guiso y queso fresco', NULL, 'Única', 7.90, true),
  ('Cachapas', 'Cachapa de carne mechada con guiso y queso amarillo', NULL, 'Única', 8.00, true),
  ('Cachapas', 'Cachapa de carne mechada con guiso y queso fresco', NULL, 'Única', 8.20, true),
  ('Cachapas', 'Cachapa reina', 'Ensaladilla fría de pollo mechado con mayonesa y aguacate.', 'Única', 8.00, true),
  ('Cachapas', 'Cachapa mixta', 'Carne mechada con guiso, pollo mechado sin guiso y chicharrón.', 'Única', 7.80, true),
  ('Cachapas', 'Cachapa campesina', 'Carne mechada con guiso, pollo mechado sin guiso, chicharrón, jamón, queso amarillo y aguacate.', 'Única', 8.70, true),
  -- Papas
  ('Papas', 'Papas fritas', NULL, 'Única', 3.50, true),
  ('Papas', 'Papas con alioli', NULL, 'Única', 4.00, true),
  ('Papas', 'Papas locas', 'Ketchup, mayonesa, jamón y queso amarillo.', 'Única', 4.30, true),
  ('Papas', 'Papas con atún, queso amarillo y alioli', NULL, 'Única', 5.30, true),
  ('Papas', 'Papas Factory', 'Carne mechada con guiso, pollo mechado con guiso, jamón, queso amarillo, ketchup, mayonesa, alioli y mostaza.', 'Única', 7.00, true),
  -- Salchipapas (papas fritas, salchichas, pollo mechado sin guiso, queso rallado, ketchup, mayonesa, guacamole y piña)
  ('Salchipapas', 'Salchipapas', 'Papas fritas, salchichas, pollo mechado sin guiso, queso rallado, ketchup, mayonesa, guacamole y piña.', 'Mini', 4.50, true),
  ('Salchipapas', 'Salchipapas', NULL, 'Mediana', 6.00, false),
  ('Salchipapas', 'Salchipapas', NULL, 'XL', 10.00, false),
  -- Postres
  ('Postres', 'Tarta / bizcocho del día', NULL, 'Única', 3.40, true),
  ('Postres', 'Pancakes con helado', 'Pancakes con 1 bola de helado y 1 topping.', 'Única', 4.50, true),
  ('Postres', 'Pancakes de crema de cacahuete y plátano', 'Crema de cacahuete, plátano y chips de chocolate negro.', 'Única', 4.80, true),
  -- Perritos
  ('Perritos', 'Perrito normal', 'Ketchup y mayonesa.', 'Única', 3.30, true),
  ('Perritos', 'Perrito Factory', 'Carne mechada con guiso, ketchup, mayonesa, mostaza dulce, queso rallado y cebolla frita.', 'Única', 4.70, true),
  ('Perritos', 'Perrito especial', 'Queso, bacon, cebolla, piña, papas paja y salsa rosa.', 'Única', 5.00, true),
  -- Arepas (maíz cocido, asado y frito)
  ('Arepas', 'Arepa frita', 'El maíz de nuestras arepas es cocido, asado y frito.', 'Única', 3.00, true),
  ('Arepas', 'Arepa y queso amarillo', NULL, 'Única', 4.00, true),
  ('Arepas', 'Arepa y queso fresco', NULL, 'Única', 4.90, true),
  ('Arepas', 'Arepa de jamón y queso amarillo', NULL, 'Única', 4.50, true),
  ('Arepas', 'Arepa de queso fresco, tomate y aguacate', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa de queso fresco asado, bacon y aguacate', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa de queso fresco asado, atún y aguacate', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa de pollo mechado con guiso', NULL, 'Única', 4.70, true),
  ('Arepas', 'Arepa de pollo mechado con guiso y queso amarillo', NULL, 'Única', 5.00, true),
  ('Arepas', 'Arepa de pollo mechado con guiso y queso fresco', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa de carne mechada con guiso', NULL, 'Única', 4.80, true),
  ('Arepas', 'Arepa de carne mechada con guiso y queso amarillo', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa de carne mechada con guiso y queso fresco', NULL, 'Única', 5.20, true),
  ('Arepas', 'Arepa vegetal de atún', 'Lechuga, tomate, queso fresco, atún, pimiento frito y millo.', 'Única', 4.90, true),
  ('Arepas', 'Arepa de lomo', 'Queso fresco asado, huevo, lomo y pimiento frito.', 'Única', 5.10, true),
  ('Arepas', 'Arepa de chicharrón', NULL, 'Única', 5.10, true),
  ('Arepas', 'Arepa Reina', 'Ensalada de pollo mechado, aguacate y mayonesa.', 'Única', 5.30, true),
  ('Arepas', 'Arepa Montañera', 'Carne mechada con guiso, pollo mechado sin guiso y chicharrón.', 'Única', 5.60, true),
  ('Arepas', 'Arepa de calamares', 'Tomate, cebolla y alioli.', 'Única', 5.10, true),
  ('Arepas', 'Arepa Burger', 'Lechuga, tomate, cebolla caramelizada, queso amarillo, bacon, carne de la casa y salsa de piña.', 'Única', 5.40, true),
  ('Arepas', 'Arepa Ranchera', 'Pollo mechado con guiso, chicharrón, millo, maduritos y salchicha.', 'Única', 6.10, true),
  ('Arepas', 'Arepa Factory', 'Elige entre carne mechada con guiso, pollo mechado o pollo reina. Lechuga, tomate, cebolla, jamón, queso amarillo, huevo y bacon.', 'Única', 6.40, true),
  -- Sandwich
  ('Sandwich', 'Mixto', 'Jamón y queso amarillo.', 'Única', 2.40, true),
  ('Sandwich', 'Hawaiano', 'Jamón, queso amarillo y piña.', 'Única', 2.80, true),
  ('Sandwich', 'Vegetal de atún', 'Atún, queso amarillo, lechuga, tomate y cebolla.', 'Única', 4.00, true),
  ('Sandwich', 'Vegetal de pollo', 'Pollo mechado con guiso, queso amarillo, lechuga, tomate y cebolla.', 'Única', 4.10, true),
  ('Sandwich', 'Vegetal de carne', 'Carne mechada con guiso, queso amarillo, lechuga, tomate y cebolla.', 'Única', 4.10, true),
  ('Sandwich', 'Factory', 'Pollo reina, bacon, jamón, huevo, queso fresco, lechuga, tomate y cebolla.', 'Única', 6.00, true),
  -- Picoteo
  ('Picoteo', 'Tequeños', NULL, 'x2', 3.10, true),
  ('Picoteo', 'Tequeños', NULL, 'x5', 7.50, false),
  ('Picoteo', 'Empanadas', 'Crocante de maíz relleno de carne y papa.', 'Única', 2.20, true),
  ('Picoteo', 'Yuca frita con ají', NULL, 'Única', 5.60, true),
  ('Picoteo', 'Tiras de pollo', 'Crujientes tiras de pechuga de pollo acompañadas con salsa de mostaza y miel.', 'Única', 5.50, true),
  ('Picoteo', 'Ensalada Factory', 'Lechuga, tomate, cebolla, pimientos fritos, maíz, atún, aguacate, queso fresco, orégano y aceite.', 'Única', 10.00, true),
  ('Picoteo', 'Alitas', 'Seis alitas de pollo con papas fritas acompañadas de alioli.', 'Única', 7.00, true),
  ('Picoteo', 'Chorizos Santa Rosanos', 'Dos chorizos acompañados de ensalada. Elegir entre papas fritas o arepa.', 'Única', 8.00, true),
  ('Picoteo', 'Patacones', 'Elegir pollo o carne. Seis tostadas de plátano, pollo reina, queso fresco, ají, alioli y guacamole.', 'Única', 12.70, true),
  -- Bocadillos
  ('Bocadillos', 'Bocadillo de pollo o carne', 'Elige pollo o carne. Lechuga, tomate, cebolla, jamón, queso amarillo y huevo.', 'Única', 4.90, true),
  ('Bocadillos', 'Bocadillo Reina', 'Lechuga, tomate, cebolla, jamón, bacon, queso fresco y huevo.', 'Única', 5.20, true),
  ('Bocadillos', 'Calamares rebozados', 'Alioli, tomate y cebolla.', 'Única', 4.00, true),
  ('Bocadillos', 'Bocadillo de lomo', 'Lechuga, tomate, cebolla, jamón, queso amarillo y huevo.', 'Única', 4.50, true);

-- Categorías
INSERT INTO public.menu_category (name, sort_order, restaurante_id)
SELECT c.nombre, c.orden, r.id
FROM   carta_categoria c CROSS JOIN public.restaurante r
WHERE  r.slug = 'arepas-factory';

-- Productos (la descripción viene en la primera fila de cada producto)
INSERT INTO public.menu_item (menu_category_id, name, description, restaurante_id, base_price)
SELECT mc.menu_category_id, p.producto,
       max(p.descripcion), mc.restaurante_id, min(p.precio)
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
GROUP  BY mc.menu_category_id, mc.restaurante_id, p.producto;

-- Variantes y precios
INSERT INTO public.menu_variant (menu_item_id, variant_name, price, is_default, restaurante_id)
SELECT mi.menu_item_id, p.variante, p.precio, p.por_defecto, mi.restaurante_id
FROM   carta_producto p
JOIN   public.menu_category mc ON mc.name = p.categoria
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.menu_item mi ON mi.menu_category_id = mc.menu_category_id AND mi.name = p.producto;

-- Extras
INSERT INTO public.extra (name, price, restaurante_id)
SELECT e.nombre, e.precio, r.id
FROM   (VALUES
  ('Extra de tostada', 1.00),
  ('Extra de salsa', 0.80),
  ('Extra de proteína', 2.00),
  ('Extra de bola de helado / topping', 1.00)
) AS e(nombre, precio)
CROSS JOIN public.restaurante r
WHERE  r.slug = 'arepas-factory';

INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
SELECT mc.menu_category_id, x.extra_id
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.extra x ON x.restaurante_id = r.id
WHERE  (x.name = 'Extra de tostada' AND mc.name = 'Desayunos')
   OR  (x.name = 'Extra de salsa' AND mc.name IN
          ('Cachapas', 'Papas', 'Salchipapas', 'Perritos', 'Arepas', 'Sandwich', 'Picoteo', 'Bocadillos'))
   OR  (x.name = 'Extra de proteína' AND mc.name IN
          ('Cachapas', 'Papas', 'Salchipapas', 'Perritos', 'Arepas', 'Sandwich', 'Picoteo', 'Bocadillos'))
   OR  (x.name = 'Extra de bola de helado / topping' AND mc.name = 'Postres');

COMMIT;

SELECT mc.name AS categoria, count(DISTINCT mi.menu_item_id) AS productos, count(mv.*) AS precios
FROM   public.menu_category mc
JOIN   public.restaurante r ON r.id = mc.restaurante_id AND r.slug = 'arepas-factory'
LEFT   JOIN public.menu_item mi ON mi.menu_category_id = mc.menu_category_id
LEFT   JOIN public.menu_variant mv ON mv.menu_item_id = mi.menu_item_id
GROUP  BY mc.name, mc.sort_order ORDER BY mc.sort_order;
