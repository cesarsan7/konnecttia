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
