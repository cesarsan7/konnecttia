-- =============================================================================
-- 0002_orders_tracking_outbox.sql — Seguimiento seguro, idempotencia y outbox
--
-- Componente: apps/api (checkout y seguimiento), apps/worker (notificaciones)
-- Reutiliza:  pedidos
-- Riesgo:     bajo. Solo añade columnas con valor por defecto y una tabla nueva.
--             El código actual sigue funcionando; el seguimiento por pedido_codigo
--             se retira cuando la API nueva use tracking_token.
-- Fase:       MVP
-- =============================================================================


-- Token aleatorio para el enlace de seguimiento. El código visible (AAMMDD-NNNN) es
-- secuencial y adivinable: deja de servir para consultar datos del cliente.
ALTER TABLE public.pedidos
  ADD COLUMN tracking_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX ux_pedidos_tracking_token ON public.pedidos (tracking_token);

-- Clave de idempotencia enviada por el checkout: reintentar no crea pedidos duplicados.
ALTER TABLE public.pedidos ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX ux_pedidos_idempotency ON public.pedidos (restaurante_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Outbox: el evento se guarda en la misma transacción que el pedido y un worker lo envía
-- (email, SMS, WhatsApp). Si el proveedor falla, el pedido no se pierde y se reintenta.
CREATE TABLE public.outbox_evento (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id      int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  tipo                text NOT NULL,
  agregado_tipo       text NOT NULL,
  agregado_id         text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  clave_idempotencia  text NOT NULL UNIQUE,
  estado              text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'fallido', 'descartado')),
  intentos            int4 NOT NULL DEFAULT 0,
  disponible_en       timestamptz NOT NULL DEFAULT now(),
  ultimo_error        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  procesado_at        timestamptz
);
CREATE INDEX ix_outbox_pendientes ON public.outbox_evento (disponible_en)
  WHERE estado IN ('pendiente', 'fallido');

