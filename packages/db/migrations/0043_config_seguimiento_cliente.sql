-- =============================================================================
-- 0043 · Configuración: acciones del cliente en el enlace de seguimiento del pedido
--
-- Componente: base de datos (API pública del seguimiento y Ajustes del restaurante)
-- Reutiliza:  restaurante_config / config_clave
-- Tablas:     sin cambios de estructura; solo claves de configuración nuevas
-- Riesgo:     bajo. Sin clave, o con cualquier valor distinto de «false», la acción sigue permitida:
--             no cambia nada para los restaurantes que no las configuran.
-- MVP:        sí
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key IN
--     ('pedido_cancelacion_cliente', 'pedido_novedades_cliente');
--   DELETE FROM public.config_clave WHERE clave IN
--     ('pedido_cancelacion_cliente', 'pedido_novedades_cliente');
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('pedido_cancelacion_cliente', 'El cliente puede cancelar su pedido desde el enlace de seguimiento mientras el local no lo ha aceptado (true/false). Sin clave: sí. Con false, el seguimiento no ofrece cancelar y la API lo rechaza.', 'booleano', NULL, 'false', '{panel-easyorder,api-konnecttia}'),
  ('pedido_novedades_cliente', 'El cliente puede enviar novedades (incidencias: falta algo, llegó mal, retraso) desde el enlace de seguimiento (true/false). Sin clave: sí. Con false, el seguimiento no las ofrece y la API las rechaza.', 'booleano', NULL, 'false', '{panel-easyorder,api-konnecttia}');
