-- =============================================================================
-- Alta de Cafetería Siempre Juntos (piloto con dos locales en Arrecife). Plan Premium.
-- No es una migración: se ejecuta una vez, primero en easyorder_dev y luego en producción.
-- Después, cargar la carta con siempre-juntos-carta.sql.
--
-- Datos publicados por el restaurante (carteles de Instagram, nov 2026) y confirmados con el
-- promotor:
--   Siempre Juntos 2 · Calle Carlos V, 9 (San Francisco Javier) · 605 424 650
--     28.9648707, -13.5669843 · domicilio y recogida
--     Martes a sábado 08:00–00:00 · domingos y festivos 17:00–00:00 · lunes cerrado
--   Siempre Juntos 1 · C. Huelva, 2 (centro) · 828 052 673
--     28.969852, -13.5473588 · solo recogida
--     Martes a sábado 16:00–00:00 · domingos y festivos 17:00–00:00 · lunes cerrado
--   Reparto (desde Siempre Juntos 2): radio 3 km, envío 2 €, mínimo 25 €, 30 min.
--   Pago: efectivo y transferencia.
--
-- Local principal = Siempre Juntos 2: es el que reparte, así que los pedidos que llegan sin
-- local (p. ej. del agente de WhatsApp) van a él. Su horario es el general del restaurante;
-- Siempre Juntos 1 tiene horario propio (sucursal_horario).
-- Todos los valores quedan en la base de datos y se cambian desde allí (o desde el panel).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurante WHERE slug = 'siempre-juntos') THEN
    RAISE EXCEPTION 'Siempre Juntos ya existe (slug siempre-juntos): no se vuelve a crear';
  END IF;
END $$;

-- El trigger de 0003 crea el local principal con estos datos (Siempre Juntos 2).
INSERT INTO public.restaurante
  (nombre, slug, direccion, lat, long, telefono, zona_horaria, payment_methods,
   delivery_enabled, pickup_enabled, delivery_min_order)
VALUES
  ('Cafetería Siempre Juntos', 'siempre-juntos',
   'Calle Carlos V, 9, barrio San Francisco Javier, 35500 Arrecife',
   28.9648707, -13.5669843, '+34605424650', 'Atlantic/Canary',
   '["efectivo", "transferencia"]'::jsonb, true, true, 25);

UPDATE public.sucursal s
SET    nombre = 'Siempre Juntos 2', slug = 'siempre-juntos-2'
FROM   public.restaurante r
WHERE  r.slug = 'siempre-juntos' AND s.restaurante_id = r.id AND s.es_principal;

INSERT INTO public.sucursal
  (restaurante_id, nombre, slug, direccion, lat, lng, telefono, acepta_recogida, acepta_reparto)
SELECT id, 'Siempre Juntos 1', 'siempre-juntos-1', 'C. Huelva, 2, 35500 Arrecife (centro)',
       28.969852, -13.5473588, '+34828052673', true, false
FROM   public.restaurante WHERE slug = 'siempre-juntos';

-- Horario general (= Siempre Juntos 2).
INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
SELECT r.id, d.dia, d.disponible, d.apertura::time, d.cierre::time
FROM   public.restaurante r
CROSS  JOIN (VALUES
  ('Lunes',     false, NULL,    NULL),
  ('Martes',    true,  '08:00', '00:00'),
  ('Miércoles', true,  '08:00', '00:00'),
  ('Jueves',    true,  '08:00', '00:00'),
  ('Viernes',   true,  '08:00', '00:00'),
  ('Sábado',    true,  '08:00', '00:00'),
  ('Domingo',   true,  '17:00', '00:00')
) AS d(dia, disponible, apertura, cierre)
WHERE  r.slug = 'siempre-juntos';

-- Horario propio de Siempre Juntos 1.
INSERT INTO public.sucursal_horario (sucursal_id, dia, disponible, apertura_1, cierre_1)
SELECT s.id, d.dia, d.disponible, d.apertura::time, d.cierre::time
FROM   public.sucursal s
JOIN   public.restaurante r ON r.id = s.restaurante_id
CROSS  JOIN (VALUES
  ('Lunes',     false, NULL,    NULL),
  ('Martes',    true,  '16:00', '00:00'),
  ('Miércoles', true,  '16:00', '00:00'),
  ('Jueves',    true,  '16:00', '00:00'),
  ('Viernes',   true,  '16:00', '00:00'),
  ('Sábado',    true,  '16:00', '00:00'),
  ('Domingo',   true,  '17:00', '00:00')
) AS d(dia, disponible, apertura, cierre)
WHERE  r.slug = 'siempre-juntos' AND s.slug = 'siempre-juntos-1';

-- Reparto: una zona por radio desde Siempre Juntos 2.
INSERT INTO public.delivery_zone
  (zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max,
   restaurante_id, sucursal_id, lat_center, lng_center, radius_km, tipo_tarifa, is_active)
SELECT 'Arrecife (3 km desde Carlos V)', 2.00, 25.00, 30, 30,
       s.restaurante_id, s.id, s.lat, s.lng, 3, 'fija', true
FROM   public.sucursal s
JOIN   public.restaurante r ON r.id = s.restaurante_id
WHERE  r.slug = 'siempre-juntos' AND s.es_principal;

-- Plan Premium (incluye «Varios locales»).
INSERT INTO public.restaurante_plan (restaurante_id, plan_code)
SELECT id, 'premium' FROM public.restaurante WHERE slug = 'siempre-juntos';
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT r.id, pm.modulo_code, 'plan'
FROM   public.restaurante r
JOIN   public.plan_modulo pm ON pm.plan_code = 'premium'
WHERE  r.slug = 'siempre-juntos';

COMMIT;

\echo 'Siempre Juntos creado. Siguiente: siempre-juntos-carta.sql. Pendiente: tiempo de recogida, festivos del año y equipo.'
