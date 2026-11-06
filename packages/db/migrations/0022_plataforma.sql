-- =============================================================================
-- 0022 · Plataforma: equipo de Konnecttia y métodos de pago permitidos (piezas 8 y K)
--
-- Componente: apps/api (rutas /plataforma/*) + apps/easyorder (panel interno, /interno)
-- Reutiliza:  restaurante, auditoria (0001), restaurante_plan / restaurante_modulo (0001)
-- Riesgo:     bajo. Tabla y columna nuevas, sin tocar datos existentes. Sin filas en
--             `plataforma_miembro` nadie entra al panel interno; con `metodos_pago_permitidos`
--             en NULL todo restaurante conserva los métodos que ya tiene.
-- Fase:       Fase 3
--
-- plataforma_miembro
--   Personas del equipo de Konnecttia con acceso al panel interno (ADR 0009). Una persona es un
--   usuario de Supabase Auth (`user_id`). No hay alta desde la interfaz: se inserta por SQL.
--     - 'admin'   : lee y escribe (alta de restaurantes, plan, módulos, métodos de pago).
--     - 'soporte' : solo lee.
--   Ejemplo de alta (sustituir los marcadores; el user_id es el UUID del usuario en Supabase Auth):
--     INSERT INTO public.plataforma_miembro (user_id, email, rol)
--     VALUES ('<uuid-del-usuario-en-supabase>', '<email-de-la-persona>', 'admin');
--   Baja sin borrar historial:
--     UPDATE public.plataforma_miembro SET activo = false WHERE user_id = '<uuid>';
--
-- restaurante.metodos_pago_permitidos
--   NULL  = el restaurante puede activar todos los métodos que existan en el dominio.
--   array = solo esos (p. ej. '["efectivo","tarjeta"]'). Ajustes del restaurante solo ofrece esos
--   y la carta pública nunca muestra uno que no esté permitido. Ejemplo por SQL:
--     UPDATE public.restaurante SET metodos_pago_permitidos = '["efectivo","tarjeta"]'::jsonb
--     WHERE slug = '<slug>';
--
-- auditoria.actor_tipo admite 'plataforma': acciones hechas desde el panel interno.
--
-- Reversión:
--   ALTER TABLE public.auditoria DROP CONSTRAINT auditoria_actor_tipo_check;
--   ALTER TABLE public.auditoria ADD CONSTRAINT auditoria_actor_tipo_check
--     CHECK (actor_tipo IN ('usuario', 'cliente', 'agente', 'sistema', 'konnecttia'));
--   ALTER TABLE public.restaurante DROP COLUMN metodos_pago_permitidos;
--   DROP TABLE public.plataforma_miembro;
-- =============================================================================

CREATE TABLE public.plataforma_miembro (
  user_id     uuid        PRIMARY KEY,
  email       text,
  rol         text        NOT NULL CHECK (rol IN ('admin', 'soporte')),
  activo      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plataforma_miembro IS
  'Equipo de Konnecttia con acceso al panel interno (/plataforma/*). Alta solo por SQL. '
  'admin lee y escribe; soporte solo lee.';

ALTER TABLE public.restaurante
  ADD COLUMN metodos_pago_permitidos jsonb NULL
  CONSTRAINT restaurante_metodos_pago_permitidos_check
  CHECK (metodos_pago_permitidos IS NULL OR jsonb_typeof(metodos_pago_permitidos) = 'array');

COMMENT ON COLUMN public.restaurante.metodos_pago_permitidos IS
  'Métodos de pago que Konnecttia permite activar a este restaurante. NULL = todos los que existan '
  'en el dominio; array JSON = solo esos. payment_methods (lo que el restaurante activa) siempre '
  'queda dentro de este conjunto.';

-- auditoria.actor_tipo: se sustituye el CHECK de 0001 (nombre automático de PostgreSQL).
ALTER TABLE public.auditoria DROP CONSTRAINT auditoria_actor_tipo_check;
ALTER TABLE public.auditoria ADD CONSTRAINT auditoria_actor_tipo_check
  CHECK (actor_tipo IN ('usuario', 'cliente', 'agente', 'sistema', 'konnecttia', 'plataforma'));
