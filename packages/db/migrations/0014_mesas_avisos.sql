-- =============================================================================
-- 0014 · Avisos de tiempo en las mesas
--
-- Dos claves de restaurante_config (se editan en Mesas → Editar mesas → Avisos):
--   mesa_aviso_espera_minutos    un pedido de la mesa lleva más de N min sin servirse
--   mesa_aviso_estancia_minutos  la mesa lleva más de N min ocupada
-- Sin valor no hay aviso: no se cargan valores por defecto.
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key LIKE 'mesa_aviso_%';
--   DELETE FROM public.config_clave WHERE clave LIKE 'mesa_aviso_%';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('mesa_aviso_espera_minutos', 'Minutos sin servir a partir de los que una mesa con pedido en marcha se marca en el plano (aviso de espera). Sin valor: sin aviso.', 'entero', 'minutos', '20', '{panel-easyorder,api-konnecttia}'),
  ('mesa_aviso_estancia_minutos', 'Minutos de ocupación a partir de los que una mesa se marca en el plano (estancia larga). Sin valor: sin aviso.', 'entero', 'minutos', '90', '{panel-easyorder,api-konnecttia}');
