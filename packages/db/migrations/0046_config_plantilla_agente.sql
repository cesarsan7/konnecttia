-- =============================================================================
-- 0046 · Plantilla estándar de configuración del agente (ADR 0013)
-- Componente: configuración del agente de WhatsApp (API, panel, panel interno).
-- Reutiliza:  config_clave (diccionario), restaurante_config (personalizaciones), modulo.
-- Tablas:     NUEVA config_plantilla; config_clave gana columnas (grupo, etiqueta, modulo_code,
--             editable_por, minimo, maximo, opciones, orden); módulo nuevo whatsapp.agent_pro;
--             claves nuevas agente_nota_alergenos, agente_derivar_email, agente_notif_estados,
--             pedido_pago_pendiente_expira_minutos.
-- Riesgo:     bajo. Los restaurantes que ya tienen valor propio no cambian. Los que no lo tenían
--             heredan el estándar (cart_expiry_minutes = 30, pausa tras derivar = 120 min).
-- Alcance:    MVP.
--
-- Reversión:
--   DROP TABLE public.config_plantilla;
--   DELETE FROM public.config_clave WHERE clave IN ('agente_nota_alergenos', 'agente_derivar_email',
--     'agente_notif_estados', 'pedido_pago_pendiente_expira_minutos');
--   ALTER TABLE public.config_clave DROP COLUMN grupo, DROP COLUMN etiqueta, DROP COLUMN modulo_code,
--     DROP COLUMN editable_por, DROP COLUMN minimo, DROP COLUMN maximo, DROP COLUMN opciones,
--     DROP COLUMN orden;
--   DELETE FROM public.restaurante_modulo WHERE modulo_code = 'whatsapp.agent_pro';
--   DELETE FROM public.plan_modulo WHERE modulo_code = 'whatsapp.agent_pro';
--   DELETE FROM public.modulo WHERE code = 'whatsapp.agent_pro';
-- =============================================================================

-- Módulo premium del agente: se contrata aparte y depende del agente básico.
INSERT INTO public.modulo (code, nombre, tipo, depende_de) VALUES
  ('whatsapp.agent_pro', 'Agente de WhatsApp premium', 'addon', ARRAY['whatsapp.agent']::text[]);

-- Cómo se dibuja y valida cada parámetro del agente.
ALTER TABLE public.config_clave
  ADD COLUMN grupo         text    NULL,
  ADD COLUMN etiqueta      text    NULL,
  ADD COLUMN modulo_code   text    NULL REFERENCES public.modulo (code),
  ADD COLUMN editable_por  text    NOT NULL DEFAULT 'restaurante'
                           CHECK (editable_por IN ('restaurante', 'interno')),
  ADD COLUMN minimo        numeric NULL,
  ADD COLUMN maximo        numeric NULL,
  ADD COLUMN opciones      jsonb   NULL,
  ADD COLUMN orden         integer NULL;

COMMENT ON COLUMN public.config_clave.grupo IS
  'Pantalla de Ajustes que muestra la clave (hoy solo «agente»). NULL: no se edita desde una pantalla genérica.';
COMMENT ON COLUMN public.config_clave.modulo_code IS
  'Módulo que habilita el parámetro (p. ej. whatsapp.agent_pro = premium). NULL: el del grupo.';
COMMENT ON COLUMN public.config_clave.minimo IS
  'Mínimo de un entero; para texto, longitud máxima va en «maximo».';

-- Valores de la plantilla estándar: lo que heredan los restaurantes sin valor propio.
CREATE TABLE public.config_plantilla (
  plantilla_code  text        NOT NULL DEFAULT 'estandar',
  clave           varchar(100) NOT NULL REFERENCES public.config_clave (clave),
  valor           text        NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plantilla_code, clave)
);
COMMENT ON TABLE public.config_plantilla IS
  'Valores estándar de configuración. Un restaurante hereda el valor salvo que tenga fila propia en restaurante_config.';

-- Claves nuevas.
INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('agente_nota_alergenos', 'Texto que dice el agente cuando el cliente pregunta por alérgenos y en el resumen del pedido. {carta_url} se sustituye por el enlace de la carta. El agente no informa de alérgenos por su cuenta.', 'texto', NULL, 'Para información de alérgenos, consulta la carta: {carta_url}', '{api-konnecttia,n8n}'),
  ('agente_derivar_email', 'Correo al que se avisa cuando el agente deriva una conversación a una persona. Vacío: el correo del propietario.', 'texto', NULL, 'pedidos@restaurante.com', '{api-konnecttia}'),
  ('agente_notif_estados', 'Estados del pedido de WhatsApp que se avisan al cliente (lista JSON). Premium.', 'json', NULL, '["confirmado","listo","en_camino","entregado","cancelado"]', '{api-konnecttia,n8n}'),
  ('pedido_pago_pendiente_expira_minutos', 'Minutos tras los que se cancela un pedido por transferencia sin pagar. 0: no se cancela. Premium.', 'entero', 'minutos', '60', '{api-konnecttia,n8n}');

