-- =============================================================================
-- 0031 · Permitir desvincular la auditoría de un restaurante borrado
--
-- Componente: base de datos (auditoría) + apps/api (borrado de restaurantes desde /interno)
-- Reutiliza:  public.auditoria y su FK `restaurante_id ... ON DELETE SET NULL` (0001)
-- Tablas:     auditoria (solo la función del trigger de inmutabilidad)
-- Riesgo:     bajo-medio. Toca una garantía de inmutabilidad, por eso es lo más estrecha posible:
--             - DELETE sigue prohibido siempre.
--             - UPDATE solo se permite si lo ÚNICO que cambia es restaurante_id de un valor a NULL
--               (lo que hace el SET NULL de la FK al borrar el restaurante). Cualquier otro cambio
--               en la fila sigue fallando.
--             Sin este cambio, borrar un restaurante con auditoría fallaría: el SET NULL de la FK
--             es un UPDATE y el trigger lo bloqueaba.
--
-- Reversión: volver a la función original de 0001 (siempre RAISE EXCEPTION).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.restaurante_id IS NOT NULL
     AND NEW.restaurante_id IS NULL
     AND (to_jsonb(NEW) - 'restaurante_id') = (to_jsonb(OLD) - 'restaurante_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar';
END;
$$;
