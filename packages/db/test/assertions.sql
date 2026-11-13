-- Comprobaciones tras aplicar migraciones y propuestas. Cada bloque falla con un mensaje claro.

-- Un rol propio del restaurante B no se puede asignar a un miembro del restaurante A.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.membresia_rol (membership_id, rol_id)
    SELECT m.id, r.id FROM public.local_memberships m, public.rol r
    WHERE m.restaurante_id = 9001 AND r.restaurante_id = 9002 AND r.code = 'cajero';
    RAISE EXCEPTION 'FALLO: se asignó un rol de otro restaurante';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;
END $$;

-- La auditoría es inmutable.
INSERT INTO public.auditoria (actor_tipo, accion, recurso_tipo, resultado)
VALUES ('sistema', 'prueba', 'test', 'ok');
DO $$
BEGIN
  BEGIN
    DELETE FROM public.auditoria;
    RAISE EXCEPTION 'FALLO: se pudo borrar la auditoría';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
  END;
END $$;

-- Cada pedido tiene token de seguimiento único y no adivinable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE tracking_token IS NULL) THEN
    RAISE EXCEPTION 'FALLO: pedido sin tracking_token';
  END IF;
  IF (SELECT count(DISTINCT tracking_token) FROM public.pedidos) <> (SELECT count(*) FROM public.pedidos) THEN
    RAISE EXCEPTION 'FALLO: tracking_token repetido';
  END IF;
END $$;

-- Tras la propuesta 0100, insertar sin restaurante falla.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.pedidos (telefono) VALUES ('+34600000009');
    RAISE EXCEPTION 'FALLO: se creó un pedido sin restaurante';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;
END $$;

-- El catálogo de acceso está completo.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.rol WHERE es_plantilla) <> 6 THEN
    RAISE EXCEPTION 'FALLO: faltan plantillas de rol';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permiso p LEFT JOIN public.modulo m ON m.code = p.modulo_code WHERE m.code IS NULL) THEN
    RAISE EXCEPTION 'FALLO: permiso sin módulo';
  END IF;
END $$;

-- Sucursales (0003): cada restaurante tiene exactamente una principal, incluida la de alta nueva.
INSERT INTO public.restaurante (id, nombre, slug) OVERRIDING SYSTEM VALUE VALUES (9003, 'Restaurante C', 'test-c');
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.restaurante r
    WHERE (SELECT count(*) FROM public.sucursal s WHERE s.restaurante_id = r.id AND s.es_principal) <> 1
  ) THEN
    RAISE EXCEPTION 'FALLO: restaurante sin exactamente una sucursal principal';
  END IF;
END $$;

-- Un pedido sin sucursal (como los de n8n) recibe la principal.
DO $$
DECLARE v_sucursal bigint;
BEGIN
  INSERT INTO public.pedidos (restaurante_id, telefono) VALUES (9001, '+34600000010')
  RETURNING sucursal_id INTO v_sucursal;
  IF v_sucursal IS DISTINCT FROM
     (SELECT id FROM public.sucursal WHERE restaurante_id = 9001 AND es_principal) THEN
    RAISE EXCEPTION 'FALLO: pedido sin sucursal no recibió la principal';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos WHERE restaurante_id IS NOT NULL AND sucursal_id IS NULL) THEN
    RAISE EXCEPTION 'FALLO: quedan pedidos sin sucursal tras el relleno';
  END IF;
END $$;

-- No se puede usar la sucursal de otro restaurante.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.pedidos (restaurante_id, telefono, sucursal_id)
    SELECT 9001, '+34600000011', id FROM public.sucursal WHERE restaurante_id = 9002 AND es_principal;
    RAISE EXCEPTION 'FALLO: pedido con sucursal de otro restaurante';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.membresia_sucursal (membership_id, sucursal_id)
    SELECT m.id, s.id FROM public.local_memberships m, public.sucursal s
    WHERE m.restaurante_id = 9001 AND s.restaurante_id = 9002;
    RAISE EXCEPTION 'FALLO: miembro restringido a sucursal de otro restaurante';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Alérgenos: por defecto «no informados» (NULL) y solo se aceptan los 14 códigos de la UE.
