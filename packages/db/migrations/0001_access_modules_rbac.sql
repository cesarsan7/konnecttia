-- =============================================================================
-- 0001_access_modules_rbac.sql — Módulos por restaurante, planes y RBAC
--
-- Componente: packages/access + apps/api + apps/admin
-- Reutiliza:  restaurante, local_memberships (se conserva su columna `rol`)
-- Riesgo:     bajo. Solo AÑADE tablas y datos; no cambia ni borra nada existente,
--             así que el código actual de EasyOrder y los flujos de n8n siguen igual.
-- Fase:       MVP
--
-- Regla de acceso: módulo activo para el restaurante  Y  permiso concedido por un rol.
-- El catálogo (módulos, permisos, plantillas de rol) debe coincidir con
-- packages/access/src; una prueba de packages/db lo comprueba.
-- =============================================================================

BEGIN;

CREATE TABLE public.modulo (
  code        text PRIMARY KEY,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('core', 'plan', 'addon', 'future')),
  depende_de  text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan (
  code    text PRIMARY KEY,
  nombre  text NOT NULL
);

CREATE TABLE public.plan_modulo (
  plan_code    text NOT NULL REFERENCES public.plan (code) ON DELETE CASCADE,
  modulo_code  text NOT NULL REFERENCES public.modulo (code),
  PRIMARY KEY (plan_code, modulo_code)
);

CREATE TABLE public.restaurante_plan (
  restaurante_id  int4 PRIMARY KEY REFERENCES public.restaurante (id) ON DELETE CASCADE,
  plan_code       text NOT NULL REFERENCES public.plan (code),
  desde           timestamptz NOT NULL DEFAULT now()
);

-- Módulos activados por restaurante. Los del plan se copian aquí al asignar el plan,
-- para que activar o suspender un módulo concreto no dependa de cambiar el plan.
CREATE TABLE public.restaurante_modulo (
  restaurante_id  int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  modulo_code     text NOT NULL REFERENCES public.modulo (code),
  estado          text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'suspendido', 'cancelado')),
  origen          text NOT NULL CHECK (origen IN ('plan', 'complemento', 'cortesia')),
  limites         jsonb NOT NULL DEFAULT '{}'::jsonb,
  activado_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (restaurante_id, modulo_code)
);

CREATE TABLE public.permiso (
  code         text PRIMARY KEY,
  modulo_code  text NOT NULL REFERENCES public.modulo (code),
  descripcion  text
);

-- restaurante_id NULL = plantilla global de Konnecttia (owner, manager, staff, viewer).
-- En el MVP solo el panel interno de Konnecttia crea roles por restaurante.
CREATE TABLE public.rol (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id  int4 REFERENCES public.restaurante (id) ON DELETE CASCADE,
  code            text NOT NULL,
  nombre          text NOT NULL,
  es_plantilla    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (es_plantilla = (restaurante_id IS NULL))
);
CREATE UNIQUE INDEX ux_rol_plantilla_code ON public.rol (code) WHERE restaurante_id IS NULL;
CREATE UNIQUE INDEX ux_rol_restaurante_code ON public.rol (restaurante_id, code)
  WHERE restaurante_id IS NOT NULL;

CREATE TABLE public.rol_permiso (
  rol_id        bigint NOT NULL REFERENCES public.rol (id) ON DELETE CASCADE,
  permiso_code  text NOT NULL REFERENCES public.permiso (code),
  PRIMARY KEY (rol_id, permiso_code)
);

CREATE TABLE public.membresia_rol (
  membership_id  bigint NOT NULL REFERENCES public.local_memberships (id) ON DELETE CASCADE,
  rol_id         bigint NOT NULL REFERENCES public.rol (id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, rol_id)
);

-- Un rol propio de un restaurante solo puede asignarse a miembros de ese restaurante.
CREATE FUNCTION public.fn_check_membresia_rol_tenant() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_rol_restaurante int4;
  v_miembro_restaurante int4;
BEGIN
  SELECT restaurante_id INTO v_rol_restaurante FROM public.rol WHERE id = NEW.rol_id;
  SELECT restaurante_id INTO v_miembro_restaurante
    FROM public.local_memberships WHERE id = NEW.membership_id;
  IF v_rol_restaurante IS NOT NULL AND v_rol_restaurante <> v_miembro_restaurante THEN
    RAISE EXCEPTION 'El rol % pertenece a otro restaurante', NEW.rol_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_membresia_rol_tenant
  BEFORE INSERT OR UPDATE ON public.membresia_rol
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_membresia_rol_tenant();

