-- =============================================================================
-- 0045 · Permisos para purgar pedidos de prueba desde el panel interno
-- Componente: panel interno (endpoint purgar-pedidos, solo staging).
-- Reutiliza:  agente_carrito, escalaciones, whatsapp_conversacion, n8n_chat_histories.
-- Tablas:     ninguna nueva; solo GRANT DELETE al rol de la API.
-- Riesgo:     bajo. La API solo permite la purga si PURGA_PEDIDOS_PERMITIDA=true (staging).
--             DELETE en estas tablas ya se ejecutaba en cascada al borrar un restaurante.
-- Alcance:    MVP.
--
-- Reversión:
--   REVOKE DELETE ON public.agente_carrito, public.escalaciones,
--     public.whatsapp_conversacion, public.n8n_chat_histories FROM konnecttia_app;
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT DELETE ON public.agente_carrito TO konnecttia_app;
    GRANT DELETE ON public.escalaciones TO konnecttia_app;
    GRANT DELETE ON public.whatsapp_conversacion TO konnecttia_app;
    GRANT DELETE ON public.n8n_chat_histories TO konnecttia_app;
  END IF;
END
$$;