INSERT INTO public.menu_category (menu_category_id, name, restaurante_id) VALUES (9101, 'Prueba', 9001);
INSERT INTO public.menu_item (menu_item_id, menu_category_id, name, restaurante_id)
VALUES (9201, 9101, 'Sin datos', 9001);
DO $$
BEGIN
  IF (SELECT alergenos FROM public.menu_item WHERE menu_item_id = 9201) IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO: un producto nuevo no debe tener alérgenos declarados';
  END IF;
  UPDATE public.menu_item SET alergenos = '{gluten,lacteos}' WHERE menu_item_id = 9201;
  BEGIN
    UPDATE public.menu_item SET alergenos = '{gluten,picante}' WHERE menu_item_id = 9201;
    RAISE EXCEPTION 'FALLO: se aceptó un alérgeno que no es de la lista de la UE';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.extra (name, restaurante_id, alergenos) VALUES ('Malo', 9001, '{nueces}');
    RAISE EXCEPTION 'FALLO: se aceptó un alérgeno desconocido en un extra';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Una invitación no puede llevar un rol ni un local de otro restaurante.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.restaurant_invites (restaurante_id, created_by, rol_id)
    SELECT 9001, gen_random_uuid(), r.id FROM public.rol r WHERE r.restaurante_id = 9002 LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'FALLO: invitación con rol de otro restaurante'; END IF;
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.restaurant_invites (restaurante_id, created_by, sucursal_ids)
    SELECT 9001, gen_random_uuid(), ARRAY[s.id] FROM public.sucursal s WHERE s.restaurante_id = 9002 LIMIT 1;
    RAISE EXCEPTION 'FALLO: invitación con local de otro restaurante';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- Nombre y apodo de los miembros: opcionales, pero sin vacíos ni más de 80 caracteres.
DO $$
DECLARE
  v_bad text;
BEGIN
  FOREACH v_bad IN ARRAY ARRAY['', '   ', repeat('x', 81)] LOOP
    BEGIN
      UPDATE public.local_memberships SET nombre = v_bad WHERE restaurante_id = 9001;
      RAISE EXCEPTION 'FALLO: se aceptó el nombre de longitud %', length(v_bad);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
      UPDATE public.local_memberships SET apodo = v_bad WHERE restaurante_id = 9001;
      RAISE EXCEPTION 'FALLO: se aceptó el apodo de longitud %', length(v_bad);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;
  UPDATE public.local_memberships SET nombre = 'Ana', apodo = NULL WHERE restaurante_id = 9001;
  UPDATE public.local_memberships SET nombre = NULL WHERE restaurante_id = 9001;
END $$;

-- Alta con prueba: el plan «prueba» trae los módulos de premium, la configuración de plataforma
-- nace apagada y fn_restaurante_acepta_pedidos aplica estado, fecha y pedidos reales.
DO $$
DECLARE
  v_ahora timestamptz := '2026-11-03 12:00:00+00';
  v_base  integer;
BEGIN
  -- Pedidos reales que ya tiene el restaurante de las fixtures.
  SELECT count(*) INTO v_base FROM public.pedidos
  WHERE restaurante_id = 9001 AND estado NOT IN ('en_curso', 'expirado', 'cancelado');
  IF (SELECT count(*) FROM public.plan_modulo WHERE plan_code = 'prueba')
     <> (SELECT count(*) FROM public.plan_modulo WHERE plan_code = 'premium') THEN
    RAISE EXCEPTION 'FALLO: el plan prueba no tiene los módulos de premium';
  END IF;
  IF (SELECT valor FROM public.plataforma_config WHERE clave = 'alta_autoservicio_activa') IS DISTINCT FROM to_jsonb(false) THEN
    RAISE EXCEPTION 'FALLO: el alta autoservicio no nace apagada';
  END IF;
  IF (SELECT count(*) FROM public.plataforma_config) <> 5 THEN
    RAISE EXCEPTION 'FALLO: plataforma_config debe sembrar solo 5 claves';
  END IF;

  -- Sin prueba: acepta pedidos.
  IF NOT public.fn_restaurante_acepta_pedidos(9001, v_ahora) THEN
    RAISE EXCEPTION 'FALLO: un restaurante sin prueba debe aceptar pedidos';
  END IF;

  INSERT INTO public.restaurante_prueba (restaurante_id, user_id, estado, inicio, fin, max_pedidos)
  VALUES (9001, gen_random_uuid(), 'activa', v_ahora - interval '1 day', v_ahora + interval '1 day', v_base + 2);
  IF NOT public.fn_restaurante_acepta_pedidos(9001, v_ahora) THEN
    RAISE EXCEPTION 'FALLO: prueba activa vigente debe aceptar pedidos';
  END IF;
  IF public.fn_restaurante_acepta_pedidos(9001, v_ahora + interval '2 days') THEN
    RAISE EXCEPTION 'FALLO: prueba vencida por fecha debe rechazar pedidos';
  END IF;

  -- Carritos, expirados y cancelados no cuentan; dos pedidos reales agotan el máximo.
  INSERT INTO public.pedidos (restaurante_id, telefono, estado) VALUES
    (9001, '+34600000000', 'en_curso'), (9001, '+34600000000', 'expirado'),
    (9001, '+34600000000', 'cancelado'), (9001, '+34600000000', 'entregado');
  IF NOT public.fn_restaurante_acepta_pedidos(9001, v_ahora) THEN
    RAISE EXCEPTION 'FALLO: solo un pedido real, aún debe aceptar';
  END IF;
  INSERT INTO public.pedidos (restaurante_id, telefono, estado) VALUES (9001, '+34600000000', 'recibido');
  IF public.fn_restaurante_acepta_pedidos(9001, v_ahora) THEN
    RAISE EXCEPTION 'FALLO: prueba sin pedidos restantes debe rechazar';
  END IF;

  UPDATE public.restaurante_prueba SET estado = 'convertida' WHERE restaurante_id = 9001;
  IF NOT public.fn_restaurante_acepta_pedidos(9001, v_ahora + interval '30 days') THEN
    RAISE EXCEPTION 'FALLO: prueba convertida debe aceptar pedidos';
  END IF;
  UPDATE public.restaurante_prueba SET estado = 'pendiente' WHERE restaurante_id = 9001;
  IF public.fn_restaurante_acepta_pedidos(9001) THEN
    RAISE EXCEPTION 'FALLO: prueba pendiente debe rechazar pedidos';
  END IF;
  UPDATE public.restaurante_prueba SET estado = 'rechazada' WHERE restaurante_id = 9001;
  IF public.fn_restaurante_acepta_pedidos(9001) THEN
    RAISE EXCEPTION 'FALLO: prueba rechazada debe rechazar pedidos';
  END IF;

  -- Un usuario, una prueba.
  BEGIN
    INSERT INTO public.restaurante_prueba (restaurante_id, user_id, estado)
    SELECT 9002, user_id, 'activa' FROM public.restaurante_prueba WHERE restaurante_id = 9001;
    RAISE EXCEPTION 'FALLO: un usuario con dos pruebas';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Se deja la base como estaba para los bloques siguientes.
  DELETE FROM public.restaurante_prueba WHERE restaurante_id = 9001;
  DELETE FROM public.pedidos WHERE restaurante_id = 9001 AND telefono = '+34600000000';
