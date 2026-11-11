-- =============================================================================
-- 0037 · Documenta la clave soporte_registro_visible
--
-- Componente: base de datos (diccionario config_clave) + apps/api + web
-- Reutiliza:  config_clave (0007) y restaurante_config
-- Tablas:     solo una fila nueva en config_clave (ninguna tabla nueva)
-- Riesgo:     nulo. Sin la clave, el restaurante no ve el registro de accesos de soporte.
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key = 'soporte_registro_visible';
--   DELETE FROM public.config_clave WHERE clave = 'soporte_registro_visible';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('soporte_registro_visible', 'Si Konnecttia deja que el restaurante vea en su panel (Equipo) el registro de los accesos de soporte de solo lectura (true/false). Sin clave: no lo ve.', 'booleano', NULL, 'true', '{panel-easyorder,api-konnecttia}');
