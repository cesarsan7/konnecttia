-- =============================================================================
-- 0005 · Tarifas de reparto parametrizables
--
-- Una zona de reparto define DÓNDE se reparte y CUÁNTO cuesta:
--   Cobertura: radio (lat_center/lng_center/radius_km), código postal, o toda la ciudad
--              (cubre_todo = true, para una tarifa única sin zonas).
--   Tarifa:    tipo_tarifa = 'fija'   -> fee
--              tipo_tarifa = 'por_km' -> fee (base) + tarifa_por_km × km desde el local,
--                                        con tope opcional tarifa_maxima.
--   Extras:    envio_gratis_desde (envío gratis a partir de ese importe de productos),
--              min_order_amount y estimated_minutes_min/max (ya existían).
--
-- Compatibilidad: todas las zonas existentes quedan como 'fija' y sin envío gratis, que es
-- exactamente como funcionan hoy en n8n y en el dashboard.
-- Reversión: DROP de las columnas nuevas y restaurar el CHECK original (ver final).
-- =============================================================================

ALTER TABLE public.delivery_zone
  ADD COLUMN tipo_tarifa        varchar(10)   NOT NULL DEFAULT 'fija',
  ADD COLUMN tarifa_por_km      numeric(10,2) NULL,
  ADD COLUMN tarifa_maxima      numeric(10,2) NULL,
  ADD COLUMN envio_gratis_desde numeric(10,2) NULL,
  ADD COLUMN cubre_todo         boolean       NOT NULL DEFAULT false;

ALTER TABLE public.delivery_zone
  ADD CONSTRAINT delivery_zone_tipo_tarifa_check
    CHECK (tipo_tarifa IN ('fija', 'por_km')),
  ADD CONSTRAINT delivery_zone_por_km_check
    CHECK (tipo_tarifa <> 'por_km' OR (tarifa_por_km IS NOT NULL AND tarifa_por_km >= 0)),
  ADD CONSTRAINT delivery_zone_importes_check
    CHECK (fee >= 0
       AND (tarifa_maxima IS NULL OR tarifa_maxima >= fee)
       AND (envio_gratis_desde IS NULL OR envio_gratis_desde > 0));

-- La cobertura puede ser también «toda la ciudad».
ALTER TABLE public.delivery_zone DROP CONSTRAINT delivery_zone_geo_or_postal_check;
ALTER TABLE public.delivery_zone
  ADD CONSTRAINT delivery_zone_geo_or_postal_check CHECK (
    cubre_todo
    OR postal_code IS NOT NULL
    OR (lat_center IS NOT NULL AND lng_center IS NOT NULL AND radius_km IS NOT NULL)
  );

COMMENT ON COLUMN public.delivery_zone.tipo_tarifa IS
  'fija: fee. por_km: fee + tarifa_por_km × km (línea recta desde el local), tope tarifa_maxima.';
COMMENT ON COLUMN public.delivery_zone.envio_gratis_desde IS
  'Importe de productos a partir del cual el envío es gratis. NULL: nunca.';
COMMENT ON COLUMN public.delivery_zone.cubre_todo IS
  'Zona sin límite geográfico (tarifa única para cualquier dirección). n8n la reconoce por nombre.';

-- =============================================================================
-- DOWN (manual):
--   ALTER TABLE public.delivery_zone DROP CONSTRAINT delivery_zone_geo_or_postal_check;
--   ALTER TABLE public.delivery_zone ADD CONSTRAINT delivery_zone_geo_or_postal_check
--     CHECK (postal_code IS NOT NULL OR (lat_center IS NOT NULL AND lng_center IS NOT NULL AND radius_km IS NOT NULL));
--   ALTER TABLE public.delivery_zone DROP COLUMN tipo_tarifa, DROP COLUMN tarifa_por_km,
--     DROP COLUMN tarifa_maxima, DROP COLUMN envio_gratis_desde, DROP COLUMN cubre_todo;
-- =============================================================================
