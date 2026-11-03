-- =============================================================================
-- 0007 · Diccionario de claves de configuración (restaurante_config)
--
-- Cada clave queda documentada: qué significa, tipo, unidad, quién la usa y su estado.
-- Estándar para claves nuevas: español, snake_case. Las claves en inglés conservan su nombre
-- mientras las usen n8n o el dashboard antiguo; `nombre_propuesto` indica el nombre en español
-- al que se renombrarán cuando esos consumidores se actualicen (migración aparte, primero en dev).
--
-- La vista v_config_sin_documentar lista las claves usadas que faltan aquí.
-- Reversión: DROP VIEW public.v_config_sin_documentar; DROP TABLE public.config_clave;
-- =============================================================================

CREATE TABLE public.config_clave (
  clave            varchar(100) PRIMARY KEY,
  descripcion      text         NOT NULL,
  tipo             varchar(20)  NOT NULL
                   CHECK (tipo IN ('texto', 'entero', 'decimal', 'booleano', 'json', 'url')),
  unidad           varchar(20)  NULL,
  ejemplo          text         NULL,
  usado_por        text[]       NOT NULL DEFAULT '{}',
  estado           varchar(12)  NOT NULL DEFAULT 'activa'
                   CHECK (estado IN ('activa', 'obsoleta')),
  reemplazada_por  varchar(100) NULL REFERENCES public.config_clave (clave),
  nombre_propuesto varchar(100) NULL,
  CONSTRAINT config_clave_formato_check CHECK (clave ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT config_clave_obsoleta_check CHECK (estado = 'activa' OR reemplazada_por IS NOT NULL OR descripcion <> '')
);

COMMENT ON TABLE public.config_clave IS
  'Diccionario de claves de restaurante_config: significado, tipo, consumidores y estado.';

INSERT INTO public.config_clave
  (clave, descripcion, tipo, unidad, ejemplo, usado_por, estado, reemplazada_por, nombre_propuesto)
VALUES
  -- Webhooks e integraciones
  ('n8n_webhook_avisos', 'URL del webhook de n8n que envía al cliente los avisos de estado del pedido (confirmado, listo, en camino…).', 'url', NULL, 'https://…/webhook/notificacion-estado-pedido', '{api-konnecttia}', 'activa', NULL, NULL),
  ('n8n_webhook_entrada', 'URL del webhook de n8n que recibe los mensajes de Chatwoot (agente de WhatsApp).', 'url', NULL, 'https://…/webhook/chatwootnew', '{api-konnecttia}', 'activa', NULL, NULL),
  ('chatwoot_base_url', 'URL base del Chatwoot del restaurante (para reactivar el bot y enlazar conversaciones).', 'url', NULL, 'https://chat.example.com', '{api-easyorder}', 'activa', NULL, 'chatwoot_url'),
  ('chatwoot_inbox_id', 'Id de la bandeja de Chatwoot del restaurante: identifica a qué restaurante pertenece un mensaje entrante.', 'entero', NULL, '3', '{api-easyorder,dashboard}', 'activa', NULL, 'chatwoot_bandeja_id'),
  ('whatsapp_number', 'Número de WhatsApp del restaurante (formato internacional).', 'texto', NULL, '+34600000000', '{api-easyorder,dashboard}', 'activa', NULL, 'whatsapp_numero'),
  ('bot_activo', 'Agente de WhatsApp activo para el restaurante (true/false).', 'booleano', NULL, 'true', '{api-easyorder,dashboard}', 'activa', NULL, NULL),
  -- Tiempos
  ('pickup_eta_minutes', 'Minutos hasta que un pedido para recoger está listo (base, sin ajustes por hora punta).', 'entero', 'minutos', '20', '{api-konnecttia,api-easyorder,n8n}', 'activa', NULL, 'recogida_minutos'),
  ('pickup_eta_text', 'Texto libre del tiempo de recogida; si existe, se muestra en lugar de los minutos.', 'texto', NULL, '15-20 min', '{api-konnecttia,n8n}', 'activa', NULL, 'recogida_tiempo_texto'),
  ('delivery_eta_min_minutes', 'Tiempo mínimo de reparto del restaurante, si la zona no tiene el suyo.', 'entero', 'minutos', '30', '{api-konnecttia,n8n}', 'activa', NULL, 'reparto_minutos_min'),
  ('delivery_eta_max_minutes', 'Tiempo máximo de reparto del restaurante, si la zona no tiene el suyo.', 'entero', 'minutos', '45', '{api-konnecttia,n8n}', 'activa', NULL, 'reparto_minutos_max'),
  ('delivery_eta_text', 'Texto libre del tiempo de reparto; si existe, se muestra en lugar de los minutos.', 'texto', NULL, '30-45 min', '{api-konnecttia,n8n}', 'activa', NULL, 'reparto_tiempo_texto'),
  ('estimated_time_pickup', 'Versión inicial del tiempo de recogida. Solo se lee si faltan las claves nuevas.', 'entero', 'minutos', '30', '{api-konnecttia}', 'obsoleta', 'pickup_eta_minutes', NULL),
  ('estimated_time_delivery', 'Versión inicial del tiempo de reparto. Solo se lee si faltan las claves nuevas.', 'entero', 'minutos', '50', '{api-konnecttia}', 'obsoleta', 'delivery_eta_max_minutes', NULL),
  -- Carrito y pedidos
  ('cart_expiry_minutes', 'Minutos de inactividad tras los que un pedido en curso caduca.', 'entero', 'minutos', '30', '{n8n}', 'activa', NULL, 'carrito_caduca_minutos'),
  ('cart_warning_minutes', 'Minutos antes de caducar en los que se avisa al cliente.', 'entero', 'minutos', '5', '{n8n}', 'activa', NULL, 'carrito_aviso_minutos'),
  ('modify_window_minutes', 'Minutos tras registrar un pedido durante los que el cliente aún puede modificarlo.', 'entero', 'minutos', '10', '{n8n,dashboard}', 'activa', NULL, 'modificacion_ventana_minutos'),
  ('lookup_pedidos_limit', 'Número máximo de pedidos que consulta el agente al buscar los del cliente.', 'entero', 'pedidos', '5', '{api-easyorder}', 'activa', NULL, 'consulta_pedidos_limite'),
  ('surcharge_rules', 'Suplementos por pedido pequeño u otros (JSON: [{"label","below","amount","appliesTo"}]).', 'json', NULL, '[{"label":"Envases","below":25,"amount":1}]', '{api-konnecttia}', 'activa', NULL, 'suplementos'),
  -- Apertura
  ('is_open_override', 'Apertura o cierre manual del restaurante: "true" abierto, "false" cerrado; sin valor, manda el horario.', 'booleano', NULL, 'false', '{api-konnecttia,api-easyorder,n8n}', 'activa', NULL, 'apertura_manual'),
  ('is_open_override_reason', 'Motivo de la apertura o cierre manual (se muestra al cliente).', 'texto', NULL, 'Cerrado por inventario', '{api-easyorder}', 'activa', NULL, 'apertura_manual_motivo'),
  -- Otros
  ('phone_prefix', 'Prefijo telefónico por defecto para los números que llegan sin él.', 'texto', NULL, '+34', '{api-easyorder,dashboard}', 'activa', NULL, 'prefijo_telefono'),
  ('tax_rate', 'Tipo impositivo aplicable (IGIC en Canarias). Hoy no lo usa ningún cálculo.', 'decimal', 'porcentaje', '7', '{datos_iniciales}', 'activa', NULL, 'tipo_impuesto');

INSERT INTO public.config_clave (clave, descripcion, tipo, usado_por, estado, reemplazada_por)
VALUES
  ('chatwoot_webhook_prod', 'Nombre antiguo del webhook de avisos. Lo usa el dashboard antiguo.', 'url', '{api-easyorder,dashboard}', 'obsoleta', 'n8n_webhook_avisos'),
  ('chatwoot_webhook_test', 'Nombre antiguo (URL de pruebas) del webhook de entrada. Lo usa el dashboard antiguo.', 'url', '{dashboard}', 'obsoleta', 'n8n_webhook_entrada');

INSERT INTO public.config_clave (clave, descripcion, tipo, usado_por, estado, reemplazada_por)
VALUES ('timezone', 'Obsoleta: la zona horaria se guarda en restaurante.zona_horaria (fuente única).', 'texto', '{datos_iniciales}', 'obsoleta', NULL);

CREATE VIEW public.v_config_sin_documentar AS
SELECT rc.config_key, count(*) AS restaurantes
FROM   public.restaurante_config rc
LEFT   JOIN public.config_clave cc ON cc.clave = rc.config_key
WHERE  cc.clave IS NULL
GROUP  BY rc.config_key;

COMMENT ON VIEW public.v_config_sin_documentar IS
  'Claves usadas en restaurante_config que no están en el diccionario config_clave.';
