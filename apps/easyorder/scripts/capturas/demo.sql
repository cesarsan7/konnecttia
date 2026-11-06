-- =============================================================================
-- Datos de demostración para las capturas de la ayuda (apps/easyorder/scripts/capturas-ayuda.cjs).
--
-- Se cargan DESPUÉS de las migraciones y de apps/api/test/fixtures.sql, en una base desechable
-- (nunca en producción ni en la de pruebas de otra persona). Todo es sintético: nombres, teléfonos
-- (+34 600 00x xxx) y datos bancarios inventados. Nada procede de ningún restaurante real.
--
-- Restaurante 103 «Cafetería Demo» (slug prueba-c): tres locales, mesas, meseros, un repartidor,
--   clientes, pedidos en todos los estados y un historial de dos semanas para las estadísticas.
-- Restaurante 106 «Bar Nuevo» (slug prueba-t): restaurante recién creado en prueba gratuita, sin
--   carta, para el aviso de la prueba y la lista «Primeros pasos».
-- Las horas de los pedidos son relativas a NOW(): las capturas se ven igual cualquier día.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Restaurante 103: datos, métodos de cobro, horario y reparto
-- ---------------------------------------------------------------------------
UPDATE public.restaurante SET
  nombre = 'Cafetería Demo',
  eslogan = 'Sabor de la isla, a tu mesa',
  descripcion = 'Bocadillos, salchipapas y postres caseros. Pide para recoger o a domicilio.',
  telefono = '928 000 000',
  direccion = 'Calle Ejemplo 12, Arrecife',
  payment_methods = '["efectivo", "tarjeta", "transferencia", "bizum"]',
  metodos_pago_permitidos = '["efectivo", "tarjeta", "transferencia", "bizum"]',
  datos_bancarios = '{"titular": "Cafetería Demo S.L.", "banco": "Banco Ejemplo",
                      "iban": "ES00 0000 0000 0000 0000 0000", "bizum": "600 000 000"}',
  servicio_mesa_habilitado = true
WHERE id = 103;

UPDATE public.sucursal SET direccion = 'Calle Ejemplo 12, Arrecife', telefono = '928 000 000'
WHERE restaurante_id = 103 AND es_principal;
UPDATE public.sucursal SET nombre = 'Puerto', direccion = 'Muelle Chico 3, Arrecife'
WHERE id = 3003;
UPDATE public.sucursal SET direccion = 'Avenida de las Playas 5, Playa Honda' WHERE id = 3002;
UPDATE public.sucursal SET forzar_abierto = true WHERE id = 3003;

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value) VALUES
  (103, 'reparto_foto_entrega', 'opcional'),
  (103, 'mesa_aviso_espera_minutos', '20'),
  (103, 'mesa_aviso_estancia_minutos', '90'),
  (103, 'cola_minutos_por_pedido', '2'),
  (103, 'pickup_eta_minutes', '15'),
  (103, 'delivery_eta_min_minutes', '30'),
  (103, 'delivery_eta_max_minutes', '45')
ON CONFLICT (config_key, restaurante_id) DO UPDATE SET config_value = EXCLUDED.config_value;

INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1, apertura_2, cierre_2)
SELECT 103, d.dia, d.abierto,
       CASE WHEN d.abierto THEN '12:00'::time END, CASE WHEN d.abierto THEN '16:00'::time END,
       CASE WHEN d.abierto AND d.dia NOT IN ('Domingo') THEN '19:30'::time END,
       CASE WHEN d.abierto AND d.dia NOT IN ('Domingo') THEN '23:30'::time END
FROM (VALUES ('Lunes', false), ('Martes', true), ('Miércoles', true), ('Jueves', true),
             ('Viernes', true), ('Sábado', true), ('Domingo', true)) AS d(dia, abierto);

INSERT INTO public.festivo (restaurante_id, fecha, nombre, cerrado) VALUES
  (103, (now() + interval '40 days')::date, 'Día festivo de ejemplo', false),
  (103, (now() + interval '60 days')::date, 'Cierre por vacaciones', true);

