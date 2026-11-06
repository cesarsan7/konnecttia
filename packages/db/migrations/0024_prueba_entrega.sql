-- =============================================================================
-- 0024 · Prueba de entrega (foto del repartidor)
--
-- Componente: apps/api («Mis repartos», detalle del pedido en el panel) + panel
-- Reutiliza:  pedidos, local_memberships, config_clave / restaurante_config y el bucket privado
--             de justificantes (prefijo `entregas/`)
-- Riesgo:     bajo. Tabla y clave nuevas; n8n y el dashboard antiguo no las leen.
--
-- Una fila por foto que el repartidor sube de un pedido en camino. El archivo vive en el bucket
-- PRIVADO (`ruta` = entregas/<restaurante_id>/<pedido_id>/<uuid>.<ext>); aquí nunca se guarda
-- una URL: el panel pide una URL firmada de corta duración cada vez que alguien la abre.
--
-- Clave de configuración (opcional, por restaurante):
--   reparto_foto_entrega   no | opcional | obligatoria. Sin clave equivale a `no`.
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key = 'reparto_foto_entrega';
--   DELETE FROM public.config_clave WHERE clave = 'reparto_foto_entrega';
--   DROP TABLE public.pedido_foto_entrega;
--   DROP FUNCTION public.fn_check_pedido_foto_entrega_tenant();
-- =============================================================================

CREATE TABLE public.pedido_foto_entrega (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id       int4 NOT NULL REFERENCES public.pedidos (id) ON DELETE CASCADE,
  restaurante_id  int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  membership_id   bigint NULL REFERENCES public.local_memberships (id) ON DELETE SET NULL,
  ruta            text NOT NULL,
  tipo_mime       text NOT NULL,
  bytes           int4 NOT NULL CHECK (bytes > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_foto_entrega_pedido ON public.pedido_foto_entrega (pedido_id, created_at);
CREATE INDEX ix_pedido_foto_entrega_restaurante ON public.pedido_foto_entrega (restaurante_id);

COMMENT ON TABLE public.pedido_foto_entrega IS 'Fotos de entrega subidas por el repartidor (archivo en bucket privado; sin URLs).';
COMMENT ON COLUMN public.pedido_foto_entrega.ruta IS 'Ruta del objeto en el bucket privado: entregas/<restaurante_id>/<pedido_id>/<uuid>.<ext>.';
COMMENT ON COLUMN public.pedido_foto_entrega.membership_id IS 'Repartidor que subió la foto (NULL si su membresía se eliminó).';

-- Pedido y repartidor deben ser del mismo restaurante que la fila.
CREATE FUNCTION public.fn_check_pedido_foto_entrega_tenant() RETURNS trigger
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

CREATE TRIGGER trg_pedido_foto_entrega_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_foto_entrega
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_pedido_foto_entrega_tenant();

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('reparto_foto_entrega', 'Foto de entrega del repartidor: no (no se ofrece), opcional (puede subirla) u obligatoria (no puede marcar «entregado» sin ella). Sin valor: no.', 'texto', NULL, 'opcional', '{api-konnecttia}');
