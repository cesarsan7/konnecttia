-- =============================================================================
-- 0030 · País del restaurante (prefijo telefónico y bandera)
--
-- Componente: packages/domain (country.ts) + apps/api (alta, interno, ajustes, carta) + web
-- Reutiliza:  restaurante (zona_horaria para rellenar el país de los existentes)
-- Tablas:     NUEVA pais (catálogo); restaurante.pais_code (columna nueva, FK a pais)
-- Riesgo:     bajo. Los restaurantes existentes quedan en ES (el comportamiento de siempre:
--             números sin prefijo = +34), salvo los de zona horaria de EE. UU. que pasan a US.
--             El catálogo debe coincidir con packages/domain/src/country.ts (prueba catalog-sync).
--
-- Reversión:
--   ALTER TABLE public.restaurante DROP COLUMN pais_code;
--   DROP TABLE public.pais;
-- =============================================================================

CREATE TABLE public.pais (
  code    char(2) PRIMARY KEY,
  nombre  text    NOT NULL,
  prefijo text    NOT NULL CHECK (prefijo ~ '^\+[0-9]{1,4}$')
);

COMMENT ON TABLE public.pais IS 'Catálogo de países: prefijo telefónico por defecto del checkout y bandera (pieza prefijo-teléfono).';

INSERT INTO public.pais (code, nombre, prefijo) VALUES
  ('ES', 'España', '+34'),
  ('US', 'Estados Unidos', '+1'),
  ('MX', 'México', '+52'),
  ('CO', 'Colombia', '+57'),
  ('AR', 'Argentina', '+54'),
  ('CL', 'Chile', '+56'),
  ('PE', 'Perú', '+51'),
  ('EC', 'Ecuador', '+593'),
  ('VE', 'Venezuela', '+58'),
  ('UY', 'Uruguay', '+598'),
  ('PY', 'Paraguay', '+595'),
  ('BO', 'Bolivia', '+591'),
  ('CR', 'Costa Rica', '+506'),
  ('PA', 'Panamá', '+507'),
  ('DO', 'República Dominicana', '+1'),
  ('GT', 'Guatemala', '+502'),
  ('HN', 'Honduras', '+504'),
  ('SV', 'El Salvador', '+503'),
  ('NI', 'Nicaragua', '+505'),
  ('CU', 'Cuba', '+53'),
  ('PR', 'Puerto Rico', '+1'),
  ('BR', 'Brasil', '+55'),
  ('CA', 'Canadá', '+1'),
  ('PT', 'Portugal', '+351'),
  ('FR', 'Francia', '+33'),
  ('IT', 'Italia', '+39'),
  ('DE', 'Alemania', '+49'),
  ('GB', 'Reino Unido', '+44');

ALTER TABLE public.restaurante
  ADD COLUMN pais_code char(2) REFERENCES public.pais (code);

UPDATE public.restaurante
SET    pais_code = CASE
         WHEN zona_horaria ~ '^(America/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise)|Pacific/Honolulu)$' THEN 'US'
         ELSE 'ES'
       END;

ALTER TABLE public.restaurante
  ALTER COLUMN pais_code SET DEFAULT 'ES',
  ALTER COLUMN pais_code SET NOT NULL;

COMMENT ON COLUMN public.restaurante.pais_code IS 'País del restaurante: prefijo telefónico por defecto en el checkout.';
