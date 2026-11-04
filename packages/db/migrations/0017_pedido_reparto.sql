-- =============================================================================
-- 0017 · Repartos asignados (trazabilidad de quién entrega cada pedido)
--
-- Componente: apps/api (asignar repartos, «Mis repartos») + panel
-- Reutiliza:  pedidos, local_memberships, pedido_estado_log (historial de estados con actor)
-- Riesgo:     bajo. Tabla nueva; n8n y el dashboard antiguo no la leen.
--
-- Una fila por pedido de reparto asignado. Al reasignar se actualiza la fila (el cambio queda
-- en auditoria). salida_at / entregado_at las fija «Mis repartos» al marcar el pedido.
-- repartidor_email guarda el email en el momento de asignar, por si el miembro se borra.
-- Reversión:
--   DROP TABLE public.pedido_reparto;
--   DROP FUNCTION public.fn_check_pedido_reparto_tenant();
-- =============================================================================

CREATE TABLE public.pedido_reparto (
  pedido_id         int4 PRIMARY KEY REFERENCES public.pedidos (id) ON DELETE CASCADE,
  restaurante_id    int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  membership_id     bigint NULL REFERENCES public.local_memberships (id) ON DELETE SET NULL,
  repartidor_email  varchar(255) NULL,
  asignado_por      text NOT NULL,
  asignado_at       timestamptz NOT NULL DEFAULT now(),
  salida_at         timestamptz NULL,
  entregado_at      timestamptz NULL
);
CREATE INDEX ix_pedido_reparto_repartidor ON public.pedido_reparto (restaurante_id, membership_id, asignado_at DESC);

COMMENT ON TABLE public.pedido_reparto IS 'Repartidor asignado a cada pedido de reparto y horas de salida y entrega.';

-- Pedido y repartidor deben ser del mismo restaurante que la fila.
CREATE FUNCTION public.fn_check_pedido_reparto_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = NEW.pedido_id AND p.restaurante_id = NEW.restaurante_id
  ) THEN
    RAISE EXCEPTION 'El pedido % es de otro restaurante', NEW.pedido_id;
  END IF;
  IF NEW.membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.local_memberships m
    WHERE  m.id = NEW.membership_id AND m.restaurante_id = NEW.restaurante_id
  ) THEN
    RAISE EXCEPTION 'El repartidor % es de otro restaurante', NEW.membership_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedido_reparto_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_reparto
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_pedido_reparto_tenant();
