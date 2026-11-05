-- =============================================================================
-- 0016 · Meseros: usuario del panel opcional y mesero que atiende cada mesa
--
-- Reutiliza meseros (nombre, activo, sucursal_id de 0003) y pedidos.mesero_id del dashboard
-- antiguo. Se añade:
--   meseros.membership_id  miembro del panel que es ese mesero (opcional, uno por miembro y local)
-- Cada mesero es de un local (trg_meseros_sucursal de 0003 pone el principal si falta).
--   mesa.mesero_id         mesero que atiende la ocupación actual (se borra al liberar)
-- Riesgo: bajo. Columnas nuevas opcionales; el dashboard antiguo sigue leyendo meseros igual.
-- Reversión:
--   DROP TRIGGER trg_meseros_tenant ON public.meseros;
--   DROP FUNCTION public.fn_check_mesero_tenant();
--   DROP INDEX public.ix_pedidos_mesero;
--   ALTER TABLE public.mesa DROP COLUMN mesero_id;
--   ALTER TABLE public.meseros DROP COLUMN membership_id;
-- =============================================================================

ALTER TABLE public.meseros
  ADD COLUMN membership_id bigint NULL REFERENCES public.local_memberships (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX ux_meseros_membership ON public.meseros (membership_id, sucursal_id)
  WHERE membership_id IS NOT NULL;

ALTER TABLE public.mesa
  ADD COLUMN mesero_id int4 NULL REFERENCES public.meseros (id) ON DELETE SET NULL;

CREATE INDEX ix_pedidos_mesero ON public.pedidos (restaurante_id, mesero_id)
  WHERE mesero_id IS NOT NULL;

-- El miembro y el local de un mesero deben ser de su mismo restaurante.
CREATE FUNCTION public.fn_check_mesero_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.local_memberships m
    WHERE  m.id = NEW.membership_id AND m.restaurante_id = NEW.restaurante_id
  ) THEN
    RAISE EXCEPTION 'El miembro % es de otro restaurante', NEW.membership_id;
  END IF;
  IF NEW.sucursal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sucursal s
    WHERE  s.id = NEW.sucursal_id AND s.restaurante_id = NEW.restaurante_id
  ) THEN
    RAISE EXCEPTION 'El local % es de otro restaurante', NEW.sucursal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meseros_tenant
  BEFORE INSERT OR UPDATE ON public.meseros
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_mesero_tenant();
