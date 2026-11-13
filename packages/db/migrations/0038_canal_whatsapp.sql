-- =============================================================================
-- 0038 · Canal de WhatsApp (Kapso) y claves del agente
--
-- Componente: base de datos (agente de WhatsApp en n8n, API, panel y /interno)
-- Reutiliza:  restaurante, sucursal (UNIQUE id+restaurante_id de la 0003), config_clave (0007),
--             módulos whatsapp.channel y whatsapp.agent y permiso agent.configure (0001)
-- Tablas:     nuevas canal_whatsapp, whatsapp_conversacion, whatsapp_evento;
--             filas nuevas en config_clave; bot_activo (sin uso) pasa a obsoleta
-- Riesgo:     bajo. Solo añade tablas y filas; no toca pedidos ni los flujos actuales. Los GRANT
--             solo se aplican si el rol existe (la base de pruebas no tiene n8n_agente).
-- MVP:        sí (ADR 0012, diseño en integrations/n8n/diseno/adaptador-canal-kapso.md, sección 5)
--
-- Reversión:
--   DROP TABLE public.whatsapp_evento, public.whatsapp_conversacion, public.canal_whatsapp;
--   DELETE FROM public.restaurante_config WHERE config_key LIKE 'agente\_%';
--   UPDATE public.config_clave SET estado = 'activa', reemplazada_por = NULL WHERE clave = 'bot_activo';
--   DELETE FROM public.config_clave WHERE clave LIKE 'agente\_%';
-- =============================================================================

-- Número de WhatsApp de un restaurante (o de un local) en un proveedor.
CREATE TABLE public.canal_whatsapp (
  id                   bigserial    PRIMARY KEY,
  restaurante_id       int4         NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  sucursal_id          bigint       NULL,
  proveedor            varchar(20)  NOT NULL CHECK (proveedor IN ('kapso')),
  phone_number_id      varchar(64)  NOT NULL,
  numero_e164          varchar(20)  NOT NULL CHECK (numero_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  modo_conexion        varchar(20)  NOT NULL CHECK (modo_conexion IN ('coexistencia', 'dedicado', 'sandbox')),
  cliente_proveedor_id varchar(64)  NULL,
  estado               varchar(20)  NOT NULL DEFAULT 'pendiente'
                       CHECK (estado IN ('pendiente', 'activo', 'pausado', 'desconectado')),
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT canal_whatsapp_numero_uk UNIQUE (proveedor, phone_number_id),
  CONSTRAINT canal_whatsapp_id_restaurante_key UNIQUE (id, restaurante_id),
  -- El local debe ser del mismo restaurante.
  CONSTRAINT canal_whatsapp_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id)
);
CREATE INDEX idx_canal_whatsapp_restaurante ON public.canal_whatsapp (restaurante_id) WHERE estado = 'activo';

COMMENT ON TABLE public.canal_whatsapp IS
  'Número de WhatsApp de un restaurante (sucursal_id nulo) o de un local, en un proveedor. El agente resuelve el restaurante por phone_number_id. cliente_proveedor_id: customer del proveedor (alta automática).';

-- Estado de cada conversación para el agente (pausa por atención humana, ventana de 24 h).
-- Una conversación es de un cliente con un número del restaurante.
CREATE TABLE public.whatsapp_conversacion (
  canal_id           bigint      NOT NULL,
  restaurante_id     int4        NOT NULL,
  telefono           text        NOT NULL,
  pausado_hasta      timestamptz NULL,
  pausado_por        varchar(20) NULL CHECK (pausado_por IN ('personal', 'derivar_humano', 'panel')),
  ultimo_entrante_at timestamptz NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (canal_id, telefono),
  -- El restaurante de la conversación es siempre el del canal.
  CONSTRAINT whatsapp_conversacion_canal_fk FOREIGN KEY (canal_id, restaurante_id)
    REFERENCES public.canal_whatsapp (id, restaurante_id) ON DELETE CASCADE
);
CREATE INDEX idx_whatsapp_conversacion_restaurante ON public.whatsapp_conversacion (restaurante_id, telefono);

COMMENT ON TABLE public.whatsapp_conversacion IS
  'Pausa del agente (cuando escribe el personal o se deriva a una persona) y último mensaje entrante (ventana de 24 h de WhatsApp), por cliente y número.';

-- Entregas ya procesadas (idempotencia de los webhooks). Se purga a los 7 días desde el Cron.
CREATE TABLE public.whatsapp_evento (
  clave       varchar(128) PRIMARY KEY,
  recibido_at timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_whatsapp_evento_recibido ON public.whatsapp_evento (recibido_at);

COMMENT ON TABLE public.whatsapp_evento IS
  'Claves de idempotencia de los webhooks ya procesados (X-Idempotency-Key). Sin datos del cliente.';

-- Permisos explícitos (no dependen de los permisos por defecto dados al crear el rol).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.canal_whatsapp TO konnecttia_app;
    GRANT SELECT ON public.whatsapp_conversacion TO konnecttia_app;
    GRANT USAGE, SELECT ON SEQUENCE public.canal_whatsapp_id_seq TO konnecttia_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_agente') THEN
    GRANT SELECT ON public.canal_whatsapp TO n8n_agente;
    GRANT SELECT, INSERT, UPDATE ON public.whatsapp_conversacion TO n8n_agente;
    -- DELETE: purga de 7 días del Cron.
    GRANT SELECT, INSERT, DELETE ON public.whatsapp_evento TO n8n_agente;
  END IF;
END $$;

-- Claves de configuración del agente (sin valor, el agente usa el nombre del restaurante,
-- tono «cercano» y sin pausa; agente_activo falso o sin módulo → no responde).
INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('agente_activo', 'El agente de WhatsApp responde a los clientes de este restaurante (true/false). Sin clave: no responde. Además hace falta el módulo whatsapp.agent.', 'booleano', NULL, 'true', '{n8n,panel-easyorder,api-konnecttia}'),
  ('agente_nombre_visible', 'Nombre con el que se presenta el agente. Vacío: «agente de pedidos de <restaurante>».', 'texto', NULL, 'Asistente del local', '{n8n,panel-easyorder}'),
  ('agente_tono', 'Tono del agente: cercano o formal. Sin clave: cercano.', 'texto', NULL, 'cercano', '{n8n,panel-easyorder}'),
  ('agente_instrucciones', 'Texto corto con lo que el agente debe saber del local (se añade a sus instrucciones; las reglas del negocio no se pueden cambiar desde aquí).', 'texto', NULL, 'Hacemos arepas sin gluten bajo pedido.', '{n8n,panel-easyorder}'),
  ('agente_pausa_minutos', 'Minutos que el agente se calla en una conversación cuando escribe el personal desde su app. Sin clave o 0: no se pausa.', 'entero', 'minutos', '60', '{n8n,panel-easyorder}'),
  ('agente_modelo', 'Modelo de lenguaje que usa el agente de este restaurante (lo fija Konnecttia). Sin clave: el modelo por defecto del flujo.', 'texto', NULL, 'nombre-del-modelo', '{n8n,interno}'),
  ('agente_limite_mensajes_dia', 'Máximo de mensajes del cliente que atiende el agente por día y restaurante (lo fija Konnecttia). Sin clave: sin límite.', 'entero', 'mensajes/día', '500', '{n8n,interno}');

-- Sustituye a la clave de la etapa anterior, que ningún código usa.
UPDATE public.config_clave SET estado = 'obsoleta', reemplazada_por = 'agente_activo' WHERE clave = 'bot_activo';
