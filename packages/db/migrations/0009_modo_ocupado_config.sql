-- =============================================================================
-- 0009 · Opciones del «modo ocupado» configurables por restaurante
--
-- El panel ofrece los minutos extra de modo_ocupado_opciones durante
-- modo_ocupado_duracion_minutos. Sin estas claves, el panel no muestra el botón.
-- Se cargan los valores que ya usaba el panel (+10, +20, +30 min durante 60 min) en los
-- restaurantes existentes; cada restaurante puede cambiarlos después.
-- Reversión: DELETE FROM public.restaurante_config WHERE config_key LIKE 'modo_ocupado_%';
--            DELETE FROM public.config_clave WHERE clave LIKE 'modo_ocupado_%';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('modo_ocupado_opciones', 'Minutos extra que ofrece el botón «Modo ocupado» del panel (lista JSON de enteros entre 1 y 240). Sin valor: el panel no muestra el botón.', 'json', 'minutos', '[10, 20, 30]', '{panel-easyorder,api-konnecttia}'),
  ('modo_ocupado_duracion_minutos', 'Cuánto dura el modo ocupado antes de apagarse solo (entre 5 y 720).', 'entero', 'minutos', '60', '{panel-easyorder,api-konnecttia}');

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
SELECT r.id, v.clave, v.valor, v.descripcion
FROM   public.restaurante r
CROSS  JOIN (VALUES
  ('modo_ocupado_opciones', '[10, 20, 30]', 'Minutos extra del botón «Modo ocupado» del panel'),
  ('modo_ocupado_duracion_minutos', '60', 'Duración del modo ocupado (minutos)')
) AS v(clave, valor, descripcion)
ON CONFLICT (config_key, restaurante_id) DO NOTHING;
