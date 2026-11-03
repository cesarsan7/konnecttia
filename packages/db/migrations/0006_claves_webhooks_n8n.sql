-- =============================================================================
-- 0006 · Claves de webhooks de n8n con nombres que dicen lo que son
--
-- El entorno (dev / prod) lo marca la base de datos, no el nombre de la clave:
--   n8n_webhook_avisos   URL del webhook de avisos de estado del pedido
--                        (antes chatwoot_webhook_prod -> .../webhook/notificacion-estado-pedido)
--   n8n_webhook_entrada  URL del webhook de entrada de mensajes de Chatwoot (chatwootnew)
--                        (antes chatwoot_webhook_test, que guardaba su URL de PRUEBA de n8n;
--                        aquí se guarda la de producción: /webhook-test/ -> /webhook/)
--
-- No se borra nada: el dashboard actual de EasyOrder sigue leyendo y escribiendo las claves
-- chatwoot_webhook_*. Se eliminarán cuando ese dashboard se retire (migración aparte).
-- Reversión: DELETE FROM public.restaurante_config
--            WHERE config_key IN ('n8n_webhook_avisos', 'n8n_webhook_entrada');
-- =============================================================================

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
SELECT restaurante_id, 'n8n_webhook_avisos', trim(config_value),
       'URL del webhook de n8n que envía al cliente los avisos de estado del pedido.'
FROM   public.restaurante_config
WHERE  config_key = 'chatwoot_webhook_prod'
  AND  trim(config_value) <> ''
ON CONFLICT (config_key, restaurante_id) DO NOTHING;

INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
SELECT restaurante_id, 'n8n_webhook_entrada',
       replace(trim(config_value), '/webhook-test/', '/webhook/'),
       'URL del webhook de n8n que recibe los mensajes de Chatwoot (agente de WhatsApp).'
FROM   public.restaurante_config
WHERE  config_key = 'chatwoot_webhook_test'
  AND  trim(config_value) <> ''
ON CONFLICT (config_key, restaurante_id) DO NOTHING;
