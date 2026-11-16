-- =============================================================================
-- 0048 · Avisos de estado del pedido por WhatsApp (módulo whatsapp.agent_pro)
-- Componente: API del agente (mantenimiento) + flujo n8n «[Agente] Mantenimiento».
-- Reutiliza:  outbox_evento (0002; solo se lee), agente_carrito (0040), pedido_estado_log.
-- Tablas:     nueva aviso_whatsapp (un registro por evento avisado, para no repetir).
-- Riesgo:     bajo. Tabla nueva; el outbox y su worker de email no se tocan.
-- Alcance:    MVP (premium).
--
-- Reversión:
--   DROP TABLE public.aviso_whatsapp;
-- =============================================================================

CREATE TABLE public.aviso_whatsapp (
  evento_id       bigint      PRIMARY KEY REFERENCES public.outbox_evento (id) ON DELETE CASCADE,
  restaurante_id  int4        NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ix_aviso_whatsapp_restaurante ON public.aviso_whatsapp (restaurante_id, created_at DESC);

COMMENT ON TABLE public.aviso_whatsapp IS
  'Eventos de cambio de estado ya avisados al cliente por WhatsApp (idempotencia del mantenimiento del agente).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT SELECT, INSERT ON public.aviso_whatsapp TO konnecttia_app;
    GRANT SELECT ON public.outbox_evento, public.pedido_estado_log TO konnecttia_app;
  END IF;
END $$;
