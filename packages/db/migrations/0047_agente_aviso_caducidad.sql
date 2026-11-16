-- 0047 · Aviso previo a la caducidad del carrito del agente (ADR 0013, módulo whatsapp.agent_pro).
--
-- Componente: API del agente (mantenimiento de caducidad). Reutiliza: agente_carrito (0040).
-- Tablas:     agente_carrito (+1 columna nullable).
-- Riesgo:     bajo. Columna nueva sin valor por defecto; nada existente la lee.
-- Reversible: ALTER TABLE public.agente_carrito DROP COLUMN aviso_caducidad_at;
--
-- `aviso_caducidad_at` marca que ya se avisó al cliente de que su carrito va a caducar, para no
-- avisar dos veces. Si el cliente cambia el carrito (updated_at posterior) se vuelve a poder avisar.

ALTER TABLE public.agente_carrito ADD COLUMN IF NOT EXISTS aviso_caducidad_at timestamptz NULL;

COMMENT ON COLUMN public.agente_carrito.aviso_caducidad_at IS
  'Cuándo se avisó al cliente de que el carrito iba a caducar. Si es anterior a updated_at, el carrito cambió después y puede avisarse otra vez.';
