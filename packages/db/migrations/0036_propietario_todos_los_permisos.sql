-- =============================================================================
-- 0036 · El propietario tiene todos los permisos del catálogo
--
-- Componente: base de datos (datos de roles)
-- Reutiliza:  permiso, rol_permiso, rol (plantilla owner)
-- Tablas:     ninguna nueva; solo inserta filas en rol_permiso
-- Riesgo:     bajo. Idempotente (ON CONFLICT DO NOTHING). El propietario ya es, por definición,
--             el rol con todos los permisos (ROLE_TEMPLATE_PERMISSIONS.owner = ALL_PERMISSIONS).
--
-- Motivo: en staging a la plantilla propietario le faltaba `storefront.view` (30 de 31). La API solo
-- deja asignar un rol cuyos permisos tiene quien invita (anti-escalada), así que el propietario
-- solo podía invitar a otros propietarios. Esta migración cura esa deriva y cualquier otra futura
-- del mismo tipo.
--
-- Reversión: no aplica (solo añade permisos que el propietario debe tener).
-- =============================================================================

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, p.code
FROM   public.rol r
CROSS  JOIN public.permiso p
WHERE  r.code = 'owner' AND r.restaurante_id IS NULL AND r.es_plantilla
ON CONFLICT DO NOTHING;
