-- =============================================================================
-- 0049 · Purga de las claves de idempotencia de WhatsApp (whatsapp_evento)
-- Componente: API del agente (mantenimiento, cada pocos minutos).
-- Reutiliza:  whatsapp_evento (0038).
-- Tablas:     ninguna nueva; solo GRANT DELETE al rol de la API.
-- Riesgo:     bajo. La tabla solo guarda claves de entregas ya procesadas, sin datos del cliente;
--             se borran las de más de 7 días (un reintento de Kapso nunca llega tan tarde).
--
-- Reversión:
--   REVOKE DELETE ON public.whatsapp_evento FROM konnecttia_app;
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT DELETE ON public.whatsapp_evento TO konnecttia_app;
  END IF;
END $$;
