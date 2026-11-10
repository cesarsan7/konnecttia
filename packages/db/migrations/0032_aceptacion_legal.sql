-- =============================================================================
-- 0032 · Aceptación de documentos legales en el alta
--
-- Componente: base de datos + apps/api (POST /alta)
-- Reutiliza:  restaurante, auditoría (el alta ya queda registrada)
-- Tablas:     aceptacion_legal (nueva)
-- Riesgo:     bajo. Tabla nueva; ningún flujo existente la lee. El alta autoservicio pasa a
--             exigir la aceptación (`acepta_legal`), así que la web y la API se despliegan juntas.
--
-- Una fila por documento y versión aceptados por un restaurante: prueba de qué texto aceptó, quién
-- y cuándo. No guarda IP. Se borra con el restaurante.
--
-- Reversión:
--   DROP TABLE public.aceptacion_legal;
-- =============================================================================

CREATE TABLE public.aceptacion_legal (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id  int4        NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL,
  email           text        NOT NULL,
  documento       text        NOT NULL CHECK (documento IN ('terminos', 'encargado', 'cookies')),
  version         text        NOT NULL,
  aceptado_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aceptacion_legal_unica UNIQUE (restaurante_id, documento, version)
);

CREATE INDEX ix_aceptacion_legal_restaurante ON public.aceptacion_legal (restaurante_id);

COMMENT ON TABLE public.aceptacion_legal IS
  'Documentos legales aceptados por un restaurante (documento + versión), con quién y cuándo.';
