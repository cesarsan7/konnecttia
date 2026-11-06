-- =============================================================================
-- 0021 · Pedidos fraudulentos, capas gratuitas (pieza Q del plan)
--
-- Componente: apps/api (pedido web, ficha de cliente del panel) + apps/easyorder (checkout,
--             clientes del panel) + packages/access (permiso nuevo) + n8n (pendiente, ver abajo)
-- Reutiliza:  pedidos, usuarios, config_clave (0007), permiso / rol_permiso (0001, 0015, 0019)
-- Riesgo:     bajo. Tabla, funciones, índice y filas de catálogo nuevos. Ningún flujo actual de n8n
--             las lee todavía: sin filas en `cliente_bloqueado` y sin claves de límite en
--             `restaurante_config`, el comportamiento no cambia.
--
-- Teléfonos bloqueados por restaurante (`cliente_bloqueado`)
--   El teléfono se guarda normalizado con `fn_telefono_normalizado`: solo dígitos, sin el 00
--   internacional y, si son 9 cifras que empiezan por 6-9 (móvil o fijo español sin prefijo),
--   con el 34 delante. Así «+34 612 34 56 78», «34612345678» y «612345678» son el mismo teléfono
--   tanto en la web (que envía +34…) como en WhatsApp (que llega como 34…).
--
-- Comprobación para n8n (aún sin conectar):
--   SELECT public.fn_telefono_bloqueado(<restaurante_id>, '<telefono tal como llega>');
--   devuelve true si el teléfono está bloqueado en ese restaurante. El cambio en n8n (Director o
--   Apertura: no abrir pedido y derivar a humano con un mensaje neutro) queda pendiente.
--
-- Límites por teléfono en pedidos web (claves opcionales de restaurante_config; sin clave, sin
-- límite): antifraude_pedidos_abiertos_por_telefono y antifraude_pedidos_por_telefono_hora.
-- Para contar rápido se añade un índice sobre el teléfono normalizado de `pedidos`.
--
-- Permiso nuevo (módulo customers): customers.block, «Bloquear y desbloquear clientes». Lo
-- reciben Propietario y Encargado. El catálogo debe coincidir con packages/access/src.
--
-- Reversión:
--   DELETE FROM public.rol_permiso WHERE permiso_code = 'customers.block';
--   DELETE FROM public.permiso WHERE code = 'customers.block';
--   DELETE FROM public.restaurante_config WHERE config_key IN
--     ('antifraude_pedidos_abiertos_por_telefono', 'antifraude_pedidos_por_telefono_hora');
--   DELETE FROM public.config_clave WHERE clave IN
--     ('antifraude_pedidos_abiertos_por_telefono', 'antifraude_pedidos_por_telefono_hora');
--   DROP INDEX public.ix_pedidos_telefono_normalizado;
--   DROP FUNCTION public.fn_telefono_bloqueado(int4, text);
--   DROP TABLE public.cliente_bloqueado;
--   DROP FUNCTION public.fn_telefono_normalizado(text);
-- =============================================================================

CREATE FUNCTION public.fn_telefono_normalizado(p_telefono text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN length(d) = 9 AND d ~ '^[6-9]' THEN '34' || d
    ELSE d
  END
  FROM (
    SELECT regexp_replace(regexp_replace(COALESCE(p_telefono, ''), '[^0-9]', '', 'g'), '^00', '') AS d
  ) AS limpio
$$;

COMMENT ON FUNCTION public.fn_telefono_normalizado(text) IS 'Teléfono comparable: solo dígitos, sin 00 internacional y con 34 si son 9 cifras españolas (6-9 inicial).';

CREATE TABLE public.cliente_bloqueado (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  telefono        text NOT NULL CHECK (telefono <> '' AND telefono = public.fn_telefono_normalizado(telefono)),
  motivo          text NULL CHECK (motivo IS NULL OR length(motivo) <= 300),
  bloqueado_por   text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_bloqueado_restaurante_telefono_key UNIQUE (restaurante_id, telefono)
);

COMMENT ON TABLE public.cliente_bloqueado IS 'Teléfonos que un restaurante no atiende por la web (pieza Q, antifraude). Teléfono normalizado con fn_telefono_normalizado.';
COMMENT ON COLUMN public.cliente_bloqueado.bloqueado_por IS 'Identificador (Supabase Auth) de quien lo bloqueó desde el panel.';
COMMENT ON COLUMN public.cliente_bloqueado.motivo IS 'Nota interna opcional. Nunca se muestra al cliente.';

CREATE FUNCTION public.fn_telefono_bloqueado(p_restaurante_id int4, p_telefono text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.cliente_bloqueado b
    WHERE  b.restaurante_id = p_restaurante_id
      AND  b.telefono = public.fn_telefono_normalizado(p_telefono)
  )
$$;

COMMENT ON FUNCTION public.fn_telefono_bloqueado(int4, text) IS 'true si el teléfono está bloqueado en ese restaurante. La usan la API y, cuando se conecte, n8n.';

-- Recuento de pedidos de un teléfono (límites de la web) sin recorrer todos los del restaurante.
CREATE INDEX ix_pedidos_telefono_normalizado
  ON public.pedidos (restaurante_id, public.fn_telefono_normalizado(telefono));

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('antifraude_pedidos_abiertos_por_telefono', 'Máximo de pedidos web sin cerrar (ni entregados, cancelados ni expirados) que puede tener a la vez un mismo teléfono. Sin valor: sin límite.', 'entero', 'pedidos', '2', '{api-konnecttia}'),
  ('antifraude_pedidos_por_telefono_hora', 'Máximo de pedidos web que puede hacer un mismo teléfono en la última hora, incluidos los cancelados. Sin valor: sin límite.', 'entero', 'pedidos', '3', '{api-konnecttia}');

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('customers.block', 'customers');

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'customers.block'),
  ('manager', 'customers.block')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;
