-- =============================================================================
-- 0035 · Documenta la clave de configuración sonidos_tablero
--
-- Componente: base de datos (diccionario config_clave) + apps/api + web (Ajustes → Sonidos)
-- Reutiliza:  config_clave (0007) y restaurante_config
-- Tablas:     solo una fila nueva en config_clave (ninguna tabla nueva)
-- Riesgo:     nulo. Sin la clave en un restaurante, suena solo el pedido nuevo, como siempre.
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key = 'sonidos_tablero';
--   DELETE FROM public.config_clave WHERE clave = 'sonidos_tablero';
-- =============================================================================

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('sonidos_tablero', 'Sonido del tablero por evento (JSON): nuevo, confirmado, en_preparacion, listo, en_camino, entregado, cancelado. Valores: ninguno, campana, timbre, arpegio, alerta, suave. Sin clave: solo suena el pedido nuevo (campana).', 'json', NULL, '{"nuevo":"campana","listo":"arpegio"}', '{panel-easyorder,api-konnecttia}');
