-- =============================================================================
-- 0042 · Panel: derivaciones del agente de WhatsApp (pestaña «Derivaciones» en Incidencias)
--
-- Componente: base de datos (API del panel)
-- Reutiliza:  escalaciones (estado, resolved_at, resolved_by) y whatsapp_conversacion (pausa)
-- Tablas:     sin cambios de estructura; permisos nuevos y grants a konnecttia_app
-- Riesgo:     bajo. Solo lectura y cambio de estado; la API filtra siempre por restaurante.
-- MVP:        sí
--
-- Permisos nuevos (módulo whatsapp.agent), asignables a cualquier rol desde Roles:
--   agent.handoffs.view    «Ver las derivaciones del agente»
--   agent.handoffs.manage  «Atender derivaciones del agente (y reanudar al agente)»
-- Los reciben Propietario, Encargado y Personal. El catálogo debe coincidir con
-- packages/access/src.
--
-- Reversión:
--   DELETE FROM public.rol_permiso WHERE permiso_code IN ('agent.handoffs.view', 'agent.handoffs.manage');
--   DELETE FROM public.permiso WHERE code IN ('agent.handoffs.view', 'agent.handoffs.manage');
--   REVOKE UPDATE ON public.escalaciones FROM konnecttia_app;
-- =============================================================================

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('agent.handoffs.view', 'whatsapp.agent'),
  ('agent.handoffs.manage', 'whatsapp.agent');

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'agent.handoffs.view'),
  ('owner', 'agent.handoffs.manage'),
  ('manager', 'agent.handoffs.view'),
  ('manager', 'agent.handoffs.manage'),
  ('staff', 'agent.handoffs.view'),
  ('staff', 'agent.handoffs.manage')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;

-- Permisos explícitos (no dependen de los permisos por defecto dados al crear el rol).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT SELECT, UPDATE ON public.escalaciones TO konnecttia_app;
    GRANT SELECT, UPDATE ON public.whatsapp_conversacion TO konnecttia_app;
  END IF;
END $$;
