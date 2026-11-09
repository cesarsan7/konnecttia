-- =============================================================================
-- Alta de Arepa's Factory (un local en Arrecife). Plan Premium.
-- No es una migración: se ejecuta una vez, primero en restaurante_staging y, con aprobación
-- del promotor, en producción. Después, cargar la carta con arepas-factory-carta.sql.
--
-- Datos de origen (fotos del folleto y del Instagram @factory.arepas, nov 2026; Google Maps y
-- respuestas del promotor, 8/11/2026):
--   Arepa's Factory · Calle Polca, 16, Argana Alta, 35500 Arrecife
--     28.9780689, -13.5697294 · teléfonos 928 139 721 (fijo) y 683 113 935 (móvil)
--     Lunes a viernes 08:00–23:00 · sábados y domingos 09:00–23:00 · festivos 09:00–23:00
--     (la cocina cierra 30 min antes; desayunos 08:00–12:00; reparto en el folleto 18:00–22:30)
--   Recogida: 30 min. Reparto: radio 5 km (toda Arrecife), envío 2 €, mínimo 30 €, 30 min.
--   Pago: efectivo y tarjeta.
--
-- VALORES POR DEFECTO, a sustituir por los reales (el promotor lo pidió así):
--   * Reparto: radio 5 km, tarifa 2 €, mínimo 30 € y 30 min. El radio de 5 km es una
--     aproximación de «toda Arrecife».
--   * Teléfono del restaurante: se usa el móvil (683 113 935), el que atiende WhatsApp y
--     llamadas; confirmar cuál debe mostrarse.
--   * Reparto solo de 18:00 a 22:30 según el folleto: el sistema no tiene horario de reparto
--     separado; hoy el reparto está disponible durante todo el horario de apertura.
--   * Festivos: el sistema aplica a un festivo el horario del domingo (09:00–23:00, igual que
--     lo indicado). Las fechas de festivos del año se cargan en la tabla `festivo` cuando se
--     tengan.
--   * Cierre de cocina (30 min antes) y horario de desayunos: no modelados, pendientes.
--
-- Propietario provisional: el acceso se concede por el UUID de Supabase Auth, no por email.
-- Con el UUID de la cuenta, ejecutar el script así:
--   psql ... -v owner_user_id='<uuid>' -v owner_email='<email>' -f arepas-factory.sql
-- Sin esas variables, el restaurante se crea sin propietario y se añade después.
--
-- Todos los valores quedan en la base de datos y se cambian desde allí o desde el panel.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.restaurante WHERE slug = 'arepas-factory') THEN
    RAISE EXCEPTION 'Arepa''s Factory ya existe (slug arepas-factory): no se vuelve a crear';
  END IF;
END $$;

-- El trigger de 0003 crea el local principal con estos datos.
INSERT INTO public.restaurante
  (nombre, slug, direccion, lat, long, telefono, zona_horaria, payment_methods,
   delivery_enabled, pickup_enabled, delivery_min_order)
VALUES
  ('Arepa''s Factory', 'arepas-factory',
   'Calle Polca, 16, Argana Alta, 35500 Arrecife',
   28.9780689, -13.5697294, '+34683113935', 'Atlantic/Canary',
   '["efectivo", "tarjeta"]'::jsonb, true, true, 30);

UPDATE public.sucursal s
SET    nombre = 'Arepa''s Factory', slug = 'arepas-factory',
       acepta_recogida = true, acepta_reparto = true
FROM   public.restaurante r
WHERE  r.slug = 'arepas-factory' AND s.restaurante_id = r.id AND s.es_principal;

-- Horario general. Los festivos usan el del domingo (ver 0004).
INSERT INTO public.horarios (restaurante_id, dia, disponible, apertura_1, cierre_1)
SELECT r.id, d.dia, true, d.apertura::time, d.cierre::time
FROM   public.restaurante r
CROSS  JOIN (VALUES
  ('Lunes',     '08:00', '23:00'),
  ('Martes',    '08:00', '23:00'),
  ('Miércoles', '08:00', '23:00'),
  ('Jueves',    '08:00', '23:00'),
  ('Viernes',   '08:00', '23:00'),
  ('Sábado',    '09:00', '23:00'),
  ('Domingo',   '09:00', '23:00')
) AS d(dia, apertura, cierre)
WHERE  r.slug = 'arepas-factory';

-- Tiempo de recogida (la clave está documentada en config_clave, migración 0007).
INSERT INTO public.restaurante_config (config_key, config_value, description, restaurante_id)
SELECT 'pickup_eta_minutes', '30', 'Minutos hasta que un pedido para recoger está listo', r.id
FROM   public.restaurante r WHERE r.slug = 'arepas-factory';

-- Reparto: una zona por radio desde el local (valores por defecto, ver cabecera).
INSERT INTO public.delivery_zone
  (zone_name, fee, min_order_amount, estimated_minutes_min, estimated_minutes_max,
   restaurante_id, sucursal_id, lat_center, lng_center, radius_km, tipo_tarifa, is_active)
SELECT 'Arrecife (5 km desde Calle Polca)', 2.00, 30.00, 30, 30,
       s.restaurante_id, s.id, s.lat, s.lng, 5, 'fija', true
FROM   public.sucursal s
JOIN   public.restaurante r ON r.id = s.restaurante_id
WHERE  r.slug = 'arepas-factory' AND s.es_principal;

-- Plan Premium.
INSERT INTO public.restaurante_plan (restaurante_id, plan_code)
SELECT id, 'premium' FROM public.restaurante WHERE slug = 'arepas-factory';
INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT r.id, pm.modulo_code, 'plan'
FROM   public.restaurante r
JOIN   public.plan_modulo pm ON pm.plan_code = 'premium'
WHERE  r.slug = 'arepas-factory';

-- Propietario provisional (solo si se pasan las variables de psql).
\if :{?owner_user_id}
INSERT INTO public.local_memberships (user_id, restaurante_id, rol, email)
SELECT :'owner_user_id'::uuid, r.id, 'owner', :'owner_email'
FROM   public.restaurante r WHERE r.slug = 'arepas-factory';

INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, ro.id
FROM   public.local_memberships m
JOIN   public.restaurante r ON r.id = m.restaurante_id AND r.slug = 'arepas-factory'
JOIN   public.rol ro ON ro.code = 'owner' AND ro.restaurante_id IS NULL
WHERE  m.user_id = :'owner_user_id'::uuid;
\endif

COMMIT;

\echo 'Arepa''s Factory creado. Siguiente: arepas-factory-carta.sql. Pendiente: valores reales de reparto, festivos del año, propietario y equipo.'