END $$;

-- Antifraude capa 3 (0026): el código no caduca antes de crearse, un código no verificado no se
-- consume, y el gasto del mes solo cuenta el mes natural del restaurante.
DO $$
DECLARE
  v_gasto numeric;
BEGIN
  BEGIN
    INSERT INTO public.verificacion_codigo (restaurante_id, telefono, canal, motivo, codigo_hash, caduca_at)
    VALUES (9001, '34600000001', 'sms', 'telefono_nuevo', 'x', now() - interval '1 minute');
    RAISE EXCEPTION 'FALLO: un código caducado al crearse';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.verificacion_codigo
      (restaurante_id, telefono, canal, motivo, codigo_hash, caduca_at, consumido_at)
    VALUES (9001, '34600000001', 'sms', 'telefono_nuevo', 'x', now() + interval '10 minutes', now());
    RAISE EXCEPTION 'FALLO: un código sin verificar quedó consumido';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.verificacion_codigo (restaurante_id, telefono, canal, motivo, codigo_hash, caduca_at)
    VALUES (9001, '600000001', 'sms', 'telefono_nuevo', 'x', now() + interval '10 minutes');
    RAISE EXCEPTION 'FALLO: teléfono sin normalizar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.verificacion_codigo (restaurante_id, telefono, canal, motivo, codigo_hash, caduca_at, coste_eur)
  VALUES (9001, '34600000001', 'whatsapp', 'telefono_nuevo', 'x', now() + interval '10 minutes', 0.0166);
  INSERT INTO public.verificacion_codigo (restaurante_id, telefono, canal, motivo, codigo_hash, created_at, caduca_at, coste_eur)
  VALUES (9001, '34600000001', 'sms', 'efectivo_reparto', 'x', now() - interval '70 days', now() - interval '70 days' + interval '10 minutes', 5);

  SELECT public.fn_codigo_gasto_mes(9001, now()) INTO v_gasto;
  IF v_gasto <> 0.0166 THEN
    RAISE EXCEPTION 'FALLO: el gasto del mes es %, esperado 0.0166', v_gasto;
  END IF;

  DELETE FROM public.verificacion_codigo WHERE restaurante_id = 9001;
END $$;

-- Canal de WhatsApp (0038): cada restaurante solo ve y toca lo suyo.
DO $$
DECLARE
  v_suc_b bigint;
  v_canal_a bigint;
  v_canal_b bigint;
  v_n int;
