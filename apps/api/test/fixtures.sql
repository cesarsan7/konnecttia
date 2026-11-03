-- Datos sintéticos para las pruebas de la API (nunca datos reales).
INSERT INTO public.restaurante (id, nombre, slug, zona_horaria, payment_methods)
OVERRIDING SYSTEM VALUE VALUES
  (101, 'Cafetería de prueba A', 'prueba-a', 'Atlantic/Canary', '["efectivo", "tarjeta", "transferencia"]'),
  (102, 'Restaurante de prueba B', 'prueba-b', 'Atlantic/Canary', '["efectivo"]');

-- A abierto siempre (apertura manual); B cerrado.
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
  (101, 'is_open_override', 'true'),
  (101, 'surcharge_rules', '[{"label":"Envases","below":25,"amount":1}]'),
  (101, 'pickup_eta_minutes', '15'),
  (102, 'is_open_override', 'false');

INSERT INTO public.menu_category (menu_category_id, name, sort_order, restaurante_id)
OVERRIDING SYSTEM VALUE VALUES
  (1001, 'Salchipapas', 1, 101),
  (2001, 'Pizzas', 1, 102);

INSERT INTO public.menu_item (menu_item_id, menu_category_id, name, restaurante_id, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (1101, 1001, 'Salchimaduro', 101, true),
  (1102, 1001, 'Plato retirado', 101, false),
  (2101, 2001, 'Margarita', 102, true);

INSERT INTO public.menu_variant (menu_variant_id, menu_item_id, variant_name, price, restaurante_id, is_default)
OVERRIDING SYSTEM VALUE VALUES
  (1201, 1101, 'Pequeño', 9.00, 101, true),
  (1202, 1101, 'Grande', 14.00, 101, false),
  (1203, 1102, 'Única', 5.00, 101, true),
  (2201, 2101, 'Mediana', 10.00, 102, true);

INSERT INTO public.extra (extra_id, name, price, restaurante_id)
OVERRIDING SYSTEM VALUE VALUES
  (1301, 'Queso', 2.50, 101),
  (2301, 'Extra de B', 1.00, 102);

INSERT INTO public.menu_category_extra (menu_category_id, extra_id) VALUES (1001, 1301), (2001, 2301);

INSERT INTO public.delivery_zone
  (delivery_zone_id, zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max, restaurante_id, postal_code)
OVERRIDING SYSTEM VALUE VALUES
  (1401, 'Arrecife centro', 2.50, 15.00, 30, 40, 101, '35500');

-- Miembros: propietario y consulta en A; propietario en B.
INSERT INTO public.local_memberships (user_id, restaurante_id, rol) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 101, 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', 101, 'viewer'),
  ('00000000-0000-0000-0000-0000000000b1', 102, 'owner');

INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, r.id
FROM public.local_memberships m
JOIN public.rol r ON r.code = m.rol AND r.restaurante_id IS NULL
WHERE m.restaurante_id IN (101, 102);

INSERT INTO public.restaurante_plan (restaurante_id, plan_code) VALUES (101, 'premium'), (102, 'basico');
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT 101, modulo_code, 'plan' FROM public.plan_modulo WHERE plan_code = 'premium';
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT 102, modulo_code, 'plan' FROM public.plan_modulo WHERE plan_code = 'basico';

-- ---------------------------------------------------------------------------
-- Restaurante C con varios locales (sucursales). La principal la crea el trigger.
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurante (id, nombre, slug, zona_horaria, payment_methods)
OVERRIDING SYSTEM VALUE VALUES
  (103, 'Cafetería con dos locales', 'prueba-c', 'Atlantic/Canary', '["efectivo", "tarjeta"]');

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
  (103, 'is_open_override', 'true');

UPDATE public.sucursal SET nombre = 'Centro', lat = 28.9637, lng = -13.5477
WHERE restaurante_id = 103 AND es_principal;

INSERT INTO public.sucursal (id, restaurante_id, nombre, slug, lat, lng, forzar_abierto) VALUES
  (3002, 103, 'Playa Honda', 'playa-honda', 28.9539, -13.5772, NULL),
  (3003, 103, 'Puerto (cerrado)', 'puerto', 28.9600, -13.5400, false);

-- Un local extra en B, que no tiene el módulo de varios locales: no debe verse.
INSERT INTO public.sucursal (id, restaurante_id, nombre, slug) VALUES (2002, 102, 'Oculto', 'oculto');

INSERT INTO public.menu_category (menu_category_id, name, sort_order, restaurante_id)
OVERRIDING SYSTEM VALUE VALUES (3001, 'Bocadillos', 1, 103);
INSERT INTO public.menu_item (menu_item_id, menu_category_id, name, restaurante_id, is_active)
OVERRIDING SYSTEM VALUE VALUES
  (3201, 3001, 'Bocadillo', 103, true),
  (3202, 3001, 'Croquetas', 103, true);
INSERT INTO public.menu_variant (menu_variant_id, menu_item_id, variant_name, price, restaurante_id, is_default)
OVERRIDING SYSTEM VALUE VALUES
  (3301, 3201, 'Normal', 6.00, 103, true),
  (3302, 3202, 'Ración', 8.00, 103, true);

-- Las croquetas no se sirven en Playa Honda.
INSERT INTO public.sucursal_item_no_disponible (sucursal_id, menu_item_id) VALUES (3002, 3202);

-- Zonas de reparto por coordenadas: cada una de un local. Ambas cubren la zona de Playa Honda.
INSERT INTO public.delivery_zone
  (delivery_zone_id, zone_name, fee, min_order_amount, restaurante_id, lat_center, lng_center, radius_km, sucursal_id)
OVERRIDING SYSTEM VALUE VALUES
  (3101, 'Radio Centro', 2.00, 0, 103, 28.9637, -13.5477, 5, NULL),
  (3102, 'Radio Playa', 1.50, 0, 103, 28.9539, -13.5772, 3, 3002);

-- Propietario (todos los locales) y cajero limitado a Playa Honda.
INSERT INTO public.local_memberships (user_id, restaurante_id, rol) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 103, 'owner'),
  ('00000000-0000-0000-0000-0000000000c2', 103, 'viewer');
INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, r.id FROM public.local_memberships m
JOIN public.rol r ON r.restaurante_id IS NULL
 AND r.code = CASE WHEN m.rol = 'owner' THEN 'owner' ELSE 'staff' END
WHERE m.restaurante_id = 103;
INSERT INTO public.membresia_sucursal (membership_id, sucursal_id)
SELECT id, 3002 FROM public.local_memberships
WHERE user_id = '00000000-0000-0000-0000-0000000000c2';

INSERT INTO public.restaurante_plan (restaurante_id, plan_code) VALUES (103, 'premium');
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT 103, modulo_code, 'plan' FROM public.plan_modulo WHERE plan_code = 'premium';

-- ---------------------------------------------------------------------------
-- Restaurante D: horario real (sin apertura manual) para probar festivos.
-- Martes cerrado; domingo 08:00–00:00. La API de pruebas corre el martes 3/11/2026 a las 13:00.
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurante (id, nombre, slug, zona_horaria, payment_methods)
OVERRIDING SYSTEM VALUE VALUES (104, 'Cafetería de festivos', 'prueba-d', 'Atlantic/Canary', '["efectivo"]');
INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1) VALUES
  (104, 'Martes', false, NULL, NULL),
  (104, 'Domingo', true, '08:00', '00:00');

-- ---------------------------------------------------------------------------
-- Restaurante E: tarifas de reparto (por km con tope y envío gratis; toda la ciudad).
-- Sin tiempos configurados: el tiempo estimado queda «a confirmar» (null).
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurante (id, nombre, slug, zona_horaria, payment_methods)
OVERRIDING SYSTEM VALUE VALUES (105, 'Pizzería de tarifas', 'prueba-e', 'Atlantic/Canary', '["efectivo"]');
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES (105, 'is_open_override', 'true');
UPDATE public.sucursal SET lat = 28.9637, lng = -13.5477 WHERE restaurante_id = 105 AND es_principal;
INSERT INTO public.menu_category (menu_category_id, name, sort_order, restaurante_id)
OVERRIDING SYSTEM VALUE VALUES (5001, 'Pizzas', 1, 105);
INSERT INTO public.menu_item (menu_item_id, menu_category_id, name, restaurante_id, is_active)
OVERRIDING SYSTEM VALUE VALUES (5201, 5001, 'Barbacoa', 105, true);
INSERT INTO public.menu_variant (menu_variant_id, menu_item_id, variant_name, price, restaurante_id, is_default)
OVERRIDING SYSTEM VALUE VALUES (5301, 5201, 'Mediana', 10.00, 105, true);
INSERT INTO public.delivery_zone
  (delivery_zone_id, zone_name, fee, min_order_amount, restaurante_id, lat_center, lng_center, radius_km,
   tipo_tarifa, tarifa_por_km, tarifa_maxima, envio_gratis_desde, cubre_todo)
OVERRIDING SYSTEM VALUE VALUES
  (5101, 'Cerca', 1.50, 0, 105, 28.9637, -13.5477, 2, 'por_km', 0.50, 4.00, 30, false),
  (5102, 'Toda la ciudad', 5.00, 0, 105, NULL, NULL, NULL, 'fija', NULL, NULL, NULL, true);

-- Opciones del modo ocupado (en producción las carga la migración 0009).
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
  (101, 'modo_ocupado_opciones', '[10, 15, 20, 30]'),
  (101, 'modo_ocupado_duracion_minutos', '60'),
  (103, 'modo_ocupado_opciones', '[10, 15, 20, 30]'),
  (103, 'modo_ocupado_duracion_minutos', '60');
