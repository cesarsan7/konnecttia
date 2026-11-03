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
  IF (SELECT count(*) FROM public.rol WHERE es_plantilla) <> 4 THEN
    RAISE EXCEPTION 'FALLO: faltan plantillas de rol';
  END IF;
  IF EXISTS (SELECT 1 FROM public.permiso p LEFT JOIN public.modulo m ON m.code = p.modulo_code WHERE m.code IS NULL) THEN
    RAISE EXCEPTION 'FALLO: permiso sin módulo';
  END IF;
END $$;
