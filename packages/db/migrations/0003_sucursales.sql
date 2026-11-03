-- =============================================================================
-- 0003 · Sucursales (locales físicos de un restaurante)
--
-- Un restaurante (tenant) puede tener varios locales. En la interfaz se llaman «locales»;
-- en la base se llaman `sucursal` para no confundirlos con `local_memberships`, que en el
-- esquema heredado significa «miembro del restaurante».
--
-- Compatibilidad con n8n y el dashboard actual de EasyOrder:
--   * Cada restaurante tiene exactamente una sucursal principal, creada automáticamente
--     (también para los restaurantes que se den de alta después).
--   * Las columnas `sucursal_id` nuevas son opcionales: si un INSERT no la indica, un trigger
--     asigna la sucursal principal. Los flujos que no conocen sucursales siguen funcionando.
--   * `horarios` no se toca: es el horario general del restaurante. Una sucursal solo necesita
--     filas en `sucursal_horario` si su horario es distinto.
--
-- Reversión: ver el bloque «DOWN» al final (comentado).
-- =============================================================================

CREATE TABLE public.sucursal (
  id               bigserial    PRIMARY KEY,
  restaurante_id   int4         NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  nombre           varchar(120) NOT NULL,
  slug             varchar(60)  NOT NULL,
  direccion        text         NULL,
  lat              numeric(10, 8) NULL,
  lng              numeric(11, 8) NULL,
  telefono         text         NULL,
  es_principal     boolean      NOT NULL DEFAULT false,
  activo           boolean      NOT NULL DEFAULT true,
  acepta_recogida  boolean      NOT NULL DEFAULT true,
  acepta_reparto   boolean      NOT NULL DEFAULT true,
  -- NULL = sigue el horario; true/false = abierto/cerrado manualmente (solo esta sucursal).
  forzar_abierto   boolean      NULL,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT sucursal_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT sucursal_coords_check CHECK ((lat IS NULL) = (lng IS NULL)),
  CONSTRAINT sucursal_restaurante_slug_key UNIQUE (restaurante_id, slug),
  CONSTRAINT sucursal_id_restaurante_key UNIQUE (id, restaurante_id)
);

-- Una sola sucursal principal por restaurante.
CREATE UNIQUE INDEX ux_sucursal_principal ON public.sucursal (restaurante_id) WHERE es_principal;

COMMENT ON TABLE public.sucursal IS
  'Locales físicos de un restaurante. La principal recibe todo lo que no indica sucursal.';

-- Horario propio de una sucursal. Sin filas => se usa public.horarios del restaurante.
CREATE TABLE public.sucursal_horario (
  id           bigserial PRIMARY KEY,
  sucursal_id  bigint    NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
  dia          text      NOT NULL,
  disponible   boolean   NOT NULL DEFAULT true,
  apertura_1   time      NULL,
  cierre_1     time      NULL,
  apertura_2   time      NULL,
  cierre_2     time      NULL,
  CONSTRAINT sucursal_horario_dia_key UNIQUE (sucursal_id, dia)
);

-- Productos agotados o no ofrecidos en una sucursal concreta (la carta es del restaurante).
CREATE TABLE public.sucursal_item_no_disponible (
  sucursal_id   bigint      NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
  menu_item_id  bigint      NOT NULL REFERENCES public.menu_item(menu_item_id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sucursal_id, menu_item_id)
);

-- Restricción de miembros a sucursales. Sin filas para un miembro => acceso a todas.
CREATE TABLE public.membresia_sucursal (
  membership_id  bigint NOT NULL REFERENCES public.local_memberships(id) ON DELETE CASCADE,
  sucursal_id    bigint NOT NULL REFERENCES public.sucursal(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, sucursal_id)
);

COMMENT ON TABLE public.membresia_sucursal IS
  'Si un miembro tiene filas aquí, solo ve y opera esas sucursales. Sin filas: todas.';

-- -----------------------------------------------------------------------------
-- Sucursal principal para cada restaurante existente, con los datos del propio restaurante.
-- -----------------------------------------------------------------------------
INSERT INTO public.sucursal
  (restaurante_id, nombre, slug, direccion, lat, lng, telefono, es_principal,
   acepta_recogida, acepta_reparto)
SELECT r.id, r.nombre, 'principal', r.direccion,
       CASE WHEN r.lat IS NOT NULL AND r.long IS NOT NULL THEN r.lat END,
       CASE WHEN r.lat IS NOT NULL AND r.long IS NOT NULL THEN r.long END,
       r.telefono, true, r.pickup_enabled, r.delivery_enabled
FROM public.restaurante r;

CREATE FUNCTION public.fn_crear_sucursal_principal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.sucursal
    (restaurante_id, nombre, slug, direccion, lat, lng, telefono, es_principal,
     acepta_recogida, acepta_reparto)
  VALUES (
    NEW.id, NEW.nombre, 'principal', NEW.direccion,
    CASE WHEN NEW.lat IS NOT NULL AND NEW.long IS NOT NULL THEN NEW.lat END,
    CASE WHEN NEW.lat IS NOT NULL AND NEW.long IS NOT NULL THEN NEW.long END,
    NEW.telefono, true, NEW.pickup_enabled, NEW.delivery_enabled
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_restaurante_sucursal_principal
  AFTER INSERT ON public.restaurante
  FOR EACH ROW EXECUTE FUNCTION public.fn_crear_sucursal_principal();

-- -----------------------------------------------------------------------------
-- sucursal_id en las tablas operativas. Se rellena con la principal antes de crear el trigger.
-- -----------------------------------------------------------------------------
ALTER TABLE public.pedidos           ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);
ALTER TABLE public.delivery_zone     ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);
ALTER TABLE public.zona_mesa         ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);
ALTER TABLE public.mesa              ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);
ALTER TABLE public.restaurante_mesas ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);
ALTER TABLE public.meseros           ADD COLUMN sucursal_id bigint NULL REFERENCES public.sucursal(id);