INSERT INTO public.franja_pico (restaurante_id, dia, desde, hasta, servicio, minutos_extra) VALUES
  (103, 'Viernes', '20:00', '22:00', 'ambos', 15),
  (103, 'Sábado', '20:00', '22:30', 'ambos', 15);

-- ---------------------------------------------------------------------------
-- Carta
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_category (name, sort_order, restaurante_id, is_active) VALUES
  ('Salchipapas', 2, 103, true), ('Bebidas', 3, 103, true), ('Postres', 4, 103, false);

INSERT INTO public.menu_item (menu_category_id, name, description, restaurante_id, is_active, alergenos, sort_order)
SELECT c.menu_category_id, v.name, v.descr, 103, v.active, v.al::text[], v.ord
FROM (VALUES
  ('Salchipapas', 'Salchipapa clásica', 'Papas fritas, salchicha y salsas de la casa', true, '{huevos,mostaza}', 1),
  ('Salchipapas', 'Salchipapa ranchera', 'Con chorizo, maíz y queso gratinado', true, '{lacteos,huevos,mostaza,sulfitos}', 2),
  ('Salchipapas', 'Salchipapa vegana', NULL, false, NULL, 3),
  ('Bebidas', 'Agua 50 cl', NULL, true, '{}', 1),
  ('Bebidas', 'Refresco de lata', 'Cola, naranja o limón', true, NULL, 2),
  ('Postres', 'Flan casero', 'Con caramelo', true, '{huevos,lacteos}', 1)
) AS v(cat, name, descr, active, al, ord)
JOIN public.menu_category c ON c.name = v.cat AND c.restaurante_id = 103;

INSERT INTO public.menu_variant (menu_item_id, variant_name, price, restaurante_id, is_default, sort_order)
SELECT mi.menu_item_id, v.vn, v.price, 103, v.def, v.ord
FROM (VALUES
  ('Salchipapa clásica', 'Pequeña', 7.50, true, 1), ('Salchipapa clásica', 'Grande', 11.00, false, 2),
  ('Salchipapa ranchera', 'Pequeña', 9.00, true, 1), ('Salchipapa ranchera', 'Grande', 13.50, false, 2),
  ('Salchipapa vegana', 'Única', 9.50, true, 1),
  ('Agua 50 cl', 'Única', 1.50, true, 1), ('Refresco de lata', 'Única', 2.00, true, 1),
  ('Flan casero', 'Única', 3.50, true, 1)
) AS v(item, vn, price, def, ord)
JOIN public.menu_item mi ON mi.name = v.item AND mi.restaurante_id = 103;

INSERT INTO public.extra (name, price, restaurante_id, alergenos, sort_order) VALUES
  ('Queso extra', 1.00, 103, '{lacteos}', 1), ('Chorizo', 1.50, 103, NULL, 2),
  ('Salsa picante', 0, 103, '{}', 3);
INSERT INTO public.menu_category_extra (menu_category_id, extra_id)
SELECT c.menu_category_id, e.extra_id FROM public.menu_category c, public.extra e
WHERE c.restaurante_id = 103 AND e.restaurante_id = 103 AND c.name IN ('Salchipapas', 'Bocadillos');
INSERT INTO public.sucursal_item_no_disponible (sucursal_id, menu_item_id)
SELECT 3002, menu_item_id FROM public.menu_item WHERE name = 'Salchipapa ranchera';
UPDATE public.menu_item SET alergenos = '{gluten,huevos,lacteos}' WHERE menu_item_id = 3202;
UPDATE public.menu_item SET name = 'Bocadillo de tortilla' WHERE menu_item_id = 3201;
UPDATE public.menu_item SET name = 'Croquetas caseras' WHERE menu_item_id = 3202;

