-- =============================================================================
-- 0050 · Aviso de carrito caducado: guardar si ya se avisó al cliente
-- Componente: API del agente de WhatsApp (contexto de cada turno) y flujo n8n Director.
-- Reutiliza:  agente_carrito (0040).
-- Tablas:     agente_carrito gana caducidad_avisada_at (NULL = aún sin avisar).
-- Riesgo:     bajo. Columna nueva y opcional; los permisos de tabla ya cubren la columna.
--             Antes el aviso marcaba el carrito como «descartado» y el agente olvidaba qué se había
--             perdido: al decir el cliente «quiero recuperarlo» no sabía qué recuperar.
-- Alcance:    MVP.
--
-- Reversión:
--   ALTER TABLE public.agente_carrito DROP COLUMN caducidad_avisada_at;
-- =============================================================================

ALTER TABLE public.agente_carrito
  ADD COLUMN caducidad_avisada_at timestamptz NULL;

COMMENT ON COLUMN public.agente_carrito.caducidad_avisada_at IS
  'Cuándo se avisó al cliente de que este carrito caducó. NULL: aún no. El carrito sigue «caducado» para que el agente pueda recuperarlo si el cliente lo pide.';