BEGIN
  INSERT INTO public.sucursal (restaurante_id, nombre, slug) VALUES (9002, 'Local B', 'wa-test-b') RETURNING id INTO v_suc_b;
  INSERT INTO public.canal_whatsapp (restaurante_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
  VALUES (9001, 'kapso', 'pn-test-a', '+34600000011', 'sandbox', 'activo') RETURNING id INTO v_canal_a;
  INSERT INTO public.canal_whatsapp (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion, estado)
  VALUES (9002, v_suc_b, 'kapso', 'pn-test-b', '+34600000012', 'sandbox', 'activo') RETURNING id INTO v_canal_b;

  -- El agente resuelve el restaurante por el número que recibe el mensaje.
  IF (SELECT restaurante_id FROM public.canal_whatsapp WHERE proveedor = 'kapso' AND phone_number_id = 'pn-test-a' AND estado = 'activo') <> 9001 THEN
    RAISE EXCEPTION 'FALLO: el número del restaurante A no resuelve al A';
  END IF;

  -- Un canal no puede apuntar al local de otro restaurante.
  BEGIN
    INSERT INTO public.canal_whatsapp (restaurante_id, sucursal_id, proveedor, phone_number_id, numero_e164, modo_conexion)
    VALUES (9001, v_suc_b, 'kapso', 'pn-test-x', '+34600000013', 'sandbox');
    RAISE EXCEPTION 'FALLO: un canal apunta al local de otro restaurante';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- El mismo número no puede estar en dos restaurantes.
  BEGIN
    INSERT INTO public.canal_whatsapp (restaurante_id, proveedor, phone_number_id, numero_e164, modo_conexion)
    VALUES (9002, 'kapso', 'pn-test-a', '+34600000014', 'sandbox');
    RAISE EXCEPTION 'FALLO: un mismo phone_number_id en dos restaurantes';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Una conversación no puede declararse de otro restaurante que el de su canal.
  BEGIN
    INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono) VALUES (v_canal_a, 9002, '34600000001');
    RAISE EXCEPTION 'FALLO: conversación de otro restaurante que su canal';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- El mismo cliente puede hablar con dos números y cada conversación tiene su pausa.
  INSERT INTO public.whatsapp_conversacion (canal_id, restaurante_id, telefono, pausado_hasta, pausado_por)
  VALUES (v_canal_a, 9001, '34600000001', now() + interval '1 hour', 'personal'),
         (v_canal_b, 9002, '34600000001', NULL, NULL);
  SELECT count(*) INTO v_n FROM public.whatsapp_conversacion WHERE restaurante_id = 9001;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALLO: el restaurante A ve % conversaciones, esperada 1', v_n;
  END IF;
  IF (SELECT pausado_hasta FROM public.whatsapp_conversacion WHERE canal_id = v_canal_b AND telefono = '34600000001') IS NOT NULL THEN
    RAISE EXCEPTION 'FALLO: la pausa de un número se aplicó a otro';
  END IF;

  -- Borrar el restaurante borra sus canales y conversaciones, no los de otro.
  DELETE FROM public.canal_whatsapp WHERE id = v_canal_b;
  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_conversacion WHERE canal_id = v_canal_a) THEN
    RAISE EXCEPTION 'FALLO: al borrar el canal B se perdió la conversación del A';
  END IF;

  -- Idempotencia: la misma entrega no se registra dos veces.
  INSERT INTO public.whatsapp_evento (clave) VALUES ('evt-test-1');
  BEGIN
    INSERT INTO public.whatsapp_evento (clave) VALUES ('evt-test-1');
    RAISE EXCEPTION 'FALLO: evento repetido aceptado';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Las claves del agente están documentadas y bot_activo ya no es la vigente.
  SELECT count(*) INTO v_n FROM public.config_clave WHERE clave LIKE 'agente\_%' AND estado = 'activa';
  IF v_n <> 7 THEN
    RAISE EXCEPTION 'FALLO: % claves agente_* documentadas, esperadas 7', v_n;
  END IF;

  -- Permisos de los roles, si existen en esta base.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n8n_agente') THEN
    IF NOT has_table_privilege('n8n_agente', 'public.whatsapp_evento', 'DELETE')
       OR has_table_privilege('n8n_agente', 'public.canal_whatsapp', 'INSERT') THEN
      RAISE EXCEPTION 'FALLO: permisos de n8n_agente sobre las tablas de WhatsApp';
    END IF;
  END IF;

  DELETE FROM public.whatsapp_evento WHERE clave = 'evt-test-1';
  DELETE FROM public.canal_whatsapp WHERE restaurante_id IN (9001, 9002);
  DELETE FROM public.sucursal WHERE id = v_suc_b;
END $$;
