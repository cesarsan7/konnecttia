-- =============================================================================
-- PROPUESTA (no se aplica automáticamente) — restaurante_id obligatorio
--
-- Componente: base de datos compartida por API y n8n
-- Tablas:     pedidos, usuarios, contexto, faqs, horarios, config_operativa,
--             escalaciones, restaurante_mesas, n8n_chat_histories
-- Riesgo:     medio. Cualquier INSERT de n8n o de la API que no envíe restaurante_id
--             empezará a fallar en lugar de crear filas huérfanas. Es el objetivo,
--             pero hay que verificarlo en staging con los flujos de n8n activos.
-- Requisito:  checks/null_tenant_report.sql devuelve 0 en todas las tablas.
-- Fase:       MVP (bloque de aislamiento)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_tabla text;
  v_nulos bigint;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['pedidos', 'usuarios', 'contexto', 'faqs', 'horarios',
    'config_operativa', 'escalaciones', 'restaurante_mesas', 'n8n_chat_histories']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE restaurante_id IS NULL', v_tabla)
      INTO v_nulos;
    IF v_nulos > 0 THEN
      RAISE EXCEPTION 'La tabla % tiene % filas sin restaurante_id. Corrígelas antes de continuar.',
        v_tabla, v_nulos;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.pedidos            ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.usuarios           ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.contexto           ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.faqs               ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.horarios           ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.config_operativa   ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.escalaciones       ALTER COLUMN restaurante_id SET NOT NULL;
ALTER TABLE public.restaurante_mesas  ALTER COLUMN restaurante_id SET NOT NULL;
-- El trigger trg_n8n_chat_set_restaurante_id rellena la columna antes de insertar.
ALTER TABLE public.n8n_chat_histories ALTER COLUMN restaurante_id SET NOT NULL;

COMMIT;
