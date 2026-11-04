-- =============================================================================
-- 0012 · Invitaciones al equipo desde el panel
--
-- restaurant_invites (del dashboard antiguo) pasa a guardar también:
--   email         a quién va dirigida (si se indica, solo ese email puede aceptarla)
--   rol_id        rol del nuevo miembro (plantilla de Konnecttia o rol propio del restaurante)
--   sucursal_ids  locales a los que queda limitado ({} = todos)
--   revocada_at   invitación anulada desde el panel
-- La columna `rol` antigua se mantiene (el dashboard actual la lee).
-- Reversión:
--   DROP TRIGGER trg_restaurant_invites_tenant ON public.restaurant_invites;
--   DROP FUNCTION public.fn_check_invitacion_tenant();
--   ALTER TABLE public.restaurant_invites DROP COLUMN email, DROP COLUMN rol_id,
--     DROP COLUMN sucursal_ids, DROP COLUMN revocada_at;
-- =============================================================================

ALTER TABLE public.restaurant_invites
  ADD COLUMN email        varchar(255) NULL,
  ADD COLUMN rol_id       bigint       NULL REFERENCES public.rol (id) ON DELETE CASCADE,
  ADD COLUMN sucursal_ids bigint[]     NOT NULL DEFAULT '{}',
  ADD COLUMN revocada_at  timestamptz  NULL;

-- El rol y los locales de una invitación deben ser del mismo restaurante.
CREATE FUNCTION public.fn_check_invitacion_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rol_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.rol r
    WHERE  r.id = NEW.rol_id AND (r.restaurante_id IS NULL OR r.restaurante_id = NEW.restaurante_id)
  ) THEN
    RAISE EXCEPTION 'El rol % no es de este restaurante', NEW.rol_id USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.sucursal_ids) AS sid
    WHERE  NOT EXISTS (
      SELECT 1 FROM public.sucursal s WHERE s.id = sid AND s.restaurante_id = NEW.restaurante_id
    )
  ) THEN
    RAISE EXCEPTION 'Local de otro restaurante en la invitación' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_restaurant_invites_tenant
  BEFORE INSERT OR UPDATE OF rol_id, sucursal_ids, restaurante_id ON public.restaurant_invites
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_invitacion_tenant();

CREATE INDEX idx_restaurant_invites_pendientes ON public.restaurant_invites (restaurante_id)
  WHERE used_at IS NULL AND revocada_at IS NULL;