-- Registro de auditoría: solo se añaden filas, nunca se modifican ni borran.
CREATE TABLE public.auditoria (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id  int4 REFERENCES public.restaurante (id) ON DELETE SET NULL,
  actor_tipo      text NOT NULL CHECK (actor_tipo IN ('usuario', 'cliente', 'agente', 'sistema', 'konnecttia')),
  actor_id        text,
  accion          text NOT NULL,
  recurso_tipo    text NOT NULL,
  recurso_id      text,
  resultado       text NOT NULL CHECK (resultado IN ('ok', 'denegado', 'error')),
  detalle         jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_restaurante_fecha ON public.auditoria (restaurante_id, created_at DESC);

CREATE FUNCTION public.fn_auditoria_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se puede modificar ni borrar';
END;
$$;

CREATE TRIGGER trg_auditoria_inmutable
  BEFORE UPDATE OR DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditoria_inmutable();

-- ---------------------------------------------------------------------------
-- Catálogo (generado desde packages/access/src)
-- ---------------------------------------------------------------------------

INSERT INTO public.modulo (code, nombre, tipo, depende_de) VALUES
  ('core.orders', 'Pedidos web y panel', 'core', ARRAY[]::text[]),
  ('core.menu', 'Carta online', 'core', ARRAY[]::text[]),
  ('core.settings', 'Configuración del local', 'core', ARRAY[]::text[]),
  ('core.team', 'Equipo y roles', 'core', ARRAY[]::text[]),
  ('notify.email', 'Avisos por email', 'core', ARRAY['core.orders']::text[]),
  ('delivery', 'Reparto propio con zonas', 'plan', ARRAY['core.orders']::text[]),
  ('customers', 'Clientes e historial', 'plan', ARRAY[]::text[]),
  ('tables', 'Mesas, camareros y comanda', 'plan', ARRAY['core.orders']::text[]),
  ('analytics', 'Analíticas', 'plan', ARRAY[]::text[]),
  ('scheduled_orders', 'Pedidos programados y hora de recogida', 'plan', ARRAY['core.orders']::text[]),
  ('menu_i18n', 'Carta en varios idiomas', 'plan', ARRAY['core.menu']::text[]),
  ('news_reviews', 'Novedades y reseñas', 'plan', ARRAY[]::text[]),
  ('locations.multi', 'Varios locales', 'plan', ARRAY[]::text[]),
  ('whatsapp.channel', 'Conexión de WhatsApp (Kapso)', 'addon', ARRAY[]::text[]),
  ('notify.whatsapp', 'Avisos por WhatsApp', 'addon', ARRAY['whatsapp.channel', 'core.orders']::text[]),
  ('whatsapp.agent', 'Agente de WhatsApp con IA', 'addon', ARRAY['whatsapp.channel', 'core.orders', 'core.menu']::text[]),
  ('notify.sms', 'Avisos por SMS', 'addon', ARRAY['core.orders']::text[]),
  ('payments.online', 'Cobro online', 'future', ARRAY['core.orders']::text[]);

INSERT INTO public.plan (code, nombre) VALUES
  ('basico', 'Básico'),
  ('premium', 'Premium');

INSERT INTO public.plan_modulo (plan_code, modulo_code) VALUES
  ('basico', 'delivery'),
  ('basico', 'customers'),
  ('premium', 'delivery'),
  ('premium', 'customers'),
  ('premium', 'tables'),
  ('premium', 'analytics'),
  ('premium', 'scheduled_orders'),
  ('premium', 'menu_i18n'),
  ('premium', 'news_reviews'),
  ('premium', 'locations.multi');

INSERT INTO public.permiso (code, modulo_code) VALUES
  ('orders.view', 'core.orders'),
  ('orders.create', 'core.orders'),
  ('orders.update', 'core.orders'),
  ('orders.change_status', 'core.orders'),
  ('orders.cancel', 'core.orders'),
  ('orders.export', 'core.orders'),
  ('menu.view', 'core.menu'),
  ('menu.create', 'core.menu'),
  ('menu.update', 'core.menu'),
  ('menu.delete', 'core.menu'),
  ('settings.view', 'core.settings'),
  ('settings.update', 'core.settings'),
  ('team.view', 'core.team'),
  ('team.manage', 'core.team'),
  ('delivery.view', 'delivery'),
  ('delivery.manage', 'delivery'),
  ('customers.view', 'customers'),
  ('customers.export', 'customers'),
  ('tables.view', 'tables'),
  ('tables.manage', 'tables'),
  ('analytics.view', 'analytics'),
  ('news.manage', 'news_reviews'),
  ('conversations.view', 'whatsapp.channel'),
  ('conversations.reply', 'whatsapp.channel'),
  ('agent.configure', 'whatsapp.agent');

INSERT INTO public.rol (restaurante_id, code, nombre, es_plantilla) VALUES
  (NULL, 'owner', 'Propietario', true),
  (NULL, 'manager', 'Encargado', true),
  (NULL, 'staff', 'Personal', true),
  (NULL, 'viewer', 'Consulta', true);

INSERT INTO public.rol_permiso (rol_id, permiso_code)
SELECT r.id, v.permiso_code
FROM (VALUES
  ('owner', 'orders.view'),
  ('owner', 'orders.create'),
  ('owner', 'orders.update'),
  ('owner', 'orders.change_status'),
  ('owner', 'orders.cancel'),
  ('owner', 'orders.export'),
  ('owner', 'menu.view'),
  ('owner', 'menu.create'),
  ('owner', 'menu.update'),
  ('owner', 'menu.delete'),
  ('owner', 'settings.view'),
  ('owner', 'settings.update'),
  ('owner', 'team.view'),
  ('owner', 'team.manage'),
  ('owner', 'delivery.view'),
  ('owner', 'delivery.manage'),
  ('owner', 'customers.view'),
  ('owner', 'customers.export'),
  ('owner', 'tables.view'),
  ('owner', 'tables.manage'),
  ('owner', 'analytics.view'),
  ('owner', 'news.manage'),
  ('owner', 'conversations.view'),
  ('owner', 'conversations.reply'),
  ('owner', 'agent.configure'),
  ('manager', 'orders.view'),
  ('manager', 'orders.create'),
  ('manager', 'orders.update'),
  ('manager', 'orders.change_status'),
  ('manager', 'orders.cancel'),
  ('manager', 'orders.export'),
  ('manager', 'menu.view'),
  ('manager', 'menu.create'),
  ('manager', 'menu.update'),
  ('manager', 'menu.delete'),
  ('manager', 'settings.view'),
  ('manager', 'settings.update'),
  ('manager', 'team.view'),
  ('manager', 'delivery.view'),
  ('manager', 'delivery.manage'),
  ('manager', 'customers.view'),
  ('manager', 'customers.export'),
  ('manager', 'tables.view'),
  ('manager', 'tables.manage'),
  ('manager', 'analytics.view'),
  ('manager', 'news.manage'),
  ('manager', 'conversations.view'),
  ('manager', 'conversations.reply'),
  ('staff', 'orders.view'),
  ('staff', 'orders.create'),
  ('staff', 'orders.change_status'),
  ('staff', 'menu.view'),
  ('staff', 'delivery.view'),
  ('staff', 'customers.view'),
  ('staff', 'tables.view'),
  ('staff', 'tables.manage'),
  ('staff', 'conversations.view'),
  ('staff', 'conversations.reply'),
  ('viewer', 'orders.view'),
  ('viewer', 'menu.view'),
  ('viewer', 'delivery.view'),
  ('viewer', 'tables.view')
) AS v(rol_code, permiso_code)
JOIN public.rol r ON r.code = v.rol_code AND r.restaurante_id IS NULL;

-- ---------------------------------------------------------------------------
-- Datos existentes
-- ---------------------------------------------------------------------------

-- Los restaurantes actuales ya usan todas las funciones (incluidas mesas): plan premium.
INSERT INTO public.restaurante_plan (restaurante_id, plan_code)
SELECT id, 'premium' FROM public.restaurante;

INSERT INTO public.restaurante_modulo (restaurante_id, modulo_code, origen)
SELECT r.id, pm.modulo_code, 'plan'
FROM public.restaurante r
CROSS JOIN public.plan_modulo pm
WHERE pm.plan_code = 'premium';

-- Cada membresía conserva su rol actual a través de la plantilla equivalente.
INSERT INTO public.membresia_rol (membership_id, rol_id)
SELECT m.id, r.id
FROM public.local_memberships m
JOIN public.rol r ON r.code = m.rol AND r.restaurante_id IS NULL;

COMMIT;
