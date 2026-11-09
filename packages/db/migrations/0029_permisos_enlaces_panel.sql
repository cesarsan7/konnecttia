-- =============================================================================
-- 0029 · Permisos de los enlaces «Ver carta online» y «Ayuda» del panel
--
-- Componente: packages/access (catálogo) + apps/easyorder (pie del panel) + Equipo → Roles
-- Reutiliza:  permiso, rol_permiso (0001); mismo patrón que 0015
-- Tablas:     permiso, rol_permiso (solo filas de catálogo; sin cambios de estructura)
-- Riesgo:     bajo. Todos los roles (plantillas y roles propios existentes) reciben ambos
--             permisos, así que nadie pierde los enlaces al migrar. Solo oculta enlaces:
--             la carta pública y el centro de ayuda siguen siendo abiertos.
--
-- Permisos nuevos:
--   storefront.view   módulo core.menu       enlace «Ver carta online»
--   help.view         módulo core.settings   enlace «Ayuda»
-- El catálogo debe coincidir con packages/access/src (prueba catalog-sync).
--
-- Reversión:
--   DELETE FROM public.rol_permiso WHERE permiso_code IN ('storefront.view', 'help.view');
--   DELETE FROM public.permiso WHERE code IN ('storefront.view', 'help.view');
-- =============================================================================

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('storefront.view', 'core.menu'),
  ('help.view', 'core.settings');

-- Plantillas (el catálogo TypeScript y la prueba catalog-sync leen estas filas).
INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'storefront.view'),
  ('owner', 'help.view'),
  ('manager', 'storefront.view'),
  ('manager', 'help.view'),
  ('staff', 'storefront.view'),
  ('staff', 'help.view'),
  ('viewer', 'storefront.view'),
  ('viewer', 'help.view'),
  ('waiter', 'storefront.view'),
  ('waiter', 'help.view'),
  ('driver', 'storefront.view'),
  ('driver', 'help.view')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;

-- Roles personalizados que ya existan: conservan los enlaces.
INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, p.code
FROM   public.rol r
CROSS  JOIN (VALUES ('storefront.view'), ('help.view')) AS p(code)
WHERE  r.es_plantilla = false
ON CONFLICT DO NOTHING;