-- ---------------------------------------------------------------------------
-- Equipo: nombres, un repartidor y una invitación pendiente
-- ---------------------------------------------------------------------------
UPDATE public.local_memberships SET nombre = 'Elena Ejemplo', apodo = 'Elena'
WHERE user_id = '00000000-0000-0000-0000-0000000000c1' AND restaurante_id = 103;
UPDATE public.local_memberships SET nombre = 'Marcos Demo', email = 'encargado-c@test.local'
WHERE user_id = '00000000-0000-0000-0000-0000000000c3' AND restaurante_id = 103;
UPDATE public.local_memberships SET nombre = 'Sara Prueba', email = 'cajero-c@test.local'
WHERE user_id = '00000000-0000-0000-0000-0000000000c2' AND restaurante_id = 103;
UPDATE public.local_memberships SET email = 'owner-c@test.local'
WHERE user_id = '00000000-0000-0000-0000-0000000000c1' AND restaurante_id = 103;

-- Repartidor (usuario …e1 en la API falsa: token-driver).
INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre, apodo)
VALUES ('00000000-0000-0000-0000-0000000000e1', 103, 'viewer', 'repartidor@test.local', 'Iván Reparto', 'Iván');
INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, r.id FROM public.local_memberships m, public.rol r
WHERE m.user_id = '00000000-0000-0000-0000-0000000000e1' AND m.restaurante_id = 103
  AND r.code = 'driver' AND r.restaurante_id IS NULL;

INSERT INTO public.restaurant_invites (restaurante_id, rol, created_by, email, rol_id, sucursal_ids, expires_at)
SELECT 103, 'staff', '00000000-0000-0000-0000-0000000000c1', 'camarero@test.local', r.id, '{}',
       (now() + interval '5 days') AT TIME ZONE 'UTC'
FROM public.rol r WHERE r.code = 'waiter' AND r.restaurante_id IS NULL;

-- ---------------------------------------------------------------------------
-- Mesas, zonas y meseros (local Centro)
-- ---------------------------------------------------------------------------
INSERT INTO public.zona_mesa (restaurante_id, nombre, orden, sucursal_id)
SELECT 103, v.nombre, v.orden, s.id
FROM (VALUES ('Sala', 1), ('Terraza', 2)) AS v(nombre, orden),
     public.sucursal s WHERE s.restaurante_id = 103 AND s.es_principal;

INSERT INTO public.mesa (restaurante_id, zona_id, numero, nombre, capacidad, sucursal_id)
SELECT 103, z.id, v.numero, v.nombre, v.capacidad, z.sucursal_id
FROM (VALUES ('Sala', 1, 'Mesa 1', 2), ('Sala', 2, 'Mesa 2', 4), ('Sala', 3, 'Mesa 3', 4),
             ('Sala', 4, 'Mesa 4', 6), ('Sala', 5, 'Mesa 5', 2),
             ('Terraza', 6, 'Terraza 1', 4), ('Terraza', 7, 'Terraza 2', 4),
             ('Terraza', 8, 'Terraza 3', 6)) AS v(zona, numero, nombre, capacidad)
JOIN public.zona_mesa z ON z.nombre = v.zona AND z.restaurante_id = 103;

INSERT INTO public.meseros (restaurante_id, nombre, sucursal_id, membership_id)
SELECT 103, v.nombre, s.id, NULL
FROM (VALUES ('Lucía'), ('Pablo')) AS v(nombre),
     public.sucursal s WHERE s.restaurante_id = 103 AND s.es_principal;

-- ---------------------------------------------------------------------------
-- Clientes (usuarios) y un teléfono bloqueado
-- ---------------------------------------------------------------------------
INSERT INTO public.usuarios (restaurante_id, telefono, nombre, direccion_frecuente, acepta_promociones, acepta_promociones_at)
VALUES
  (103, '+34600000101', 'Marta G.', 'Calle del Sol 4, Arrecife', true, now() - interval '30 days'),
  (103, '+34600000102', 'Daniel M.', NULL, false, now() - interval '20 days'),
  (103, '+34600000103', 'Carmen R.', 'Avenida Mar 18, Playa Honda', NULL, NULL),
  (103, '+34600000104', 'Jorge L.', NULL, true, now() - interval '12 days'),
  (103, '+34600000105', 'Noelia S.', 'Plaza Mayor 2, Arrecife', NULL, NULL),
  (103, '+34600000106', 'Raúl P.', NULL, false, now() - interval '9 days'),
  (103, '+34600000107', 'Inés V.', 'Calle Luna 7, Arrecife', true, now() - interval '3 days'),
  (103, '+34600000108', 'Tomás B.', NULL, NULL, NULL),
  (103, '+34600000109', 'Lola F.', 'Calle Faro 1, Puerto', true, now() - interval '40 days'),
  (103, '+34600000110', 'Cliente de ejemplo', NULL, NULL, NULL);

