-- =============================================================================
-- 0015 · Permisos de reparto asignado y plantillas Mesero y Repartidor
--
-- Componente: packages/access (catálogo) + apps/api (Equipo → Roles, repartos)
-- Reutiliza:  permiso, rol, rol_permiso (0001)
-- Riesgo:     bajo. Solo añade filas de catálogo; ningún miembro cambia de rol.
--
-- Permisos nuevos (módulo delivery):
--   delivery.assign          asignar pedidos de reparto a un repartidor
--   orders.deliver_assigned  ver y entregar solo los repartos asignados a uno mismo
-- Plantillas nuevas: waiter (Mesero) y driver (Repartidor). Propietario y Encargado reciben los
-- permisos nuevos (como todos los demás); Personal puede asignar repartos.
-- El catálogo debe coincidir con packages/access/src (prueba catalog-sync).
--
-- Reversión:
--   DELETE FROM public.rol WHERE restaurante_id IS NULL AND code IN ('waiter', 'driver');
--   DELETE FROM public.rol_permiso WHERE permiso_code IN ('delivery.assign', 'orders.deliver_assigned');
--   DELETE FROM public.permiso WHERE code IN ('delivery.assign', 'orders.deliver_assigned');
-- =============================================================================

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('delivery.assign', 'delivery'),
  ('orders.deliver_assigned', 'delivery');

INSERT INTO public.rol (restaurante_id, code, nombre, es_plantilla) VALUES
  (NULL, 'waiter', 'Mesero', true),
  (NULL, 'driver', 'Repartidor', true);

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'delivery.assign'),
  ('owner', 'orders.deliver_assigned'),
  ('manager', 'delivery.assign'),
  ('manager', 'orders.deliver_assigned'),
  ('staff', 'delivery.assign'),
  ('waiter', 'orders.view'),
  ('waiter', 'orders.create'),
  ('waiter', 'orders.change_status'),
  ('waiter', 'menu.view'),
  ('waiter', 'tables.view'),
  ('waiter', 'tables.manage'),
  ('driver', 'delivery.view'),
  ('driver', 'orders.deliver_assigned')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;
