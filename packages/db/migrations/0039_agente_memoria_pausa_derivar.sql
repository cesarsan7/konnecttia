-- =============================================================================
-- 0039 · Agente de WhatsApp: memoria aislada por restaurante y pausa al derivar
--
-- Componente: base de datos (agente de WhatsApp en n8n y API /agente)
-- Reutiliza:  n8n_chat_histories y su trigger fn_n8n_chat_set_restaurante_id (baseline),
--             config_clave (0007)
-- Tablas:     función fn_n8n_chat_set_restaurante_id (se reemplaza); fila nueva en config_clave
-- Riesgo:     bajo-medio. El trigger deja de asignar el restaurante 1 cuando la clave de sesión
--             no lo identifica: ahora la escritura falla. Acepta el formato nuevo
--             «{restaurante_id}:{telefono}» y el antiguo «{restaurante_id}_{resto}» (flujos de
--             staging copiados de La Isla), así que nada de lo que hoy funciona deja de hacerlo.
--             La demo de La Isla usa otra base y no se ve afectada.
-- MVP:        sí (diseño en integrations/n8n/diseno/agente-carta-real.md)
--
-- Reversión:
--   Volver a crear la función con el cuerpo de 0000_baseline.sql (fn_n8n_chat_set_restaurante_id);
--   DELETE FROM public.restaurante_config WHERE config_key = 'agente_pausa_derivar_minutos';
--   DELETE FROM public.config_clave WHERE clave = 'agente_pausa_derivar_minutos';
-- =============================================================================

-- La memoria del agente (nodo «Postgres Chat Memory» de n8n) no envía restaurante_id: se saca
-- del prefijo de la clave de sesión. Sin prefijo válido NO se asigna ningún restaurante por
-- defecto: una conversación nunca puede quedar guardada en el restaurante equivocado.
CREATE OR REPLACE FUNCTION public.fn_n8n_chat_set_restaurante_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prefix text;
  v_rid    integer;
BEGIN
  IF NEW.restaurante_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- «{restaurante_id}:{telefono}» (agente con Kapso) o «{restaurante_id}_{resto}» (flujos antiguos).
  v_prefix := substring(COALESCE(NEW.session_id, '') FROM '^([0-9]{1,9})[:_]');
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'n8n_chat_histories: la clave de sesión no identifica al restaurante'
      USING ERRCODE = 'check_violation';
  END IF;

  v_rid := v_prefix::integer;
  IF NOT EXISTS (SELECT 1 FROM public.restaurante WHERE id = v_rid) THEN
    RAISE EXCEPTION 'n8n_chat_histories: el restaurante % de la clave de sesión no existe', v_rid
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.restaurante_id := v_rid;
  RETURN NEW;
END;
$function$;

-- Pausa del agente cuando él mismo deriva la conversación a una persona (reclamo, caso sensible).
INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('agente_pausa_derivar_minutos', 'Minutos que el agente se calla en una conversación después de derivarla a una persona (reclamo o caso sensible), para que el personal responda desde su app. Sin clave o 0: no se pausa y el agente sigue respondiendo.', 'entero', 'minutos', '120', '{n8n,panel-easyorder,api-konnecttia}');
