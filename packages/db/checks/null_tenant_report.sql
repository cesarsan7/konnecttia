-- Informe de solo lectura: filas sin restaurante_id. Ejecutar en producción ANTES de
-- aplicar proposed/0100_tenant_not_null.sql. Todas las cifras deben ser 0.
SELECT 'pedidos' AS tabla, count(*) AS sin_restaurante FROM public.pedidos WHERE restaurante_id IS NULL
UNION ALL SELECT 'usuarios', count(*) FROM public.usuarios WHERE restaurante_id IS NULL
UNION ALL SELECT 'contexto', count(*) FROM public.contexto WHERE restaurante_id IS NULL
UNION ALL SELECT 'faqs', count(*) FROM public.faqs WHERE restaurante_id IS NULL
UNION ALL SELECT 'horarios', count(*) FROM public.horarios WHERE restaurante_id IS NULL
UNION ALL SELECT 'config_operativa', count(*) FROM public.config_operativa WHERE restaurante_id IS NULL
UNION ALL SELECT 'escalaciones', count(*) FROM public.escalaciones WHERE restaurante_id IS NULL
UNION ALL SELECT 'restaurante_mesas', count(*) FROM public.restaurante_mesas WHERE restaurante_id IS NULL
UNION ALL SELECT 'n8n_chat_histories', count(*) FROM public.n8n_chat_histories WHERE restaurante_id IS NULL;
