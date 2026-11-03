-- =============================================================================
-- Alta de Cafetería Siempre Juntos (piloto con dos locales en Arrecife).
-- No es una migración: se ejecuta una vez, primero en easyorder_dev y luego en producción.
--
-- Datos confirmados por el promotor (nov 2026):
--   Local 1 · Siempre Juntos 1 · C. Huelva, 2, 35500 Arrecife · 828 052 673 · 28.969852, -13.5473588
--   Local 2 · Siempre Juntos 2 · Calle Carlos V, 9 (barrio San Francisco Javier), Arrecife · 605 424 650
--   Horario de ambos: martes a sábado 16:00–00:00; domingos y festivos 08:00–00:00; lunes cerrado.
--   Reparto: Arrecife.
--
-- Datos que faltan y se pasan como parámetros (el script se detiene si falta alguno):
--   lat2, lng2  coordenadas del local 2
--   envio       precio del envío en euros (p. ej. 2.50)
--   minimo      pedido mínimo para reparto en euros
--   eta_min, eta_max  minutos de entrega estimados
--   pagos       métodos de pago aceptados, JSON (p. ej. '["efectivo","tarjeta","bizum"]')
--   radio       radio de reparto de cada local en km (propuesta: 3)
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v lat2=28.97 -v lng2=-13.56 -v envio=2.50 -v minimo=15 -v eta_min=30 -v eta_max=45 \
--     -v radio=3 -v "pagos=[\"efectivo\",\"tarjeta\"]" -f packages/db/seeds/siempre-juntos.sql
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?lat2} \else \echo 'Falta -v lat2' \quit \endif
\if :{?lng2} \else \echo 'Falta -v lng2' \quit \endif
\if :{?envio} \else \echo 'Falta -v envio' \quit \endif
\if :{?minimo} \else \echo 'Falta -v minimo' \quit \endif
\if :{?eta_min} \else \echo 'Falta -v eta_min' \quit \endif
\if :{?eta_max} \else \echo 'Falta -v eta_max' \quit \endif
\if :{?radio} \else \echo 'Falta -v radio' \quit \endif
\if :{?pagos} \else \echo 'Falta -v pagos' \quit \endif

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurante WHERE slug = 'siempre-juntos') THEN
    RAISE EXCEPTION 'Siempre Juntos ya existe (slug siempre-juntos): no se vuelve a crear';
  END IF;
END $$;

-- El trigger de 0003 crea el local principal con estos datos (local 1).
INSERT INTO public.restaurante
  (nombre, slug, direccion, lat, long, telefono, zona_horaria, payment_methods,
   delivery_enabled, pickup_enabled, delivery_min_order)
VALUES
  ('Cafetería Siempre Juntos', 'siempre-juntos', 'C. Huelva, 2, 35500 Arrecife, Las Palmas',
   28.969852, -13.5473588, '+34828052673', 'Atlantic/Canary', :'pagos'::jsonb,
   true, true, :minimo);

UPDATE public.sucursal s
SET    nombre = 'Siempre Juntos 1', slug = 'siempre-juntos-1'
FROM   public.restaurante r
WHERE  r.slug = 'siempre-juntos' AND s.restaurante_id = r.id AND s.es_principal;

INSERT INTO public.sucursal (restaurante_id, nombre, slug, direccion, lat, lng, telefono)
SELECT id, 'Siempre Juntos 2', 'siempre-juntos-2',
       'Calle Carlos V, 9, barrio San Francisco Javier, Arrecife', :lat2, :lng2, '+34605424650'
FROM   public.restaurante WHERE slug = 'siempre-juntos';

-- Horario general (ambos locales iguales: no hace falta sucursal_horario).
INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
SELECT r.id, d.dia, d.disponible, d.apertura::time, d.cierre::time
FROM   public.restaurante r
CROSS  JOIN (VALUES
  ('Lunes',     false, NULL,    NULL),
  ('Martes',    true,  '16:00', '00:00'),
  ('Miércoles', true,  '16:00', '00:00'),
  ('Jueves',    true,  '16:00', '00:00'),
  ('Viernes',   true,  '16:00', '00:00'),
  ('Sábado',    true,  '16:00', '00:00'),
  ('Domingo',   true,  '08:00', '00:00')
) AS d(dia, disponible, apertura, cierre)
WHERE  r.slug = 'siempre-juntos';

-- Una zona de reparto por local, por radio: reparte el local abierto más cercano al cliente.
INSERT INTO public.delivery_zone
  (zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max,
   restaurante_id, sucursal_id, lat_center, lng_center, radius_km, is_active)
SELECT 'Arrecife · ' || s.nombre, :envio, :minimo, :eta_min, :eta_max,
       s.restaurante_id, s.id, s.lat, s.lng, :radio, true
FROM   public.sucursal s
JOIN   public.restaurante r ON r.id = s.restaurante_id
WHERE  r.slug = 'siempre-juntos';

-- Plan premium: incluye «Varios locales». Decisión comercial a confirmar.
INSERT INTO public.restaurante_plan (restaurante_id, plan_code)
SELECT id, 'premium' FROM public.restaurante WHERE slug = 'siempre-juntos';
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT r.id, pm.modulo_code, 'plan'
FROM   public.restaurante r
JOIN   public.plan_modulo pm ON pm.plan_code = 'premium'
WHERE  r.slug = 'siempre-juntos';

COMMIT;

\echo 'Siempre Juntos creado. Pendiente: carta, festivos del año, miembros del equipo.'
