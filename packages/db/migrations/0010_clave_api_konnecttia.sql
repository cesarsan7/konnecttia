-- =============================================================================
-- 0010 · URL de la API de Konnecttia para n8n
--
-- El subflujo Despacho de n8n (agente de WhatsApp) pide a la API la cotización de recogida o
-- reparto (POST /public/<slug>/cotizacion), para aplicar las mismas zonas, tarifas, mínimos,
-- tiempos y modo ocupado que la web. Cada base guarda la URL de su propio entorno:
--   staging: http://n8nlearning_konnecttia-api:3001  (red interna de EasyPanel)
-- No se cargan valores: dependen del entorno y se añaden al dar de alta el restaurante.
-- Reversión: DELETE FROM public.config_clave WHERE clave = 'api_konnecttia_url';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('api_konnecttia_url', 'URL base de la API de Konnecttia vista desde n8n (sin barra final). La usa el subflujo Despacho para cotizar recogida y reparto. Sin valor: Despacho deriva a una persona.', 'url', NULL, 'http://n8nlearning_konnecttia-api:3001', '{n8n-despacho}');
