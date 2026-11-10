-- =============================================================================
-- 0033 · Suscripción de pago (Stripe Billing)
--
-- Componente: base de datos + apps/api (checkout, portal y webhook de Stripe)
-- Reutiliza:  restaurante, restaurante_plan/applyPlan (el plan sigue siendo el que manda sobre los
--             módulos), auditoría
-- Tablas:     suscripcion, stripe_evento (nuevas; propuestas en el PR)
-- Riesgo:     bajo. Tablas nuevas; sin claves de Stripe configuradas no se crea ninguna fila y todo
--             sigue como hasta ahora (plan asignado a mano en /interno).
--
-- `suscripcion`: una fila por restaurante con su cliente y suscripción en Stripe, el plan que se
-- cobra, el estado y el fin del periodo pagado. No guarda datos de tarjeta (los tiene Stripe).
-- `stripe_evento`: ids de eventos ya procesados, para que un reintento del webhook no repita nada.
--
-- Reversión:
--   DROP TABLE public.stripe_evento;
--   DROP TABLE public.suscripcion;
-- =============================================================================

CREATE TABLE public.suscripcion (
  restaurante_id          int4 PRIMARY KEY REFERENCES public.restaurante (id) ON DELETE CASCADE,
  stripe_customer_id      text UNIQUE,
  stripe_subscription_id  text UNIQUE,
  plan_code               text REFERENCES public.plan (code),
  estado                  text NOT NULL DEFAULT 'incompleta'
                          CHECK (estado IN ('incompleta', 'activa', 'impago', 'cancelada')),
  periodo_fin             timestamptz,
  cancelar_al_final       boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suscripcion IS
  'Suscripción de pago de un restaurante en Stripe Billing: estado y plan cobrado. Sin datos de tarjeta.';

CREATE TABLE public.stripe_evento (
  id          text PRIMARY KEY,
  tipo        text NOT NULL,
  recibido_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_evento IS
  'Eventos de Stripe ya procesados (idempotencia del webhook).';