INSERT INTO public.cliente_bloqueado (restaurante_id, telefono, motivo, bloqueado_por)
VALUES (103, public.fn_telefono_normalizado('+34600000110'), 'Pedidos falsos', 'owner-c@test.local');

-- ---------------------------------------------------------------------------
-- Pedidos de hoy: uno o dos en cada estado
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _centro AS
  SELECT id FROM public.sucursal WHERE restaurante_id = 103 AND es_principal;

-- Nuevos
INSERT INTO public.pedidos
  (restaurante_id, telefono, nombre_pedido, items, subtotal, costo_envio, total, tipo_despacho, direccion,
   tiempo_estimado, metodo_pago, estado, estado_pago, canal, sucursal_id, pedido_codigo, created_at, updated_at)
SELECT 103, v.tel, v.nombre, v.items::jsonb, v.subtotal, v.envio, v.subtotal + v.envio, v.tipo, v.dir,
       v.eta, v.pago, v.estado, v.epago, v.canal, v.local, v.codigo,
       (now() AT TIME ZONE 'UTC') - make_interval(mins => v.hace),
       (now() AT TIME ZONE 'UTC') - make_interval(mins => v.hace)
FROM (VALUES
  ('+34600000101', 'Marta G.',
   '[{"item_name":"Salchipapa clásica","variant_name":"Grande","quantity":2,"extras":[{"name":"Queso extra","quantity":2}]},{"item_name":"Refresco de lata","variant_name":"Única","quantity":2}]',
   26.00::numeric, 0::numeric, 'retiro', NULL::text, '15-20 min', 'efectivo', 'recibido', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1041', 2),
  ('+34600000103', 'Carmen R.',
   '[{"item_name":"Salchipapa ranchera","variant_name":"Pequeña","quantity":1},{"item_name":"Flan casero","variant_name":"Única","quantity":1,"nota":"Sin caramelo"}]',
   12.50, 2.00, 'delivery', 'Avenida Mar 18, Playa Honda', '30-45 min', 'tarjeta', 'recibido', 'no_aplica', 'web',
   3002::bigint, 'E-1042', 7),
  ('+34600000107', 'Inés V.',
   '[{"item_name":"Bocadillo de tortilla","variant_name":"Normal","quantity":2},{"item_name":"Agua 50 cl","variant_name":"Única","quantity":2}]',
   15.00, 0, 'retiro', NULL, '15-20 min', 'transferencia', 'pendiente_pago', 'pendiente', 'web',
   (SELECT id FROM _centro), 'E-1043', 9),
  ('+34600000102', 'Daniel M.',
   '[{"item_name":"Salchipapa clásica","variant_name":"Pequeña","quantity":1,"extras":[{"name":"Chorizo","quantity":1}]}]',
   9.00, 0, 'retiro', NULL, '15-20 min', 'bizum', 'pendiente_pago', 'pendiente', 'whatsapp',
   (SELECT id FROM _centro), 'E-1044', 1),
-- En preparación
  ('+34600000104', 'Jorge L.',
   '[{"item_name":"Croquetas caseras","variant_name":"Ración","quantity":2},{"item_name":"Refresco de lata","variant_name":"Única","quantity":2}]',
   20.00, 0, 'retiro', NULL, '15-20 min', 'tarjeta', 'confirmado', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1038', 14),
  ('+34600000105', 'Noelia S.',
   '[{"item_name":"Salchipapa ranchera","variant_name":"Grande","quantity":1},{"item_name":"Salchipapa clásica","variant_name":"Grande","quantity":1}]',
   24.50, 1.50, 'delivery', 'Plaza Mayor 2, Arrecife', '30-45 min', 'efectivo', 'en_preparacion', 'no_aplica', 'whatsapp',
   (SELECT id FROM _centro), 'E-1039', 22),
-- Listos y en reparto
  ('+34600000109', 'Lola F.',
   '[{"item_name":"Salchipapa clásica","variant_name":"Grande","quantity":2}]',
   22.00, 2.00, 'delivery', 'Calle Faro 1, Puerto', '30-45 min', 'efectivo', 'listo', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1036', 31),
  ('+34600000108', 'Tomás B.',
   '[{"item_name":"Bocadillo de tortilla","variant_name":"Normal","quantity":1},{"item_name":"Flan casero","variant_name":"Única","quantity":1}]',
   9.50, 2.00, 'delivery', 'Calle Luna 20, Arrecife', '30-45 min', 'tarjeta', 'en_camino', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1035', 38),
  ('+34600000106', 'Raúl P.',
   '[{"item_name":"Salchipapa ranchera","variant_name":"Pequeña","quantity":1}]',
   9.00, 0, 'retiro', NULL, '15-20 min', 'efectivo', 'listo', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1037', 27),
-- Terminados
  ('+34600000101', 'Marta G.',
   '[{"item_name":"Salchipapa clásica","variant_name":"Pequeña","quantity":2}]',
   15.00, 0, 'retiro', NULL, '15-20 min', 'tarjeta', 'entregado', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1030', 95),
  ('+34600000103', 'Carmen R.',
   '[{"item_name":"Croquetas caseras","variant_name":"Ración","quantity":1}]',
   8.00, 2.00, 'delivery', 'Avenida Mar 18, Playa Honda', '30-45 min', 'efectivo', 'entregado', 'no_aplica', 'whatsapp',
   3002::bigint, 'E-1029', 130),
  ('+34600000104', 'Jorge L.',
   '[{"item_name":"Refresco de lata","variant_name":"Única","quantity":3}]',
   6.00, 0, 'retiro', NULL, '15-20 min', 'efectivo', 'cancelado', 'no_aplica', 'web',
   (SELECT id FROM _centro), 'E-1028', 160)
) AS v(tel, nombre, items, subtotal, envio, tipo, dir, eta, pago, estado, epago, canal, local, codigo, hace);

-- Un justificante de transferencia subido por la clienta (el archivo no existe: solo se cuenta).
INSERT INTO public.pedido_justificante (pedido_id, restaurante_id, ruta, tipo_mime, bytes)
SELECT id, 103, 'demo/justificante-e-1043.png', 'image/png', 48000
FROM public.pedidos WHERE pedido_codigo = 'E-1043' AND restaurante_id = 103;

-- Reparto: dos pedidos asignados al repartidor (uno listo y otro ya en camino).
INSERT INTO public.pedido_reparto (pedido_id, restaurante_id, membership_id, repartidor_email, asignado_por, asignado_at, salida_at)
SELECT p.id, 103, m.id, 'repartidor@test.local', 'owner-c@test.local',
       (now() - interval '25 minutes'),
       CASE WHEN p.estado = 'en_camino' THEN now() - interval '12 minutes' END
FROM public.pedidos p
JOIN public.local_memberships m
  ON m.user_id = '00000000-0000-0000-0000-0000000000e1' AND m.restaurante_id = 103
WHERE p.restaurante_id = 103 AND p.pedido_codigo IN ('E-1036', 'E-1035');

-- Pedidos en mesa: Mesa 2 preparándose, Mesa 4 servida con la cuenta por cobrar, Terraza 1 recién pedida.
INSERT INTO public.pedidos
  (restaurante_id, telefono, nombre_pedido, items, subtotal, total, tipo_despacho, metodo_pago, estado,
   estado_pago, canal, sucursal_id, pedido_codigo, mesa_id, mesero_id, created_at, updated_at)
SELECT 103, '', v.nombre, v.items::jsonb, v.total, v.total, 'mesa', v.pago, v.estado, v.epago, 'mostrador',
       (SELECT id FROM _centro), v.codigo, m.id,
       (SELECT id FROM public.meseros WHERE restaurante_id = 103 AND nombre = v.mesero),
       (now() AT TIME ZONE 'UTC') - make_interval(mins => v.hace),
       (now() AT TIME ZONE 'UTC') - make_interval(mins => v.hace)
FROM (VALUES
  ('Mesa 2', 'Mesa 2', '[{"item_name":"Salchipapa clásica","variant_name":"Grande","quantity":2},{"item_name":"Agua 50 cl","variant_name":"Única","quantity":2}]',
   25.00::numeric, 'efectivo', 'en_preparacion', 'no_aplica', 'E-1040', 'Lucía', 24),
  ('Mesa 4', 'Mesa 4', '[{"item_name":"Croquetas caseras","variant_name":"Ración","quantity":2},{"item_name":"Refresco de lata","variant_name":"Única","quantity":4},{"item_name":"Flan casero","variant_name":"Única","quantity":2}]',
   31.00, 'tarjeta', 'entregado', 'no_aplica', 'E-1033', 'Pablo', 52),
  ('Terraza 1', 'Terraza 1', '[{"item_name":"Bocadillo de tortilla","variant_name":"Normal","quantity":2}]',
   12.00, 'efectivo', 'recibido', 'no_aplica', 'E-1045', 'Lucía', 3)
) AS v(mesa, nombre, items, total, pago, estado, epago, codigo, mesero, hace)
JOIN public.mesa m ON m.nombre = v.mesa AND m.restaurante_id = 103;

UPDATE public.mesa SET ocupada_manual = true,
       ocupada_desde = (now() AT TIME ZONE 'UTC') - interval '55 minutes', mesero_id = (SELECT id FROM public.meseros WHERE nombre = 'Pablo' AND restaurante_id = 103)
WHERE restaurante_id = 103 AND nombre = 'Mesa 4';
UPDATE public.mesa SET ocupada_manual = true,
       ocupada_desde = (now() AT TIME ZONE 'UTC') - interval '26 minutes', mesero_id = (SELECT id FROM public.meseros WHERE nombre = 'Lucía' AND restaurante_id = 103)
WHERE restaurante_id = 103 AND nombre = 'Mesa 2';
UPDATE public.mesa SET ocupada_manual = true,
       ocupada_desde = (now() AT TIME ZONE 'UTC') - interval '4 minutes', mesero_id = (SELECT id FROM public.meseros WHERE nombre = 'Lucía' AND restaurante_id = 103)
WHERE restaurante_id = 103 AND nombre = 'Terraza 1';

-- ---------------------------------------------------------------------------
-- Historial de dos semanas (estadísticas, clientes y tabla de pedidos)
-- ---------------------------------------------------------------------------
INSERT INTO public.pedidos
  (restaurante_id, telefono, nombre_pedido, items, subtotal, costo_envio, total, tipo_despacho, direccion,
   metodo_pago, estado, estado_pago, canal, sucursal_id, pedido_codigo, mesero_id, created_at, updated_at)
SELECT 103,
       '+34600000' || (101 + g % 9),
       (ARRAY['Marta G.', 'Daniel M.', 'Carmen R.', 'Jorge L.', 'Noelia S.', 'Raúl P.', 'Inés V.', 'Tomás B.', 'Lola F.'])[1 + g % 9],
       jsonb_build_array(jsonb_build_object(
         'item_name', (ARRAY['Salchipapa clásica', 'Salchipapa ranchera', 'Bocadillo de tortilla', 'Croquetas caseras'])[1 + g % 4],
         'variant_name', 'Normal', 'quantity', 1 + g % 3)),
       t.base, t.envio, t.base + t.envio,
       t.tipo,
       CASE WHEN t.tipo = 'delivery' THEN 'Calle Ejemplo ' || (1 + g % 40) END,
       t.pago,
       CASE WHEN g % 16 = 0 THEN 'cancelado' ELSE 'entregado' END,
       CASE WHEN t.pago IN ('transferencia', 'bizum') THEN 'pagado' ELSE 'no_aplica' END,
       CASE WHEN t.tipo = 'mesa' THEN 'mostrador' WHEN g % 4 = 0 THEN 'whatsapp' ELSE 'web' END,
       CASE WHEN g % 5 = 0 THEN 3002 ELSE (SELECT id FROM _centro) END,
       'H-' || (1000 + g),
       CASE WHEN t.tipo = 'mesa' THEN (SELECT id FROM public.meseros WHERE restaurante_id = 103 ORDER BY id OFFSET g % 2 LIMIT 1) END,
       t.ts, t.ts
FROM generate_series(1, 90) AS g,
     LATERAL (SELECT
       (ARRAY['retiro', 'delivery', 'mesa', 'retiro', 'delivery'])[1 + g % 5] AS tipo,
       (ARRAY['efectivo', 'tarjeta', 'bizum', 'transferencia', 'tarjeta', 'efectivo'])[1 + g % 6] AS pago,
       (9 + (g * 17) % 23 + 0.5 * (g % 2))::numeric AS base,
       CASE WHEN (ARRAY['retiro', 'delivery', 'mesa', 'retiro', 'delivery'])[1 + g % 5] = 'delivery' THEN 2.00 ELSE 0 END::numeric AS envio,
       date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => 1 + g % 13)
         + make_interval(hours => 12 + (g * 7) % 10, mins => (g * 13) % 60) AS ts
     ) AS t;

-- Los repartos del historial los hizo el repartidor: alimentan «Por repartidor».
INSERT INTO public.pedido_reparto (pedido_id, restaurante_id, membership_id, repartidor_email, asignado_por, asignado_at, salida_at, entregado_at)
SELECT p.id, 103, m.id, 'repartidor@test.local', 'owner-c@test.local',
       p.created_at AT TIME ZONE 'UTC', (p.created_at AT TIME ZONE 'UTC') + interval '10 minutes',
       (p.created_at AT TIME ZONE 'UTC') + interval '32 minutes'
FROM public.pedidos p
JOIN public.local_memberships m
  ON m.user_id = '00000000-0000-0000-0000-0000000000e1' AND m.restaurante_id = 103
WHERE p.restaurante_id = 103 AND p.pedido_codigo LIKE 'H-%' AND p.tipo_despacho = 'delivery' AND p.estado = 'entregado';

-- ---------------------------------------------------------------------------
-- Plataforma: el alta autoservicio está abierta (para capturar /alta)
-- ---------------------------------------------------------------------------
UPDATE public.plataforma_config SET valor = to_jsonb(true) WHERE clave = 'alta_autoservicio_activa';
UPDATE public.plataforma_config SET valor = to_jsonb(14) WHERE clave = 'prueba_dias';
UPDATE public.plataforma_config SET valor = to_jsonb(50) WHERE clave = 'prueba_max_pedidos';
UPDATE public.plataforma_config SET valor = to_jsonb('hola@konnecttia.com'::text) WHERE clave = 'alta_contacto_email';

-- ---------------------------------------------------------------------------
-- Restaurante 106 «Bar Nuevo»: recién creado, en prueba gratuita y sin carta
-- ---------------------------------------------------------------------------
INSERT INTO public.restaurante (id, nombre, slug, zona_horaria, payment_methods)
OVERRIDING SYSTEM VALUE VALUES (106, 'Bar Nuevo', 'prueba-t', 'Atlantic/Canary', '["efectivo", "tarjeta"]');
INSERT INTO public.restaurante_plan (restaurante_id, plan_code) VALUES (106, 'prueba');
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT 106, modulo_code, 'plan' FROM public.plan_modulo WHERE plan_code = 'prueba';
INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email, nombre)
VALUES ('00000000-0000-0000-0000-0000000000f1', 106, 'owner', 'alta1@test.local', 'Ana Nueva');
INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, r.id FROM public.local_memberships m, public.rol r
WHERE m.restaurante_id = 106 AND r.code = 'owner' AND r.restaurante_id IS NULL;
INSERT INTO public.restaurante_prueba (restaurante_id, user_id, email, inicio, fin, max_pedidos, estado)
VALUES (106, '00000000-0000-0000-0000-0000000000f1', 'alta1@test.local',
        now() - interval '3 days', now() + interval '11 days', 50, 'activa');

DROP TABLE _centro;
