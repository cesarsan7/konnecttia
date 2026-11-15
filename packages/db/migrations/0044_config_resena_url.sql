-- =============================================================================
-- 0044 · Configuración: enlace de reseñas de Google del restaurante
--
-- Componente: base de datos (API pública del seguimiento y Ajustes del restaurante)
-- Reutiliza:  restaurante_config / config_clave
-- Tablas:     sin cambios de estructura; una clave de configuración nueva
-- Riesgo:     bajo. Sin clave no se muestra nada. La API solo acepta https de Google Maps o de
--             reseñas de Google. No se guardan reseñas en Konnecttia, solo se enlaza.
-- MVP:        sí
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key = 'resena_url';
--   DELETE FROM public.config_clave WHERE clave = 'resena_url';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('resena_url', 'Enlace de reseñas del restaurante en Google (https de Google Maps o de reseñas de Google). Con valor y el pedido entregado, el seguimiento del cliente enseña «Déjanos tu reseña». Sin clave, no se ofrece.', 'texto', NULL, 'https://maps.app.goo.gl/abc123', '{panel-easyorder,api-konnecttia}');
