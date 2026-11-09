-- =============================================================================
-- 0027 · Email del cliente en el pedido web
--
-- Componente: PostgreSQL. La API (checkout y seguimiento), la web y el worker de avisos usan la
--             columna; el worker ya espera `email_cliente` en el payload de los eventos (0025).
-- Reutiliza:  pedidos, avisos por email al cliente (0025).
-- Riesgo:     bajo. Una columna opcional. Ningún pedido existente cambia; n8n no la lee ni la
--             escribe (WhatsApp y pedido manual siguen sin email).
-- Fase:       MVP.
--
-- El checkout web pide el email (obligatorio) para poder avisar al cliente de su pedido. El
-- cliente puede corregirlo después desde el enlace de seguimiento. Borrar los datos de un cliente
-- también lo pone a NULL (ver panel-customers).
--
-- Reversión: ALTER TABLE public.pedidos DROP COLUMN email_cliente;
-- =============================================================================

ALTER TABLE public.pedidos
  ADD COLUMN email_cliente text NULL
  CONSTRAINT pedidos_email_cliente_check CHECK (
    email_cliente IS NULL
    OR (length(email_cliente) <= 254 AND email_cliente ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );

COMMENT ON COLUMN public.pedidos.email_cliente IS 'Email al que se avisa del pedido (checkout web). Opcional en otros canales. Se anula al borrar los datos del cliente.';
