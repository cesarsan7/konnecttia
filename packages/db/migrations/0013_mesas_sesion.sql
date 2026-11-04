-- =============================================================================
-- 0013 · Sesión de mesa y búsqueda de pedidos por teléfono
--
-- mesa.ocupada_desde: momento (UTC) en que se sentaron los clientes. La mesa sigue ocupada
-- hasta que el equipo la libera desde el panel, aunque sus pedidos ya estén entregados (los
-- clientes siguen sentados y pagan al final). Los pedidos de la mesa desde ese momento forman
-- su cuenta. NULL = mesa libre (o marcada antes de esta migración sin hora).
--
-- config_clave: lookup_pedidos_limit pasa a usarla también la API de Konnecttia (pedido manual
-- del panel, «Repetir pedido»).
--
-- Reversión:
--   ALTER TABLE public.mesa DROP COLUMN ocupada_desde;
--   UPDATE public.config_clave SET usado_por = array_remove(usado_por, 'api-konnecttia')
--   WHERE  clave = 'lookup_pedidos_limit';
-- =============================================================================

ALTER TABLE public.mesa ADD COLUMN ocupada_desde timestamp without time zone NULL;

COMMENT ON COLUMN public.mesa.ocupada_desde IS
  'Inicio (UTC) de la ocupación actual. Se fija al ocupar la mesa o al tomar su primer pedido y se borra al liberarla.';

-- Mesas ya marcadas como ocupadas: la ocupación empieza ahora.
UPDATE public.mesa SET ocupada_desde = (now() AT TIME ZONE 'UTC') WHERE ocupada_manual;

UPDATE public.config_clave
SET    usado_por = array_append(usado_por, 'api-konnecttia')
WHERE  clave = 'lookup_pedidos_limit' AND NOT ('api-konnecttia' = ANY (usado_por));
