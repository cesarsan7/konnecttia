-- =============================================================================
-- 0025 · Avisos por email (pieza 7 del plan)
--
-- Componente: apps/worker (nuevo) + packages/notifications
-- Reutiliza:  outbox_evento (0002), config_clave (0007), restaurante_config, módulo notify.email
-- Riesgo:     bajo. Tabla nueva y filas de diccionario. Ningún flujo de n8n ni de la API las lee;
--             sin claves en `restaurante_config` los avisos están apagados.
--
-- Claves nuevas de `restaurante_config` (todas apagadas por defecto: sin clave = no se envía):
--   avisos_email_local_activo    true/false: avisar al local por cada pedido nuevo.
--   avisos_email_local           direcciones del local, separadas por coma.
--   avisos_email_cliente_activo  true/false: confirmación y cambios de estado al cliente.
--   avisos_email_cliente_estados estados que avisan al cliente (lista; sin clave, los de por defecto).
--
-- `aviso_envio`: un registro por email enviado, para que procesar dos veces un evento del outbox
-- no repita el envío (único por evento + destinatario). Se guarda un hash del destinatario, no la
-- dirección, para no duplicar datos personales.
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key IN
--     ('avisos_email_local_activo', 'avisos_email_local',
--      'avisos_email_cliente_activo', 'avisos_email_cliente_estados');
--   DELETE FROM public.config_clave WHERE clave IN
--     ('avisos_email_local_activo', 'avisos_email_local',
--      'avisos_email_cliente_activo', 'avisos_email_cliente_estados');
--   DROP TABLE public.aviso_envio;
-- =============================================================================

CREATE TABLE public.aviso_envio (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id          bigint NOT NULL REFERENCES public.outbox_evento (id) ON DELETE CASCADE,
  restaurante_id     int4   NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  canal              text   NOT NULL DEFAULT 'email' CHECK (canal IN ('email')),
  destinatario_tipo  text   NOT NULL CHECK (destinatario_tipo IN ('local', 'cliente')),
  destinatario_hash  text   NOT NULL,
  enviado_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aviso_envio_evento_destinatario_key UNIQUE (evento_id, canal, destinatario_hash)
);

CREATE INDEX ix_aviso_envio_restaurante ON public.aviso_envio (restaurante_id, enviado_at DESC);

COMMENT ON TABLE public.aviso_envio IS
  'Avisos enviados desde el outbox (idempotencia por evento y destinatario). destinatario_hash es el SHA-256 de la dirección en minúsculas.';

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('avisos_email_local_activo', 'Avisar por email al local de cada pedido nuevo (true/false). Sin clave: apagado.', 'booleano', NULL, 'true', '{worker}'),
  ('avisos_email_local', 'Direcciones de email del local que reciben el aviso de pedido nuevo, separadas por coma.', 'texto', NULL, 'pedidos@ejemplo.com, cocina@ejemplo.com', '{worker}'),
  ('avisos_email_cliente_activo', 'Enviar al cliente la confirmación y los cambios de estado de su pedido por email (true/false). Solo si el pedido tiene email del cliente. Sin clave: apagado.', 'booleano', NULL, 'false', '{worker}'),
  ('avisos_email_cliente_estados', 'Estados del pedido que avisan al cliente por email, separados por coma. Sin clave: confirmado, listo, en_camino y cancelado.', 'texto', NULL, 'confirmado, listo, en_camino, cancelado', '{worker}');
