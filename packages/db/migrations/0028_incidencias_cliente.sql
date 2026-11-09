-- =============================================================================
-- 0028 · Incidencias del cliente sobre su pedido (pieza P)
--
-- Componente: apps/api (seguimiento público y panel) + web (seguimiento, tablero, Incidencias)
-- Reutiliza:  pedidos, restaurante, permisos orders.view y orders.update (sin permisos nuevos)
-- Riesgo:     bajo. Tabla nueva; n8n y el dashboard antiguo no la leen.
--
-- Una fila por incidencia que el cliente abre desde el enlace de seguimiento («falta algo»,
-- «llegó mal», «retraso», «otro») con un texto libre. El local la ve en el tablero y en
-- Incidencias, y la marca como resuelta (con una nota opcional). El texto puede contener datos
-- personales: el borrado de datos de un cliente lo vacía (descripcion = '').
-- Reversión:
--   DROP TABLE public.pedido_incidencia;
--   DROP FUNCTION public.fn_check_pedido_incidencia_tenant();
-- =============================================================================

CREATE TABLE public.pedido_incidencia (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id        int4 NOT NULL REFERENCES public.pedidos (id) ON DELETE CASCADE,
  restaurante_id   int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  tipo             text NOT NULL CHECK (tipo IN ('falta_algo', 'llego_mal', 'retraso', 'otro')),
  descripcion      text NOT NULL CHECK (char_length(descripcion) <= 1000),
  estado           text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'resuelta')),
  nota_resolucion  text NULL CHECK (char_length(nota_resolucion) <= 500),
  resuelta_por     text NULL,
  resuelta_at      timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pedido_incidencia_resuelta
    CHECK ((estado = 'resuelta') = (resuelta_at IS NOT NULL))
);
CREATE INDEX ix_pedido_incidencia_pedido ON public.pedido_incidencia (pedido_id, created_at);
CREATE INDEX ix_pedido_incidencia_restaurante
  ON public.pedido_incidencia (restaurante_id, estado, created_at DESC);

COMMENT ON TABLE public.pedido_incidencia IS 'Incidencias que el cliente abre sobre su pedido desde el seguimiento (pieza P).';
COMMENT ON COLUMN public.pedido_incidencia.descripcion IS 'Texto libre del cliente; puede contener datos personales y se vacía al borrar los datos del cliente.';
COMMENT ON COLUMN public.pedido_incidencia.resuelta_por IS 'Email o id de quien la marcó como resuelta en el panel.';

-- El pedido debe ser del mismo restaurante que la fila.
CREATE FUNCTION public.fn_check_pedido_incidencia_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pedidos p WHERE p.id = NEW.pedido_id AND p.restaurante_id = NEW.restaurante_id
  ) THEN
    RAISE EXCEPTION 'El pedido % es de otro restaurante', NEW.pedido_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedido_incidencia_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_incidencia
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_pedido_incidencia_tenant();