UPDATE public.pedidos t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;
UPDATE public.delivery_zone t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;
UPDATE public.zona_mesa t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;
UPDATE public.mesa t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;
UPDATE public.restaurante_mesas t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;
UPDATE public.meseros t SET sucursal_id = s.id
FROM public.sucursal s WHERE s.restaurante_id = t.restaurante_id AND s.es_principal;

CREATE INDEX idx_pedidos_sucursal_fecha ON public.pedidos (restaurante_id, sucursal_id, created_at DESC);
CREATE INDEX idx_delivery_zone_sucursal ON public.delivery_zone (sucursal_id);
CREATE INDEX idx_mesa_sucursal ON public.mesa (sucursal_id);

/**
 * Asigna la sucursal principal cuando no se indica y garantiza que la sucursal pertenece al
 * mismo restaurante que la fila. Genérica: sirve para cualquier tabla con
 * restaurante_id + sucursal_id.
 */
CREATE FUNCTION public.fn_sucursal_asignar_y_validar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_row         jsonb  := to_jsonb(NEW);
  v_restaurante bigint := (v_row ->> 'restaurante_id')::bigint;
  v_sucursal    bigint := (v_row ->> 'sucursal_id')::bigint;
BEGIN
  IF v_restaurante IS NULL THEN
    IF v_sucursal IS NOT NULL THEN
      RAISE EXCEPTION 'sucursal_id % sin restaurante_id en %', v_sucursal, TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_sucursal IS NULL THEN
    SELECT id INTO v_sucursal
    FROM public.sucursal
    WHERE restaurante_id = v_restaurante AND es_principal;
    RETURN jsonb_populate_record(NEW, jsonb_build_object('sucursal_id', v_sucursal));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sucursal WHERE id = v_sucursal AND restaurante_id = v_restaurante
  ) THEN
    RAISE EXCEPTION 'La sucursal % no pertenece al restaurante % (%)',
      v_sucursal, v_restaurante, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pedidos_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.pedidos FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();
CREATE TRIGGER trg_delivery_zone_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.delivery_zone FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();
CREATE TRIGGER trg_zona_mesa_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.zona_mesa FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();
CREATE TRIGGER trg_mesa_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.mesa FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();
CREATE TRIGGER trg_restaurante_mesas_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.restaurante_mesas FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();
CREATE TRIGGER trg_meseros_sucursal BEFORE INSERT OR UPDATE OF sucursal_id, restaurante_id
  ON public.meseros FOR EACH ROW EXECUTE FUNCTION public.fn_sucursal_asignar_y_validar();

-- Miembros: la sucursal debe ser del mismo restaurante que la membresía.
CREATE FUNCTION public.fn_check_membresia_sucursal_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.local_memberships m
    JOIN public.sucursal s ON s.restaurante_id = m.restaurante_id
    WHERE m.id = NEW.membership_id AND s.id = NEW.sucursal_id
  ) THEN
    RAISE EXCEPTION 'La sucursal % no es del restaurante de la membresía %',
      NEW.sucursal_id, NEW.membership_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_membresia_sucursal_tenant
  BEFORE INSERT OR UPDATE ON public.membresia_sucursal
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_membresia_sucursal_tenant();

-- Disponibilidad por sucursal: el producto debe ser del mismo restaurante que la sucursal.
CREATE FUNCTION public.fn_check_sucursal_item_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sucursal s
    JOIN public.menu_item i ON i.restaurante_id = s.restaurante_id
    WHERE s.id = NEW.sucursal_id AND i.menu_item_id = NEW.menu_item_id
  ) THEN
    RAISE EXCEPTION 'El producto % no es del restaurante de la sucursal %',
      NEW.menu_item_id, NEW.sucursal_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sucursal_item_tenant
  BEFORE INSERT OR UPDATE ON public.sucursal_item_no_disponible
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_sucursal_item_tenant();

-- =============================================================================
-- DOWN (manual, solo si hiciera falta revertir):
--   DROP TRIGGER trg_pedidos_sucursal ON public.pedidos;  (y el resto de trg_*_sucursal)
--   ALTER TABLE public.pedidos DROP COLUMN sucursal_id;  (y el resto de tablas)
--   DROP TRIGGER trg_restaurante_sucursal_principal ON public.restaurante;
--   DROP TABLE public.membresia_sucursal, public.sucursal_item_no_disponible,
--              public.sucursal_horario, public.sucursal;
--   DROP FUNCTION public.fn_sucursal_asignar_y_validar(), public.fn_crear_sucursal_principal(),
--                 public.fn_check_membresia_sucursal_tenant(), public.fn_check_sucursal_item_tenant();
-- =============================================================================