-- Metadatos de los parámetros del agente (orden de la pantalla).
UPDATE public.config_clave AS c SET
  grupo = v.grupo, etiqueta = v.etiqueta, editable_por = v.editable_por, modulo_code = v.modulo_code,
  minimo = v.minimo, maximo = v.maximo, opciones = v.opciones::jsonb, orden = v.orden
FROM (VALUES
  ('agente_activo',                         'agente', 'El agente responde a los clientes',              'restaurante', NULL,                 NULL::numeric, NULL::numeric, NULL,                                                                          10),
  ('agente_nombre_visible',                 'agente', 'Nombre del agente',                              'restaurante', NULL,                 NULL, 60,   NULL,                                                                          20),
  ('agente_tono',                           'agente', 'Tono',                                           'restaurante', NULL,                 NULL, NULL, '["cercano","formal"]',                                                        30),
  ('agente_instrucciones',                  'agente', 'Lo que el agente debe saber del local',          'restaurante', NULL,                 NULL, 500,  NULL,                                                                          40),
  ('agente_nota_alergenos',                 'agente', 'Mensaje sobre alérgenos',                        'restaurante', NULL,                 NULL, 300,  NULL,                                                                          50),
  ('cart_expiry_minutes',                   'agente', 'Minutos hasta que caduca un pedido sin terminar', 'restaurante', NULL,                 5,    240,  NULL,                                                                          60),
  ('agente_pausa_minutos',                  'agente', 'Pausa cuando escribe el personal (minutos)',     'restaurante', NULL,                 0,    1440, NULL,                                                                          70),
  ('agente_pausa_derivar_minutos',          'agente', 'Pausa tras derivar a una persona (minutos)',     'restaurante', NULL,                 0,    1440, NULL,                                                                          80),
  ('agente_derivar_email',                  'agente', 'Correo para avisos de derivación',               'restaurante', NULL,                 NULL, 160,  NULL,                                                                          90),
  ('agente_notif_estados',                  'agente', 'Estados que se avisan al cliente',               'restaurante', 'whatsapp.agent_pro', NULL, NULL, '["confirmado","en_preparacion","listo","en_camino","entregado","cancelado"]', 100),
  ('cart_warning_minutes',                  'agente', 'Aviso antes de caducar (minutos antes)',         'restaurante', 'whatsapp.agent_pro', 1,    60,   NULL,                                                                          110),
  ('pedido_pago_pendiente_expira_minutos',  'agente', 'Cancelar pagos pendientes tras (minutos; 0 = no)', 'restaurante', 'whatsapp.agent_pro', 0,  1440, NULL,                                                                          120),
  ('agente_modelo',                         'agente', 'Modelo de lenguaje',                             'interno',     NULL,                 NULL, NULL, NULL,                                                                          900),
  ('agente_limite_mensajes_dia',            'agente', 'Límite de mensajes por día',                     'interno',     NULL,                 1,    NULL, NULL,                                                                          910)
) AS v(clave, grupo, etiqueta, editable_por, modulo_code, minimo, maximo, opciones, orden)
WHERE c.clave = v.clave;

-- Plantilla estándar. agente_activo no se hereda: cada restaurante lo activa.
INSERT INTO public.config_plantilla (plantilla_code, clave, valor) VALUES
  ('estandar', 'agente_tono', 'cercano'),
  ('estandar', 'agente_nota_alergenos', 'Para información de alérgenos, consulta la carta: {carta_url}'),
  ('estandar', 'cart_expiry_minutes', '30'),
  ('estandar', 'agente_pausa_derivar_minutos', '120'),
  ('estandar', 'agente_derivar_email', ''),
  ('estandar', 'agente_notif_estados', '[]'),
  ('estandar', 'cart_warning_minutes', '5'),
  ('estandar', 'pedido_pago_pendiente_expira_minutos', '60');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT SELECT ON public.config_clave TO konnecttia_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.config_plantilla TO konnecttia_app;
  END IF;
END
$$;
