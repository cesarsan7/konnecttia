-- =============================================================================
-- 0018 · Nombre y apodo de los miembros del equipo
--
-- Componente: apps/api (equipo, aceptar invitación, perfil propio) + panel
-- Reutiliza:  local_memberships (0000). El email deja de ser lo que identifica a cada persona
--             en el panel: la cabecera, los repartidores y los meseros muestran apodo o nombre.
-- Riesgo:     bajo. Dos columnas opcionales; el dashboard antiguo y n8n no las leen. Los
--             miembros existentes quedan sin nombre (NULL) y el panel les pide añadirlo.
--
--   nombre  nombre de la persona (obligatorio al aceptar una invitación nueva, lo exige la API)
--   apodo   cómo quiere que le llamen en el panel (opcional)
-- Sin vacíos tras recortar espacios y como máximo 80 caracteres.
-- Reversión:
--   ALTER TABLE public.local_memberships DROP COLUMN apodo, DROP COLUMN nombre;
-- =============================================================================

ALTER TABLE public.local_memberships
  ADD COLUMN nombre text NULL,
  ADD COLUMN apodo  text NULL,
  ADD CONSTRAINT local_memberships_nombre_check
    CHECK (nombre IS NULL OR (btrim(nombre) <> '' AND char_length(nombre) <= 80)),
  ADD CONSTRAINT local_memberships_apodo_check
    CHECK (apodo IS NULL OR (btrim(apodo) <> '' AND char_length(apodo) <= 80));

COMMENT ON COLUMN public.local_memberships.nombre IS 'Nombre de la persona en el equipo (se muestra en el panel en lugar del email).';
COMMENT ON COLUMN public.local_memberships.apodo  IS 'Apodo opcional; si existe, el panel lo muestra antes que el nombre.';
