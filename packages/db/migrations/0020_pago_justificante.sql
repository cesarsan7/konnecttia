-- =============================================================================
-- 0020 · Justificantes de pago (Bizum y transferencia)
--
-- Componente: apps/api (subida pública con el token del pedido, URL firmada en el panel)
-- Reutiliza:  pedidos, config_clave / restaurante_config
-- Riesgo:     bajo. Tabla y clave nuevas; n8n y el dashboard antiguo no las leen.
--
-- Una fila por justificante que el cliente sube al seguimiento de su pedido. El archivo vive en
-- un bucket PRIVADO de Supabase Storage (`ruta` = <restaurante_id>/<pedido_id>/<uuid>.<ext>);
-- aquí nunca se guarda una URL: el panel pide una URL firmada de corta duración cada vez.
--
-- Clave de configuración (opcional, por restaurante):
--   justificantes_max_por_pedido   subidas máximas por pedido; sin valor, el valor técnico de la API.
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key = 'justificantes_max_por_pedido';
--   DELETE FROM public.config_clave WHERE clave = 'justificantes_max_por_pedido';
--   DROP TABLE public.pedido_justificante;
--   DROP FUNCTION public.fn_check_pedido_justificante_tenant();
-- =============================================================================

CREATE TABLE public.pedido_justificante (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pedido_id       int4 NOT NULL REFERENCES public.pedidos (id) ON DELETE CASCADE,
  restaurante_id  int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  ruta            text NOT NULL,
  tipo_mime       text NOT NULL,
  bytes           int4 NOT NULL CHECK (bytes > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pedido_justificante_pedido ON public.pedido_justificante (pedido_id, created_at);
CREATE INDEX ix_pedido_justificante_restaurante ON public.pedido_justificante (restaurante_id);

COMMENT ON TABLE public.pedido_justificante IS 'Justificantes de pago subidos por el cliente (archivo en bucket privado; sin URLs).';
COMMENT ON COLUMN public.pedido_justificante.ruta IS 'Ruta del objeto en el bucket privado: <restaurante_id>/<pedido_id>/<uuid>.<ext>.';

-- El pedido debe ser del mismo restaurante que la fila.
CREATE FUNCTION public.fn_check_pedido_justificante_tenant() RETURNS trigger
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

CREATE TRIGGER trg_pedido_justificante_tenant
  BEFORE INSERT OR UPDATE ON public.pedido_justificante
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_pedido_justificante_tenant();

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('justificantes_max_por_pedido', 'Justificantes de pago (Bizum, transferencia) que el cliente puede subir por pedido. Sin valor: el límite técnico de la API (3).', 'entero', 'archivos', '3', '{api-konnecttia}');
