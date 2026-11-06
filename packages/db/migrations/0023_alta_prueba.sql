-- =============================================================================
-- 0023 · Alta autoservicio con prueba (pieza G)
--
-- Componente: apps/api (/alta/*, /plataforma/pruebas, /plataforma/config) + apps/easyorder
--             (/alta, banner y checklist del panel, sección «Pruebas» de /interno)
-- Reutiliza:  plan / plan_modulo / restaurante_plan (0001), plataforma_miembro (0022),
--             pedidos, restaurante
-- Riesgo:     bajo. Tablas, plan y función nuevos; no cambia ningún dato existente. El alta
--             autoservicio queda APAGADA (`alta_autoservicio_activa` = false) hasta que
--             Konnecttia la active desde /interno. Un restaurante sin fila en
--             `restaurante_prueba` (todos los actuales) acepta pedidos como siempre.
-- Fase:       Fase 3
--
-- plan `prueba`
--   Mismos módulos que `premium` (se copian de `plan_modulo` al aplicar esta migración). Al
--   convertir una prueba, el panel interno cambia el plan a `basico` o `premium`.
--
-- plataforma_config
--   Configuración GLOBAL de la plataforma (no por restaurante). Solo estas claves; el valor
--   NULL significa «sin límite» / «sin dato».
--     alta_autoservicio_activa  : boolean. false = /alta cerrada.
--     alta_requiere_aprobacion  : boolean. true = la prueba nace `pendiente` y no acepta
--                                 pedidos hasta que Konnecttia la apruebe.
--     prueba_dias               : entero. Días de prueba desde el alta. NULL = sin límite de días.
--     prueba_max_pedidos        : entero. Pedidos reales de la prueba. NULL = sin límite.
--     alta_contacto_email       : texto. Email que ve quien quiere activar su plan.
--
-- restaurante_prueba
--   Una fila por restaurante creado desde el alta autoservicio. `fin` y `max_pedidos` son
--   copias de la configuración en el momento del alta (cambiar la configuración no altera las
--   pruebas en curso; Konnecttia las amplía una a una). Un usuario solo puede tener una prueba.
--     pendiente  : espera aprobación; no acepta pedidos.
--     activa     : acepta pedidos hasta `fin` o hasta `max_pedidos` pedidos reales.
--     convertida : pasó a un plan de pago; sin límites de prueba.
--     rechazada  : Konnecttia no la aprobó; no acepta pedidos. Los datos se conservan.
--
-- fn_restaurante_acepta_pedidos(p_restaurante_id, p_ahora)
--   false si el restaurante tiene una prueba `pendiente` o `rechazada`, o `activa` vencida
--   (`fin` pasado o pedidos reales >= `max_pedidos`; no cuentan carritos `en_curso`, `expirado`
--   ni `cancelado`). true en cualquier otro caso, incluidos los restaurantes sin prueba.
--   n8n podrá llamarla antes de abrir un pedido por WhatsApp (pendiente, no se toca aquí).
--   `p_ahora` solo existe para poder probar el vencimiento con un reloj fijo.
--
-- Reversión (sin datos de pruebas reales):
--   DROP FUNCTION public.fn_restaurante_acepta_pedidos(integer, timestamptz);
--   DROP TABLE public.restaurante_prueba;
--   DROP TABLE public.plataforma_config;
--   DELETE FROM public.plan_modulo WHERE plan_code = 'prueba';
--   DELETE FROM public.plan WHERE code = 'prueba';
-- =============================================================================

INSERT INTO public.plan (code, nombre) VALUES ('prueba', 'Prueba');

INSERT INTO public.plan_modulo (plan_code, modulo_code)
SELECT 'prueba', modulo_code FROM public.plan_modulo WHERE plan_code = 'premium';

CREATE TABLE public.plataforma_config (
  clave        text        PRIMARY KEY,
  valor        jsonb       NULL,
  descripcion  text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid        NULL
);

COMMENT ON TABLE public.plataforma_config IS
  'Configuración global de la plataforma (alta autoservicio y pruebas). Se edita desde /interno. '
  'valor NULL = sin límite o sin dato.';

INSERT INTO public.plataforma_config (clave, valor, descripcion) VALUES
  ('alta_autoservicio_activa', to_jsonb(false),
   'Si es true, cualquiera puede crear su restaurante de prueba desde /alta. Apagada por defecto.'),
  ('alta_requiere_aprobacion', to_jsonb(false),
   'Si es true, la prueba nace pendiente y no acepta pedidos hasta que Konnecttia la apruebe.'),
  ('prueba_dias', NULL,
   'Días de prueba desde el alta. Sin valor: sin límite de días.'),
  ('prueba_max_pedidos', NULL,
   'Pedidos reales que admite la prueba (no cuentan carritos, expirados ni cancelados). Sin valor: sin límite.'),
  ('alta_contacto_email', NULL,
   'Email que se muestra para activar el plan o cuando el alta está cerrada.');

CREATE TABLE public.restaurante_prueba (
  restaurante_id integer     PRIMARY KEY REFERENCES public.restaurante (id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL,
  email          text        NULL,
  inicio         timestamptz NOT NULL DEFAULT now(),
  fin            timestamptz NULL,
  max_pedidos    integer     NULL CHECK (max_pedidos IS NULL OR max_pedidos > 0),
  estado         text        NOT NULL CHECK (estado IN ('pendiente', 'activa', 'convertida', 'rechazada')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurante_prueba_user_id_key UNIQUE (user_id)
);

COMMENT ON TABLE public.restaurante_prueba IS
  'Prueba gratuita de un restaurante creado desde el alta autoservicio. fin y max_pedidos son '
  'copias de plataforma_config en el momento del alta. Un usuario, una prueba.';

CREATE INDEX ix_restaurante_prueba_estado ON public.restaurante_prueba (estado);

CREATE FUNCTION public.fn_restaurante_acepta_pedidos(
  p_restaurante_id integer,
  p_ahora          timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE p.estado
              WHEN 'activa' THEN
                (p.fin IS NULL OR p.fin > p_ahora)
                AND (p.max_pedidos IS NULL OR
                     (SELECT count(*) FROM public.pedidos o
                      WHERE  o.restaurante_id = p_restaurante_id
                        AND  o.estado NOT IN ('en_curso', 'expirado', 'cancelado')) < p.max_pedidos)
              WHEN 'convertida' THEN true
              ELSE false
            END
     FROM   public.restaurante_prueba p
     WHERE  p.restaurante_id = p_restaurante_id),
    true)
$$;

COMMENT ON FUNCTION public.fn_restaurante_acepta_pedidos(integer, timestamptz) IS
  'false si el restaurante tiene una prueba pendiente, rechazada o activa vencida (por fecha o por '
  'pedidos reales). true en cualquier otro caso. p_ahora solo sirve para pruebas con reloj fijo.';
