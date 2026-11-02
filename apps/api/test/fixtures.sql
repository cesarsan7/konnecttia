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
