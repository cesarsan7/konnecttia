-- =============================================================================
-- 0041 · Agente de WhatsApp: permisos para derivar a una persona y leer preguntas frecuentes
--
-- Componente: base de datos (API /agente: POST conversacion/derivar, GET preguntas)
-- Reutiliza:  escalaciones y faqs (baseline), whatsapp_conversacion (0038, pausa 0039)
-- Tablas:     sin cambios de estructura; solo permisos de konnecttia_app
-- Riesgo:     bajo. Solo concede INSERT/UPDATE/SELECT al rol de la API sobre tablas existentes;
--             el aislamiento por restaurante lo hace la API (restaurante_id del canal).
-- MVP:        sí
--
-- Reversión:
--   REVOKE INSERT, UPDATE ON public.whatsapp_conversacion FROM konnecttia_app;
--   REVOKE INSERT ON public.escalaciones FROM konnecttia_app;
--   REVOKE USAGE ON SEQUENCE public.escalaciones_id_seq FROM konnecttia_app;
--   REVOKE SELECT ON public.faqs FROM konnecttia_app;
-- =============================================================================

-- Permisos explícitos (no dependen de los permisos por defecto dados al crear el rol).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT INSERT, UPDATE ON public.whatsapp_conversacion TO konnecttia_app;
    GRANT INSERT ON public.escalaciones TO konnecttia_app;
    GRANT USAGE, SELECT ON SEQUENCE public.escalaciones_id_seq TO konnecttia_app;
    GRANT SELECT ON public.faqs TO konnecttia_app;
  END IF;
END $$;
