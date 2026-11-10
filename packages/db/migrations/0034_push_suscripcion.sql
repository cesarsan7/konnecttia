-- =============================================================================
-- 0034 · Suscripciones Web Push del personal del local
--
-- Componente: base de datos + apps/api (alta/baja de la suscripción y envío del aviso)
-- Reutiliza:  restaurante, permisos del panel (orders.view)
-- Tablas:     push_suscripcion (nueva; propuesta en el PR)
-- Riesgo:     bajo. Tabla nueva; sin claves VAPID configuradas no se envía nada.
--
-- Una fila por navegador/dispositivo que activó los avisos del tablero. `endpoint` es único: si
-- el mismo navegador se vuelve a suscribir, se actualiza. Las filas caducadas (el servicio push
-- responde 404/410) las borra la propia API al intentar enviar.
--
-- Reversión:
--   DROP TABLE public.push_suscripcion;
-- =============================================================================

CREATE TABLE public.push_suscripcion (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL,
  endpoint       text NOT NULL UNIQUE,
  p256dh         text NOT NULL,
  auth           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_ok_at     timestamptz
);

CREATE INDEX ix_push_suscripcion_restaurante ON public.push_suscripcion (restaurante_id);

COMMENT ON TABLE public.push_suscripcion IS
  'Navegadores del personal suscritos a los avisos push de pedido nuevo (Web Push). Sin datos del cliente.';
