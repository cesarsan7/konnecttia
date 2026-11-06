-- =============================================================================
-- 0019 · Tratamiento de datos: consentimiento al pedir y borrado de clientes
--
-- Componente: apps/api (pedido web, ficha de cliente del panel) + apps/easyorder (checkout,
--             página pública /[slug]/privacidad) + packages/access (permiso nuevo)
-- Reutiliza:  pedidos, usuarios, config_clave (0007), permiso / rol_permiso (0001, 0015)
-- Riesgo:     bajo. Solo columnas opcionales (NULL) y filas de catálogo; n8n y el dashboard
--             antiguo no las leen. Los pedidos existentes quedan sin consentimiento registrado
--             (NULL = anterior a esta pieza o creado por WhatsApp, teléfono o mostrador).
--
--   pedidos.privacidad_aceptada_at   cuándo aceptó la política al pedir por la web
--   pedidos.privacidad_version       versión de la política aceptada (config `privacidad_version`
--                                    del restaurante, o la de la plantilla genérica de la web)
--   usuarios.acepta_promociones      último estado de la casilla de promociones (NULL = nunca se
--                                    le preguntó, p. ej. clientes que solo piden por WhatsApp)
--   usuarios.acepta_promociones_at   cuándo se dio o se retiró ese consentimiento por última vez
--   usuarios.anonimizado_at          cuándo se borraron sus datos desde el panel (el perfil
--                                    sigue existiendo, vacío, para no romper pedidos.usuario_id)
--
-- Claves nuevas de restaurante_config (documentadas en config_clave):
--   privacidad_url      URL de la política de privacidad del restaurante
--   privacidad_version  texto que identifica la versión vigente de esa política
--
-- Permiso nuevo (módulo customers): customers.delete, «Borrar datos de clientes». Lo reciben
-- Propietario y Encargado. El catálogo debe coincidir con packages/access/src (prueba catalog-sync).
--
-- Reversión:
--   DELETE FROM public.rol_permiso WHERE permiso_code = 'customers.delete';
--   DELETE FROM public.permiso WHERE code = 'customers.delete';
--   DELETE FROM public.config_clave WHERE clave IN ('privacidad_url', 'privacidad_version');
--   ALTER TABLE public.usuarios DROP COLUMN anonimizado_at, DROP COLUMN acepta_promociones_at,
--     DROP COLUMN acepta_promociones;
--   ALTER TABLE public.pedidos DROP COLUMN privacidad_version, DROP COLUMN privacidad_aceptada_at;
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN privacidad_aceptada_at timestamptz NULL,
  ADD COLUMN privacidad_version     text        NULL;

ALTER TABLE public.usuarios
  ADD COLUMN acepta_promociones    boolean     NULL,
  ADD COLUMN acepta_promociones_at timestamptz NULL,
  ADD COLUMN anonimizado_at        timestamptz NULL;

COMMENT ON COLUMN public.pedidos.privacidad_aceptada_at IS 'Momento en que el cliente aceptó la política de privacidad al pedir por la web. NULL en otros canales.';
COMMENT ON COLUMN public.pedidos.privacidad_version IS 'Versión de la política de privacidad aceptada en ese pedido.';
COMMENT ON COLUMN public.usuarios.acepta_promociones IS 'Último consentimiento para recibir promociones (true dado, false retirado o rechazado, NULL nunca preguntado).';
COMMENT ON COLUMN public.usuarios.acepta_promociones_at IS 'Cuándo se dio o retiró por última vez el consentimiento de promociones.';
COMMENT ON COLUMN public.usuarios.anonimizado_at IS 'Cuándo se borraron los datos personales del cliente desde el panel. Un perfil anonimizado no se lista ni se reutiliza.';

INSERT INTO public.config_clave
  (clave, descripcion, tipo, unidad, ejemplo, usado_por, estado, reemplazada_por, nombre_propuesto)
VALUES
  ('privacidad_url', 'URL de la política de privacidad del restaurante, que se enlaza en el checkout web. Si falta, se enlaza a la página genérica /<slug>/privacidad.', 'url', NULL, 'https://mirestaurante.example/privacidad', '{api-konnecttia}', 'activa', NULL, NULL),
  ('privacidad_version', 'Texto que identifica la versión vigente de la política de privacidad del restaurante (se guarda en cada pedido web al aceptarla).', 'texto', NULL, '2026-11', '{api-konnecttia}', 'activa', NULL, NULL);

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('customers.delete', 'customers');

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'customers.delete'),
  ('manager', 'customers.delete')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;
