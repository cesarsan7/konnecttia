-- =============================================================================
-- 0000_baseline.sql — Esquema de EasyOrder en producción (base restaurante_mvp)
--
-- Origen: DDL exportado por el promotor el 2026-11-01, con todas las migraciones
-- M-1 … M-31 de EasyOrder aplicadas. En PRODUCCIÓN esta migración YA ESTÁ APLICADA:
-- el runner la registra como aplicada sin ejecutarla (ver packages/db/README.md).
--
-- Ajustes respecto al DDL original para que se pueda ejecutar en una base vacía
-- (pruebas y entornos nuevos), sin cambiar el modelo:
--   * las funciones C de `unaccent` se sustituyen por CREATE EXTENSION unaccent;
--   * los CREATE TRIGGER se mueven al final, detrás de sus funciones;
--   * no se crea el esquema public (ya existe).
-- =============================================================================

SET check_function_bodies = off;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- DROP SCHEMA public;

-- (esquema public ya existe en una base nueva)

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP TYPE public.theme_id_enum;

CREATE TYPE public.theme_id_enum AS ENUM (
	'indigo',
	'emerald',
	'rose',
	'amber',
	'violet',
	'sky');

-- DROP SEQUENCE public.config_operativa_id_seq;

CREATE SEQUENCE public.config_operativa_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.config_operativa_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.config_operativa_id_seq TO postgres;

-- DROP SEQUENCE public.contexto_id_seq;

CREATE SEQUENCE public.contexto_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.contexto_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.contexto_id_seq TO postgres;

-- DROP SEQUENCE public.delivery_zone_delivery_zone_id_seq;

CREATE SEQUENCE public.delivery_zone_delivery_zone_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.delivery_zone_delivery_zone_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.delivery_zone_delivery_zone_id_seq TO postgres;

-- DROP SEQUENCE public.escalaciones_id_seq;

CREATE SEQUENCE public.escalaciones_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.escalaciones_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.escalaciones_id_seq TO postgres;

-- DROP SEQUENCE public.extra_extra_id_seq;

CREATE SEQUENCE public.extra_extra_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.extra_extra_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.extra_extra_id_seq TO postgres;

-- DROP SEQUENCE public.faqs_id_seq;

CREATE SEQUENCE public.faqs_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.faqs_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.faqs_id_seq TO postgres;

-- DROP SEQUENCE public.horario_atencion_id_seq;

CREATE SEQUENCE public.horario_atencion_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.horario_atencion_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.horario_atencion_id_seq TO postgres;

-- DROP SEQUENCE public.horarios_id_seq;

CREATE SEQUENCE public.horarios_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.horarios_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.horarios_id_seq TO postgres;

-- DROP SEQUENCE public.local_memberships_id_seq;

CREATE SEQUENCE public.local_memberships_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.local_memberships_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.local_memberships_id_seq TO postgres;

-- DROP SEQUENCE public.menu_category_menu_category_id_seq;

CREATE SEQUENCE public.menu_category_menu_category_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.menu_category_menu_category_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.menu_category_menu_category_id_seq TO postgres;

-- DROP SEQUENCE public.menu_id_seq;

CREATE SEQUENCE public.menu_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.menu_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.menu_id_seq TO postgres;

-- DROP SEQUENCE public.menu_item_menu_item_id_seq;

CREATE SEQUENCE public.menu_item_menu_item_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.menu_item_menu_item_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.menu_item_menu_item_id_seq TO postgres;

-- DROP SEQUENCE public.menu_variant_menu_variant_id_seq;

CREATE SEQUENCE public.menu_variant_menu_variant_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.menu_variant_menu_variant_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.menu_variant_menu_variant_id_seq TO postgres;

-- DROP SEQUENCE public.mesa_id_seq;

CREATE SEQUENCE public.mesa_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.mesa_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.mesa_id_seq TO postgres;

-- DROP SEQUENCE public.meseros_id_seq;

CREATE SEQUENCE public.meseros_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.meseros_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.meseros_id_seq TO postgres;

-- DROP SEQUENCE public.n8n_chat_histories_id_seq;

CREATE SEQUENCE public.n8n_chat_histories_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.n8n_chat_histories_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.n8n_chat_histories_id_seq TO postgres;

-- DROP SEQUENCE public.pedido_estado_log_id_seq;

CREATE SEQUENCE public.pedido_estado_log_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.pedido_estado_log_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.pedido_estado_log_id_seq TO postgres;

-- DROP SEQUENCE public.pedidos_id_seq;

CREATE SEQUENCE public.pedidos_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.pedidos_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.pedidos_id_seq TO postgres;

-- DROP SEQUENCE public.restaurant_invites_id_seq;

CREATE SEQUENCE public.restaurant_invites_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.restaurant_invites_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.restaurant_invites_id_seq TO postgres;

-- DROP SEQUENCE public.restaurante_id_seq;

CREATE SEQUENCE public.restaurante_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.restaurante_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.restaurante_id_seq TO postgres;

-- DROP SEQUENCE public.restaurante_mesas_id_seq;

CREATE SEQUENCE public.restaurante_mesas_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.restaurante_mesas_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.restaurante_mesas_id_seq TO postgres;

-- DROP SEQUENCE public.usuarios_id_seq;

CREATE SEQUENCE public.usuarios_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.usuarios_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.usuarios_id_seq TO postgres;

-- DROP SEQUENCE public.zona_mesa_id_seq;

CREATE SEQUENCE public.zona_mesa_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE public.zona_mesa_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE public.zona_mesa_id_seq TO postgres;
-- public.restaurante definition

-- Drop table

-- DROP TABLE public.restaurante;

CREATE TABLE public.restaurante ( id serial4 NOT NULL, nombre text NOT NULL, direccion text NULL, lat numeric(10, 8) NULL, long numeric(11, 8) NULL, telefono text NULL, zona_horaria text DEFAULT 'Atlantic/Canary'::text NULL, radio_cobertura_km numeric(5, 2) DEFAULT 5.0 NULL, tarifa_envio_tipo text DEFAULT 'fija'::text NULL, tarifa_envio_valor numeric(10, 2) DEFAULT '0'::numeric NULL, mensaje_bienvenida text NULL, mensaje_cerrado text NULL, created_at timestamp DEFAULT now() NULL, datos_bancarios jsonb NULL, moneda varchar(5) DEFAULT '€'::character varying NULL, slug varchar(100) NULL, payment_methods jsonb DEFAULT '["efectivo", "transferencia", "tarjeta", "bizum", "online"]'::jsonb NULL, logo_url text NULL, descripcion text NULL, brand_color varchar(7) DEFAULT '#E63946'::character varying NULL, delivery_enabled bool DEFAULT true NOT NULL, pickup_enabled bool DEFAULT true NOT NULL, delivery_min_order numeric(10, 2) DEFAULT 0.00 NOT NULL, theme_id public.theme_id_enum DEFAULT 'indigo'::theme_id_enum NOT NULL, eslogan text NULL, texto_banner text NULL, redes_sociales jsonb NULL, servicio_mesa_habilitado bool DEFAULT false NOT NULL, CONSTRAINT restaurante_pkey PRIMARY KEY (id), CONSTRAINT restaurante_slug_key UNIQUE (slug));
CREATE UNIQUE INDEX ux_restaurante_slug ON public.restaurante USING btree (slug) WHERE (slug IS NOT NULL);

-- Column comments

COMMENT ON COLUMN public.restaurante.lat IS 'Latitud WGS-84 del local. Usada como punto de referencia en el mapa del dashboard
   y como fallback para calcular distancia cuando no hay zonas de delivery configuradas.';
COMMENT ON COLUMN public.restaurante.long IS 'Longitud WGS-84 del local. Nombre legacy (long); en pedidos se usa lng.
   No renombrar: n8n puede referenciar este campo directamente.';
COMMENT ON COLUMN public.restaurante.radio_cobertura_km IS 'Radio general de cobertura del local en km. Valor por defecto para locales
   sin zonas de delivery granulares. Visible y editable desde el dashboard.';
COMMENT ON COLUMN public.restaurante.delivery_enabled IS 'Si false, el menú público no ofrece la opción de delivery.';
COMMENT ON COLUMN public.restaurante.pickup_enabled IS 'Si false, el menú público no ofrece la opción de retiro en local.';
COMMENT ON COLUMN public.restaurante.theme_id IS 'Paleta de color del dashboard y menú público. Valores válidos: indigo | emerald | rose | amber | violet | sky. Ver web/lib/themes.ts.';
COMMENT ON COLUMN public.restaurante.eslogan IS 'Eslogan o tagline del local. Máx ~160 caracteres recomendados. Se muestra en el menú público.';
COMMENT ON COLUMN public.restaurante.texto_banner IS 'Texto de banner promocional. Cuando no es NULL, se muestra como franja destacada en el menú público. Útil para descuentos, eventos o novedades.';
COMMENT ON COLUMN public.restaurante.redes_sociales IS 'Array JSONB de redes sociales. Estructura: [{"red":"instagram","url":"https://..."}]. Redes soportadas: instagram, tiktok, facebook, twitter, youtube, whatsapp, telegram, linkedin, pinterest, web.';
COMMENT ON COLUMN public.restaurante.servicio_mesa_habilitado IS 'Habilita el tipo de despacho "llevar a mesa" para este restaurante.';

-- Permissions

ALTER TABLE public.restaurante OWNER TO postgres;
GRANT ALL ON TABLE public.restaurante TO postgres;


-- public.restaurante_config definition

-- Drop table

-- DROP TABLE public.restaurante_config;

CREATE TABLE public.restaurante_config ( config_key varchar(100) NOT NULL, config_value varchar(500) NOT NULL, description text NULL, updated_at timestamptz DEFAULT now() NULL, restaurante_id int4 NOT NULL, CONSTRAINT restaurante_config_pkey PRIMARY KEY (config_key, restaurante_id));

-- Permissions

ALTER TABLE public.restaurante_config OWNER TO postgres;
GRANT ALL ON TABLE public.restaurante_config TO postgres;


-- public.config_operativa definition

-- Drop table

-- DROP TABLE public.config_operativa;

CREATE TABLE public.config_operativa ( id serial4 NOT NULL, restaurante_id int4 NULL, tiempo_espera_minutos int4 DEFAULT 30 NULL, mensaje_tiempo_espera text DEFAULT 'Tu pedido estará listo en aproximadamente {minutos} minutos.'::text NULL, CONSTRAINT config_operativa_pkey PRIMARY KEY (id), CONSTRAINT uq_config_operativa_restaurante UNIQUE (restaurante_id), CONSTRAINT config_operativa_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);

-- Permissions

ALTER TABLE public.config_operativa OWNER TO postgres;
GRANT ALL ON TABLE public.config_operativa TO postgres;


-- public.contexto definition

-- Drop table

-- DROP TABLE public.contexto;

CREATE TABLE public.contexto ( telefono text NOT NULL, contexto text NULL, "timestamp" timestamp NOT NULL, session_id text NULL, session_started_at timestamp NULL, restaurante_id int4 NULL, id serial4 NOT NULL, CONSTRAINT contexto_pkey PRIMARY KEY (id), CONSTRAINT contexto_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_contexto_restaurante ON public.contexto USING btree (restaurante_id);
CREATE INDEX idx_contexto_session ON public.contexto USING btree (session_id);
CREATE INDEX idx_contexto_telefono ON public.contexto USING btree (telefono);
CREATE UNIQUE INDEX uq_contexto_restaurante_telefono ON public.contexto USING btree (restaurante_id, telefono) WHERE (restaurante_id IS NOT NULL);

-- Permissions

ALTER TABLE public.contexto OWNER TO postgres;
GRANT ALL ON TABLE public.contexto TO postgres;


-- public.delivery_zone definition

-- Drop table

-- DROP TABLE public.delivery_zone;

CREATE TABLE public.delivery_zone ( delivery_zone_id bigserial NOT NULL, postal_code varchar(10) NULL, zone_name varchar(100) NOT NULL, fee numeric(10, 2) NOT NULL, is_active bool DEFAULT true NOT NULL, description text NULL, min_order_amount numeric(10, 2) NULL, estimated_minutes_min int4 NULL, estimated_minutes_max int4 NULL, restaurante_id int4 NOT NULL, lat_center numeric(10, 8) NULL, lng_center numeric(11, 8) NULL, radius_km numeric(6, 3) NULL, CONSTRAINT delivery_zone_geo_or_postal_check CHECK (((postal_code IS NOT NULL) OR ((lat_center IS NOT NULL) AND (lng_center IS NOT NULL) AND (radius_km IS NOT NULL)))), CONSTRAINT delivery_zone_pkey PRIMARY KEY (delivery_zone_id), CONSTRAINT delivery_zone_postal_restaurante_key UNIQUE (postal_code, restaurante_id), CONSTRAINT delivery_zone_restaurante_postal_key UNIQUE (restaurante_id, postal_code), CONSTRAINT delivery_zone_restaurante_fk FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_delivery_zone_restaurante_active ON public.delivery_zone USING btree (restaurante_id, is_active);

-- Column comments

COMMENT ON COLUMN public.delivery_zone.postal_code IS 'Código postal de la zona. Nullable desde M-16: puede ser NULL si la zona
   se define exclusivamente por coordenadas (lat_center + lng_center + radius_km).
   n8n Despacho subflujo sigue usando este campo para matching cuando no es NULL.';
COMMENT ON COLUMN public.delivery_zone.lat_center IS 'Latitud WGS-84 del centro geográfico de la zona de delivery.
   Se usa junto con lng_center y radius_km para validación por Haversine en la API.
   NULL si la zona se identifica solo por postal_code.';
COMMENT ON COLUMN public.delivery_zone.lng_center IS 'Longitud WGS-84 del centro geográfico de la zona de delivery.';
COMMENT ON COLUMN public.delivery_zone.radius_km IS 'Radio de cobertura en kilómetros desde lat_center/lng_center.
   La API valida: haversine(pedido.lat, pedido.lng, lat_center, lng_center) <= radius_km.';

-- Permissions

ALTER TABLE public.delivery_zone OWNER TO postgres;
GRANT ALL ON TABLE public.delivery_zone TO postgres;


-- public.escalaciones definition

-- Drop table

-- DROP TABLE public.escalaciones;

CREATE TABLE public.escalaciones ( id bigserial NOT NULL, restaurante_id int4 NULL, telefono text NOT NULL, problema text NULL, contexto jsonb NULL, conversation_id text NULL, account_id text NULL, contact_id text NULL, estado text DEFAULT 'pendiente'::text NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, resolved_at timestamptz NULL, resolved_by text NULL, tipo_escalacion varchar(50) DEFAULT 'derivacion_cliente'::character varying NULL, CONSTRAINT escalaciones_pkey PRIMARY KEY (id), CONSTRAINT escalaciones_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_escalaciones_created_at ON public.escalaciones USING btree (created_at DESC);
CREATE INDEX idx_escalaciones_estado ON public.escalaciones USING btree (estado);
CREATE INDEX idx_escalaciones_restaurante ON public.escalaciones USING btree (restaurante_id);
CREATE INDEX idx_escalaciones_telefono ON public.escalaciones USING btree (telefono);

-- Column comments

COMMENT ON COLUMN public.escalaciones.tipo_escalacion IS 'Origen de la escalación: derivacion_cliente | error_sistema | ventana_expirada | pedido_en_preparacion | carrito_expirado';

-- Permissions

ALTER TABLE public.escalaciones OWNER TO postgres;
GRANT ALL ON TABLE public.escalaciones TO postgres;


-- public.extra definition

-- Drop table

-- DROP TABLE public.extra;

CREATE TABLE public.extra ( extra_id bigserial NOT NULL, "name" varchar(120) NOT NULL, price numeric(10, 2) DEFAULT 0 NOT NULL, is_active bool DEFAULT true NOT NULL, allergens varchar(200) NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz NULL, restaurante_id int4 NOT NULL, CONSTRAINT extra_pkey PRIMARY KEY (extra_id), CONSTRAINT uq_extra_restaurante_name UNIQUE (restaurante_id, name), CONSTRAINT extra_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_extra_restaurante ON public.extra USING btree (restaurante_id);

-- Permissions

ALTER TABLE public.extra OWNER TO postgres;
GRANT ALL ON TABLE public.extra TO postgres;


-- public.faqs definition

-- Drop table

-- DROP TABLE public.faqs;

CREATE TABLE public.faqs ( id serial4 NOT NULL, restaurante_id int4 NULL, pregunta text NOT NULL, respuesta text NOT NULL, orden int4 DEFAULT 0 NULL, CONSTRAINT faqs_pkey PRIMARY KEY (id), CONSTRAINT uq_faqs_restaurante_pregunta UNIQUE (restaurante_id, pregunta), CONSTRAINT faqs_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);

-- Permissions

ALTER TABLE public.faqs OWNER TO postgres;
GRANT ALL ON TABLE public.faqs TO postgres;


-- public.horario_atencion definition

-- Drop table

-- DROP TABLE public.horario_atencion;

CREATE TABLE public.horario_atencion ( id serial4 NOT NULL, restaurante_id int4 NOT NULL, dia_semana int2 NOT NULL, hora_apertura time NULL, hora_cierre time NULL, is_open bool DEFAULT true NOT NULL, updated_at timestamp DEFAULT now() NOT NULL, CONSTRAINT horario_atencion_dia_semana_check CHECK (((dia_semana >= 0) AND (dia_semana <= 6))), CONSTRAINT horario_atencion_pkey PRIMARY KEY (id), CONSTRAINT horario_atencion_tenant_day_unique UNIQUE (restaurante_id, dia_semana), CONSTRAINT horario_atencion_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_horario_atencion_restaurante ON public.horario_atencion USING btree (restaurante_id);

-- Permissions

ALTER TABLE public.horario_atencion OWNER TO postgres;
GRANT ALL ON TABLE public.horario_atencion TO postgres;


-- public.horarios definition

-- Drop table

-- DROP TABLE public.horarios;

CREATE TABLE public.horarios ( id serial4 NOT NULL, restaurante_id int4 NULL, dia text NOT NULL, disponible bool DEFAULT true NULL, apertura_1 time NULL, cierre_1 time NULL, apertura_2 time NULL, cierre_2 time NULL, CONSTRAINT horarios_pkey PRIMARY KEY (id), CONSTRAINT horarios_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE UNIQUE INDEX ux_horarios_restaurante_dia ON public.horarios USING btree (restaurante_id, dia);

-- Permissions

ALTER TABLE public.horarios OWNER TO postgres;
GRANT ALL ON TABLE public.horarios TO postgres;


-- public.local_memberships definition

-- Drop table

-- DROP TABLE public.local_memberships;

CREATE TABLE public.local_memberships ( id bigserial NOT NULL, user_id uuid NOT NULL, restaurante_id int4 NOT NULL, rol varchar(20) DEFAULT 'manager'::character varying NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, email varchar(255) NULL, CONSTRAINT local_memberships_pkey PRIMARY KEY (id), CONSTRAINT local_memberships_rol_check CHECK (((rol)::text = ANY ((ARRAY['owner'::character varying, 'manager'::character varying, 'viewer'::character varying])::text[]))), CONSTRAINT uq_user_restaurante UNIQUE (user_id, restaurante_id), CONSTRAINT local_memberships_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_local_memberships_user ON public.local_memberships USING btree (user_id);
CREATE INDEX idx_memberships_restaurante_id ON public.local_memberships USING btree (restaurante_id);
CREATE INDEX idx_memberships_user_id ON public.local_memberships USING btree (user_id);

-- Permissions

ALTER TABLE public.local_memberships OWNER TO postgres;
GRANT ALL ON TABLE public.local_memberships TO postgres;


-- public.menu_category definition

-- Drop table

-- DROP TABLE public.menu_category;

CREATE TABLE public.menu_category ( menu_category_id bigserial NOT NULL, "name" varchar(100) NOT NULL, sort_order int4 DEFAULT 0 NOT NULL, is_active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz NULL, restaurante_id int4 NOT NULL, CONSTRAINT menu_category_pkey PRIMARY KEY (menu_category_id), CONSTRAINT uq_menu_category_restaurante_name UNIQUE (restaurante_id, name), CONSTRAINT menu_category_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_menu_category_restaurante ON public.menu_category USING btree (restaurante_id);

-- Permissions

ALTER TABLE public.menu_category OWNER TO postgres;
GRANT ALL ON TABLE public.menu_category TO postgres;


-- public.menu_category_extra definition

-- Drop table

-- DROP TABLE public.menu_category_extra;

CREATE TABLE public.menu_category_extra ( menu_category_id int8 NOT NULL, extra_id int8 NOT NULL, CONSTRAINT menu_category_extra_pkey PRIMARY KEY (menu_category_id, extra_id), CONSTRAINT mce_category_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_category(menu_category_id) ON DELETE CASCADE, CONSTRAINT mce_extra_fkey FOREIGN KEY (extra_id) REFERENCES public.extra(extra_id) ON DELETE CASCADE);
CREATE INDEX idx_mce_category ON public.menu_category_extra USING btree (menu_category_id);
CREATE INDEX idx_mce_extra ON public.menu_category_extra USING btree (extra_id);
COMMENT ON TABLE public.menu_category_extra IS 'Relación many-to-many entre categorías de menú y extras disponibles. Reemplaza menu_item_extra como fuente principal de extras en el menú público. Un mismo extra puede estar asociado a varias categorías.';

-- Permissions

ALTER TABLE public.menu_category_extra OWNER TO postgres;
GRANT ALL ON TABLE public.menu_category_extra TO postgres;


-- public.menu_item definition

-- Drop table

-- DROP TABLE public.menu_item;

CREATE TABLE public.menu_item ( menu_item_id bigserial NOT NULL, menu_category_id int8 NOT NULL, "name" varchar(150) NOT NULL, description varchar(500) NULL, is_pizza bool DEFAULT false NOT NULL, is_active bool DEFAULT true NOT NULL, tags varchar(300) NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz NULL, restaurante_id int4 NOT NULL, image_url text NULL, base_price numeric(10, 2) DEFAULT 0.00 NULL, CONSTRAINT menu_item_pkey PRIMARY KEY (menu_item_id), CONSTRAINT uq_menu_item_restaurante_cat_name UNIQUE (restaurante_id, menu_category_id, name), CONSTRAINT menu_item_menu_category_id_fkey FOREIGN KEY (menu_category_id) REFERENCES public.menu_category(menu_category_id), CONSTRAINT menu_item_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_menu_item_restaurante ON public.menu_item USING btree (restaurante_id);
CREATE INDEX ix_menu_item_category_active ON public.menu_item USING btree (menu_category_id, is_active);

-- Permissions

ALTER TABLE public.menu_item OWNER TO postgres;
GRANT ALL ON TABLE public.menu_item TO postgres;


-- public.menu_item_extra definition

-- Drop table

-- DROP TABLE public.menu_item_extra;

CREATE TABLE public.menu_item_extra ( menu_item_id int8 NOT NULL, extra_id int8 NOT NULL, is_default bool DEFAULT false NOT NULL, CONSTRAINT menu_item_extra_pkey PRIMARY KEY (menu_item_id, extra_id), CONSTRAINT menu_item_extra_extra_id_fkey FOREIGN KEY (extra_id) REFERENCES public.extra(extra_id), CONSTRAINT menu_item_extra_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_item(menu_item_id));

-- Permissions

ALTER TABLE public.menu_item_extra OWNER TO postgres;
GRANT ALL ON TABLE public.menu_item_extra TO postgres;


-- public.menu_variant definition

-- Drop table

-- DROP TABLE public.menu_variant;

CREATE TABLE public.menu_variant ( menu_variant_id bigserial NOT NULL, menu_item_id int8 NOT NULL, variant_name varchar(80) NOT NULL, price numeric(10, 2) NOT NULL, sku varchar(50) NULL, is_default bool DEFAULT false NOT NULL, is_active bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz NULL, restaurante_id int4 NOT NULL, CONSTRAINT menu_variant_pkey PRIMARY KEY (menu_variant_id), CONSTRAINT uq_menu_variant_item_name UNIQUE (menu_item_id, variant_name), CONSTRAINT menu_variant_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_menu_variant_restaurante ON public.menu_variant USING btree (restaurante_id);
CREATE INDEX ix_menu_variant_item_active ON public.menu_variant USING btree (menu_item_id, is_active);

-- Permissions

ALTER TABLE public.menu_variant OWNER TO postgres;
GRANT ALL ON TABLE public.menu_variant TO postgres;


-- public.meseros definition

-- Drop table

-- DROP TABLE public.meseros;

CREATE TABLE public.meseros ( id serial4 NOT NULL, restaurante_id int4 NOT NULL, nombre varchar(100) NOT NULL, activo bool DEFAULT true NULL, created_at timestamptz DEFAULT now() NULL, CONSTRAINT meseros_pkey PRIMARY KEY (id), CONSTRAINT meseros_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id));

-- Permissions

ALTER TABLE public.meseros OWNER TO postgres;
GRANT ALL ON TABLE public.meseros TO postgres;


-- public.n8n_chat_histories definition

-- Drop table

-- DROP TABLE public.n8n_chat_histories;

CREATE TABLE public.n8n_chat_histories ( id serial4 NOT NULL, session_id varchar(255) NOT NULL, message jsonb NOT NULL, "timestamp" timestamp NULL, restaurante_id int4 NULL, CONSTRAINT n8n_chat_histories_pkey PRIMARY KEY (id), CONSTRAINT n8n_chat_histories_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX ix_n8n_chat_histories_tenant ON public.n8n_chat_histories USING btree (restaurante_id, session_id);

-- Table Triggers


-- Permissions

ALTER TABLE public.n8n_chat_histories OWNER TO postgres;
GRANT ALL ON TABLE public.n8n_chat_histories TO postgres;


-- public.restaurant_invites definition

-- Drop table

-- DROP TABLE public.restaurant_invites;

CREATE TABLE public.restaurant_invites ( id serial4 NOT NULL, restaurante_id int4 NOT NULL, rol varchar(20) DEFAULT 'staff'::character varying NOT NULL, "token" uuid DEFAULT gen_random_uuid() NOT NULL, created_by uuid NOT NULL, expires_at timestamp DEFAULT (now() + '7 days'::interval) NOT NULL, used_by uuid NULL, used_at timestamp NULL, CONSTRAINT restaurant_invites_pkey PRIMARY KEY (id), CONSTRAINT restaurant_invites_token_unique UNIQUE (token), CONSTRAINT restaurant_invites_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_restaurant_invites_restaurante ON public.restaurant_invites USING btree (restaurante_id);
CREATE INDEX idx_restaurant_invites_token ON public.restaurant_invites USING btree (token);

-- Permissions

ALTER TABLE public.restaurant_invites OWNER TO postgres;
GRANT ALL ON TABLE public.restaurant_invites TO postgres;


-- public.restaurante_mesas definition

-- Drop table

-- DROP TABLE public.restaurante_mesas;

CREATE TABLE public.restaurante_mesas ( id bigserial NOT NULL, restaurante_id int4 NULL, numero varchar(20) NOT NULL, descripcion text NULL, is_active bool DEFAULT true NOT NULL, sort_order int4 DEFAULT 0 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT restaurante_mesas_pkey PRIMARY KEY (id), CONSTRAINT restaurante_mesas_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_restaurante_mesas_restaurante ON public.restaurante_mesas USING btree (restaurante_id, is_active);

-- Permissions

ALTER TABLE public.restaurante_mesas OWNER TO postgres;
GRANT ALL ON TABLE public.restaurante_mesas TO postgres;


-- public.usuarios definition

-- Drop table

-- DROP TABLE public.usuarios;

CREATE TABLE public.usuarios ( id serial4 NOT NULL, restaurante_id int4 NULL, telefono text NOT NULL, nombre text NULL, direccion_frecuente text NULL, lat_frecuente numeric(10, 8) NULL, long_frecuente numeric(11, 8) NULL, contexto text NULL, created_at timestamp DEFAULT now() NULL, updated_at timestamp DEFAULT now() NULL, CONSTRAINT usuarios_pkey PRIMARY KEY (id), CONSTRAINT usuarios_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
CREATE INDEX idx_usuarios_restaurante ON public.usuarios USING btree (restaurante_id);
CREATE INDEX idx_usuarios_telefono ON public.usuarios USING btree (telefono);
CREATE UNIQUE INDEX usuarios_restaurante_telefono_key ON public.usuarios USING btree (restaurante_id, telefono);

-- Permissions

ALTER TABLE public.usuarios OWNER TO postgres;
GRANT ALL ON TABLE public.usuarios TO postgres;


-- public.zona_mesa definition

-- Drop table

-- DROP TABLE public.zona_mesa;

CREATE TABLE public.zona_mesa ( id bigserial NOT NULL, restaurante_id int8 NOT NULL, nombre varchar(80) NOT NULL, orden int2 DEFAULT 0 NOT NULL, activa bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT zona_mesa_pkey PRIMARY KEY (id), CONSTRAINT zona_mesa_restaurante_id_nombre_key UNIQUE (restaurante_id, nombre), CONSTRAINT zona_mesa_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE);
COMMENT ON TABLE public.zona_mesa IS 'Zonas de servicio a mesa (interior, exterior, sala 1, terraza…)';

-- Permissions

ALTER TABLE public.zona_mesa OWNER TO postgres;
GRANT ALL ON TABLE public.zona_mesa TO postgres;


-- public.mesa definition

-- Drop table

-- DROP TABLE public.mesa;

CREATE TABLE public.mesa ( id bigserial NOT NULL, restaurante_id int8 NOT NULL, zona_id int8 NULL, numero int2 NOT NULL, nombre varchar(80) NOT NULL, capacidad int2 NULL, activa bool DEFAULT true NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, ocupada_manual bool DEFAULT false NOT NULL, CONSTRAINT mesa_pkey PRIMARY KEY (id), CONSTRAINT mesa_restaurante_id_numero_key UNIQUE (restaurante_id, numero), CONSTRAINT mesa_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE, CONSTRAINT mesa_zona_id_fkey FOREIGN KEY (zona_id) REFERENCES public.zona_mesa(id) ON DELETE SET NULL);
CREATE INDEX idx_mesa_restaurante ON public.mesa USING btree (restaurante_id);
CREATE INDEX idx_mesa_zona ON public.mesa USING btree (zona_id);
COMMENT ON TABLE public.mesa IS 'Mesas del restaurante, agrupadas por zona';

-- Permissions

ALTER TABLE public.mesa OWNER TO postgres;
GRANT ALL ON TABLE public.mesa TO postgres;


-- public.pedidos definition

-- Drop table

-- DROP TABLE public.pedidos;

CREATE TABLE public.pedidos ( id serial4 NOT NULL, restaurante_id int4 NULL, usuario_id int4 NULL, telefono text NOT NULL, items jsonb DEFAULT '[]'::jsonb NULL, subtotal numeric(10, 2) DEFAULT '0'::numeric NULL, tipo_despacho text NULL, direccion text NULL, lat numeric(10, 8) NULL, lng numeric(11, 8) NULL, distancia_km numeric(5, 2) NULL, tiempo_estimado text NULL, costo_envio numeric(10, 2) DEFAULT '0'::numeric NULL, total numeric(10, 2) DEFAULT '0'::numeric NULL, metodo_pago text NULL, estado text DEFAULT 'recibido'::text NULL, notas jsonb NULL, created_at timestamp DEFAULT now() NULL, updated_at timestamp DEFAULT now() NULL, session_id text NULL, session_started_at timestamp NULL, pedido_numero int4 DEFAULT 1 NULL, pedido_codigo varchar(20) NULL, canal varchar(20) DEFAULT 'whatsapp'::character varying NOT NULL, postal_code varchar(10) NULL, chatwoot_conversation_id text NULL, estado_pago text DEFAULT 'no_aplica'::text NOT NULL, cart_warned_at timestamp NULL, nombre_pedido varchar(120) DEFAULT NULL::character varying NULL, mesa_id int8 NULL, mesa_numero varchar(20) NULL, mesero_id int4 NULL, CONSTRAINT pedidos_pkey PRIMARY KEY (id), CONSTRAINT pedidos_mesa_id_fkey FOREIGN KEY (mesa_id) REFERENCES public.mesa(id) ON DELETE SET NULL, CONSTRAINT pedidos_mesero_id_fkey FOREIGN KEY (mesero_id) REFERENCES public.meseros(id), CONSTRAINT pedidos_restaurante_id_fkey FOREIGN KEY (restaurante_id) REFERENCES public.restaurante(id) ON DELETE CASCADE, CONSTRAINT pedidos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL);
CREATE INDEX idx_pedidos_canal ON public.pedidos USING btree (canal) WHERE (canal IS NOT NULL);
CREATE INDEX idx_pedidos_estado ON public.pedidos USING btree (estado);
CREATE INDEX idx_pedidos_mesa_id ON public.pedidos USING btree (mesa_id);
CREATE INDEX idx_pedidos_pedido_codigo ON public.pedidos USING btree (pedido_codigo);
CREATE INDEX idx_pedidos_postal_code ON public.pedidos USING btree (postal_code) WHERE (postal_code IS NOT NULL);
CREATE INDEX idx_pedidos_restaurante ON public.pedidos USING btree (restaurante_id);
CREATE INDEX idx_pedidos_session_id ON public.pedidos USING btree (session_id);
CREATE INDEX idx_pedidos_telefono ON public.pedidos USING btree (telefono);
CREATE INDEX idx_pedidos_telefono_updated_at ON public.pedidos USING btree (telefono, updated_at DESC);
CREATE UNIQUE INDEX pedidos_session_pedido_unique ON public.pedidos USING btree (session_id, pedido_numero);
CREATE UNIQUE INDEX ux_pedidos_pedido_codigo ON public.pedidos USING btree (pedido_codigo) WHERE (pedido_codigo IS NOT NULL);

-- Column comments

COMMENT ON COLUMN public.pedidos.notas IS 'Notas del pedido por ítem. Formato: [{"item": "nombre_item", "nota": "texto"}]. Generado por el agente WhatsApp o por el cliente en el checkout web.';
COMMENT ON COLUMN public.pedidos.canal IS 'Canal de origen del pedido. Valores: whatsapp (agente n8n) | web (checkout EasyOrder).
   DEFAULT whatsapp preserva correctamente todos los pedidos históricos del agente.';
COMMENT ON COLUMN public.pedidos.postal_code IS 'Código postal de la zona de delivery. Resuelto en Despacho subflujo.
   NULL si pedido es retiro o si no se pudo determinar la zona.
   Fuente: input directo del cliente o lookup en delivery_zone.postal_code.';
COMMENT ON COLUMN public.pedidos.cart_warned_at IS 'Timestamp en que se envió la notificación de advertencia pre-expiración. NULL = no enviada.';
COMMENT ON COLUMN public.pedidos.nombre_pedido IS 'Nombre para el pedido (puede diferir del titular de la cuenta). NULL = usar nombre_cliente.';
COMMENT ON COLUMN public.pedidos.mesa_id IS 'Mesa asignada por el operador. NULL cuando tipo_despacho != mesa o aún no asignada.';

-- Table Triggers


-- Permissions

ALTER TABLE public.pedidos OWNER TO postgres;
GRANT ALL ON TABLE public.pedidos TO postgres;


-- public.pedido_estado_log definition

-- Drop table

-- DROP TABLE public.pedido_estado_log;

CREATE TABLE public.pedido_estado_log ( id bigserial NOT NULL, pedido_id int4 NOT NULL, restaurante_id int4 NOT NULL, estado_anterior text NULL, estado_nuevo text NOT NULL, origen text DEFAULT 'trigger'::text NOT NULL, actor text NULL, motivo text NULL, created_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT pedido_estado_log_pkey PRIMARY KEY (id), CONSTRAINT pedido_estado_log_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(id) ON DELETE CASCADE);
CREATE INDEX idx_estado_log_estado_nuevo ON public.pedido_estado_log USING btree (restaurante_id, estado_nuevo, created_at DESC);
CREATE INDEX idx_estado_log_pedido ON public.pedido_estado_log USING btree (pedido_id, created_at DESC);
CREATE INDEX idx_estado_log_restaurante ON public.pedido_estado_log USING btree (restaurante_id, created_at DESC);

-- Permissions

ALTER TABLE public.pedido_estado_log OWNER TO postgres;
GRANT ALL ON TABLE public.pedido_estado_log TO postgres;



-- DROP FUNCTION public.delete_restaurante(int4, text);

CREATE OR REPLACE FUNCTION public.delete_restaurante(p_id integer DEFAULT NULL::integer, p_nombre text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id     INT;
  v_nombre TEXT;
BEGIN
  IF p_id IS NULL AND (p_nombre IS NULL OR trim(p_nombre) = '') THEN
    RAISE EXCEPTION 'Se requiere p_id o p_nombre para identificar el restaurante';
  END IF;

  SELECT id, nombre
    INTO v_id, v_nombre
    FROM public.restaurante
   WHERE (p_id     IS NOT NULL AND id     = p_id)
      OR (p_nombre IS NOT NULL AND nombre = trim(p_nombre))
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante no encontrado: id=%, nombre=%', p_id, p_nombre;
  END IF;

  RAISE NOTICE 'Eliminando restaurante id=% nombre="%"', v_id, v_nombre;

  -- menu_item_extra depende de menu_item (PK = menu_item_id, no id)
  DELETE FROM public.menu_item_extra
   WHERE menu_item_id IN (
     SELECT menu_item_id FROM public.menu_item WHERE restaurante_id = v_id
   );

  DELETE FROM public.menu_item     WHERE restaurante_id = v_id;
  DELETE FROM public.menu_variant  WHERE restaurante_id = v_id;
  DELETE FROM public.menu_category WHERE restaurante_id = v_id;
  DELETE FROM public.extra         WHERE restaurante_id = v_id;
  DELETE FROM public.delivery_zone WHERE restaurante_id = v_id;
  DELETE FROM public.restaurante_config WHERE restaurante_id = v_id;

  DELETE FROM public.restaurante WHERE id = v_id;

  RETURN format('Restaurante id=%s nombre="%s" eliminado correctamente', v_id, v_nombre);
END;
$function$
;

-- Permissions

ALTER FUNCTION public.delete_restaurante(int4, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.delete_restaurante(int4, text) TO postgres;

-- DROP FUNCTION public.fn_get_rest_config_int(text, int4);

CREATE OR REPLACE FUNCTION public.fn_get_rest_config_int(p_key text, p_default integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE((SELECT NULLIF(trim(config_value),'')::int FROM public.restaurante_config WHERE config_key = p_key), p_default)
$function$
;

-- Permissions

ALTER FUNCTION public.fn_get_rest_config_int(text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_get_rest_config_int(text, int4) TO postgres;

-- DROP FUNCTION public.fn_get_rest_config_int(text, int4, int4);

CREATE OR REPLACE FUNCTION public.fn_get_rest_config_int(p_key text, p_default integer, p_restaurante_id integer DEFAULT 1)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(
    (
      SELECT NULLIF(trim(config_value), '')::int
      FROM   public.restaurante_config
      WHERE  config_key     = p_key
        AND  restaurante_id = p_restaurante_id
    ),
    p_default
  )
$function$
;

-- Permissions

ALTER FUNCTION public.fn_get_rest_config_int(text, int4, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_get_rest_config_int(text, int4, int4) TO postgres;

-- DROP FUNCTION public.fn_listar_pedidos_modificables(text);

CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(p_telefono text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  )
  SELECT
    p.id::text AS pedido_id,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
        THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
      WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
        THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono = p_telefono
  ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_listar_pedidos_modificables(text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_listar_pedidos_modificables(text) TO postgres;

-- DROP FUNCTION public.fn_listar_pedidos_modificables(text, int4);

CREATE OR REPLACE FUNCTION public.fn_listar_pedidos_modificables(p_telefono text, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  )
  SELECT
    p.id::text,
    p.pedido_codigo,
    p.estado,
    p.tipo_despacho,
    p.total,
    p.updated_at,
    CASE
      WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
      WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
        THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
      ELSE false
    END AS es_modificable
  FROM public.pedidos p
  WHERE p.telefono       = p_telefono
    AND p.restaurante_id = p_restaurante_id
  ORDER BY COALESCE(p.updated_at, p.created_at) DESC, p.id DESC
$function$
;

-- Permissions

ALTER FUNCTION public.fn_listar_pedidos_modificables(text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_listar_pedidos_modificables(text, int4) TO postgres;

-- DROP FUNCTION public.fn_log_estado_pedido();

CREATE OR REPLACE FUNCTION public.fn_log_estado_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_origen TEXT;
  v_actor  TEXT;
BEGIN
  -- Solo loguear si el estado realmente cambió
  IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Leer contexto de sesión si fue seteado por la capa de aplicación
  BEGIN
    v_origen := current_setting('app.origen', true);
  EXCEPTION WHEN OTHERS THEN
    v_origen := NULL;
  END;

  BEGIN
    v_actor := current_setting('app.actor', true);
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  INSERT INTO public.pedido_estado_log (
    pedido_id,
    restaurante_id,
    estado_anterior,
    estado_nuevo,
    origen,
    actor,
    created_at
  ) VALUES (
    NEW.id,
    NEW.restaurante_id,
    OLD.estado,
    NEW.estado,
    COALESCE(NULLIF(v_origen, ''), 'trigger'),
    NULLIF(v_actor, ''),
    NOW()
  );

  RETURN NEW;
END;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_log_estado_pedido() OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_log_estado_pedido() TO postgres;

-- DROP FUNCTION public.fn_menu_catalog(int4);

CREATE OR REPLACE FUNCTION public.fn_menu_catalog(p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text, menu_item_id bigint, menu_variant_id bigint, extras_json jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH extras_text AS (
    SELECT
      mie.menu_item_id,
      string_agg(
        e.name ||
        CASE
          WHEN COALESCE(e.price, 0) > 0
            THEN ' (' || replace(to_char(e.price, 'FM999999990.00'), '.', ',') || '€)'
          ELSE ''
        END,
        ', ' ORDER BY e.name
      ) AS extras_disponibles
    FROM public.menu_item_extra mie
    JOIN public.extra e ON e.extra_id = mie.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mie.menu_item_id
  ),
  extras_json_cte AS (
    SELECT
      mie.menu_item_id,
      jsonb_agg(
        jsonb_build_object(
          'extra_id', e.extra_id,
          'name',     e.name,
          'price',    e.price
        )
        ORDER BY e.name
      ) AS extras_json
    FROM public.menu_item_extra mie
    JOIN public.extra e ON e.extra_id = mie.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mie.menu_item_id
  )
  SELECT
    mc.name::text                AS categoria,
    mi.name::text                AS producto,
    mi.description::text         AS descripcion,
    mv.variant_name::text        AS variante,
    mv.price::numeric            AS precio,
    et.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    )                            AS disponible,
    mi.tags::text                AS tags,
    COALESCE(mi.is_pizza, false) AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END                          AS producto_display,
    mi.menu_item_id::int8        AS menu_item_id,
    mv.menu_variant_id::int8     AS menu_variant_id,
    ej.extras_json               AS extras_json
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
   AND mc.restaurante_id   = p_restaurante_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras_text et
    ON et.menu_item_id = mi.menu_item_id
  LEFT JOIN extras_json_cte ej
    ON ej.menu_item_id = mi.menu_item_id
  WHERE mc.restaurante_id = p_restaurante_id
    AND COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (mv.menu_variant_id IS NULL OR COALESCE(mv.is_active, true))
$function$
;

-- Permissions

ALTER FUNCTION public.fn_menu_catalog(int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_menu_catalog(int4) TO postgres;

-- DROP FUNCTION public.fn_menu_catalog();

CREATE OR REPLACE FUNCTION public.fn_menu_catalog()
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH extras AS (
    SELECT
      mi.menu_item_id,
      string_agg(
        e.name ||
        CASE
          WHEN COALESCE(e.price, 0) > 0
            THEN ' (' || replace(to_char(e.price, 'FM999999990.00'), '.', ',') || '€)'
          ELSE ''
        END,
        ', ' ORDER BY e.name
      ) AS extras_disponibles
    FROM public.menu_item mi
    JOIN public.menu_category_extra mce
      ON mce.menu_category_id = mi.menu_category_id
    JOIN public.extra e
      ON e.extra_id = mce.extra_id
    WHERE COALESCE(e.is_active, true)
    GROUP BY mi.menu_item_id
  )
  SELECT
    mc.name::text AS categoria,
    mi.name::text AS producto,
    mi.description::text AS descripcion,
    mv.variant_name::text AS variante,
    mv.price::numeric AS precio,
    ex.extras_disponibles::text,
    (
      COALESCE(mc.is_active, true)
      AND COALESCE(mi.is_active, true)
      AND COALESCE(mv.is_active, true)
    ) AS disponible,
    mi.tags::text AS tags,
    COALESCE(mi.is_pizza, false) AS is_pizza,
    CASE
      WHEN mv.variant_name IS NULL OR btrim(mv.variant_name) = ''
        THEN mi.name::text
      ELSE mi.name::text || ' - ' || mv.variant_name::text
    END AS producto_display
  FROM public.menu_item mi
  JOIN public.menu_category mc
    ON mc.menu_category_id = mi.menu_category_id
  LEFT JOIN public.menu_variant mv
    ON mv.menu_item_id = mi.menu_item_id
  LEFT JOIN extras ex
    ON ex.menu_item_id = mi.menu_item_id
  WHERE
    COALESCE(mc.is_active, true)
    AND COALESCE(mi.is_active, true)
    AND (
      mv.menu_variant_id IS NULL
      OR COALESCE(mv.is_active, true)
    );
$function$
;

-- Permissions

ALTER FUNCTION public.fn_menu_catalog() OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_menu_catalog() TO postgres;

-- DROP FUNCTION public.fn_menu_lookup(text);

CREATE OR REPLACE FUNCTION public.fn_menu_lookup(p_search text DEFAULT NULL::text)
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text, menu_item_id bigint, menu_variant_id bigint, extras_json jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM public.fn_menu_catalog() c
  WHERE p_search IS NULL
     OR p_search = ''
     OR lower(unaccent(COALESCE(c.categoria,'')))         LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.variante,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto_display,'')))  LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.extras_disponibles,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
  ORDER BY c.categoria, c.producto, c.precio;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_menu_lookup(text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_menu_lookup(text) TO postgres;

-- DROP FUNCTION public.fn_menu_lookup(text, int4);

CREATE OR REPLACE FUNCTION public.fn_menu_lookup(p_search text DEFAULT NULL::text, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(categoria text, producto text, descripcion text, variante text, precio numeric, extras_disponibles text, disponible boolean, tags text, is_pizza boolean, producto_display text, menu_item_id bigint, menu_variant_id bigint, extras_json jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM public.fn_menu_catalog(p_restaurante_id) c
  WHERE p_search IS NULL
     OR p_search = ''
     OR lower(unaccent(COALESCE(c.categoria,'')))          LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto,'')))           LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.variante,'')))           LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.producto_display,'')))   LIKE '%' || lower(unaccent(p_search)) || '%'
     OR lower(unaccent(COALESCE(c.extras_disponibles,''))) LIKE '%' || lower(unaccent(p_search)) || '%'
  ORDER BY c.categoria, c.producto, c.precio
$function$
;

-- Permissions

ALTER FUNCTION public.fn_menu_lookup(text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_menu_lookup(text, int4) TO postgres;

-- DROP FUNCTION public.fn_n8n_chat_set_restaurante_id();

CREATE OR REPLACE FUNCTION public.fn_n8n_chat_set_restaurante_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prefix text;
  v_rid    integer;
BEGIN
  -- Solo actuar si restaurante_id llega NULL (el nodo Memory no lo envía)
  IF NEW.restaurante_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- El session_id tiene formato "{restaurante_id}_{resto}"
  -- Extraemos la parte antes del primer '_'
  v_prefix := split_part(COALESCE(NEW.session_id, ''), '_', 1);

  BEGIN
    v_rid := v_prefix::integer;
  EXCEPTION WHEN others THEN
    v_rid := 1;  -- fallback para sesiones antiguas sin prefijo
  END;

  -- Validar que el restaurante existe (evitar FK violation)
  IF NOT EXISTS (SELECT 1 FROM public.restaurante WHERE id = v_rid) THEN
    v_rid := 1;
  END IF;

  NEW.restaurante_id := v_rid;
  RETURN NEW;
END;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_n8n_chat_set_restaurante_id() OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_n8n_chat_set_restaurante_id() TO postgres;

-- DROP FUNCTION public.fn_next_pedido_codigo(date);

CREATE OR REPLACE FUNCTION public.fn_next_pedido_codigo(p_fecha date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  prefijo text := to_char(p_fecha, 'YYMMDD');
  siguiente int;
BEGIN
  SELECT COALESCE(MAX(RIGHT(pedido_codigo,4)::int), 1000) + 1
    INTO siguiente
  FROM public.pedidos
  WHERE pedido_codigo ~ ('^' || prefijo || '-[0-9]{4}$');

  RETURN prefijo || '-' || LPAD(siguiente::text, 4, '0');
END;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_next_pedido_codigo(date) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_next_pedido_codigo(date) TO postgres;

-- DROP FUNCTION public.fn_next_pedido_codigo(date, int4);

CREATE OR REPLACE FUNCTION public.fn_next_pedido_codigo(p_fecha date DEFAULT CURRENT_DATE, p_restaurante_id integer DEFAULT 1)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  prefijo   text := to_char(p_fecha, 'YYMMDD');
  siguiente int;
BEGIN
  SELECT COALESCE(MAX(RIGHT(pedido_codigo, 4)::int), 1000) + 1
    INTO siguiente
  FROM public.pedidos
  WHERE pedido_codigo  ~ ('^' || prefijo || '-[0-9]{4}$')
    AND restaurante_id = p_restaurante_id;

  RETURN prefijo || '-' || LPAD(siguiente::text, 4, '0');
END;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_next_pedido_codigo(date, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_next_pedido_codigo(date, int4) TO postgres;

-- DROP FUNCTION public.fn_next_pedido_numero(int4);

CREATE OR REPLACE FUNCTION public.fn_next_pedido_numero(p_restaurante_id integer DEFAULT 1)
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(MAX(pedido_numero), 0) + 1
  FROM   public.pedidos
  WHERE  restaurante_id = p_restaurante_id
$function$
;

-- Permissions

ALTER FUNCTION public.fn_next_pedido_numero(int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_next_pedido_numero(int4) TO postgres;

-- DROP FUNCTION public.fn_next_pedido_numero();

CREATE OR REPLACE FUNCTION public.fn_next_pedido_numero()
 RETURNS integer
 LANGUAGE sql
 STABLE
AS $function$
  SELECT COALESCE(MAX(pedido_numero),0) + 1 FROM public.pedidos
$function$
;

-- Permissions

ALTER FUNCTION public.fn_next_pedido_numero() OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_next_pedido_numero() TO postgres;

-- DROP FUNCTION public.fn_resolver_pedido_modificable(text, text);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_modificable(p_telefono text, p_referencia text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    r.pedido_id,
    r.pedido_codigo,
    r.estado,
    r.tipo_despacho,
    r.total,
    r.updated_at,
    r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia) r
  WHERE r.es_modificable
  LIMIT 1;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_resolver_pedido_modificable(text, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_resolver_pedido_modificable(text, text) TO postgres;

-- DROP FUNCTION public.fn_resolver_pedido_modificable(text, text, int4);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_modificable(p_telefono text, p_referencia text, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT r.pedido_id, r.pedido_codigo, r.estado, r.tipo_despacho,
         r.total, r.updated_at, r.es_modificable
  FROM public.fn_resolver_pedido_referencia(p_telefono, p_referencia, p_restaurante_id) r
  WHERE r.es_modificable
  LIMIT 1
$function$
;

-- Permissions

ALTER FUNCTION public.fn_resolver_pedido_modificable(text, text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_resolver_pedido_modificable(text, text, int4) TO postgres;

-- DROP FUNCTION public.fn_resolver_pedido_referencia(text, text);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(p_telefono text, p_referencia text)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, subtotal numeric, total numeric, updated_at timestamp without time zone, items jsonb, direccion text, tiempo_estimado text, metodo_pago text, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia, '')) AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g') AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.subtotal,
      p.total,
      p.updated_at,
      p.items,
      p.direccion,
      p.tiempo_estimado,
      p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    b.pedido_id,
    b.pedido_codigo,
    b.estado,
    b.tipo_despacho,
    b.subtotal,
    b.total,
    b.updated_at,
    b.items,
    b.direccion,
    b.tiempo_estimado,
    b.metodo_pago,
    b.es_modificable
  FROM base b
  CROSS JOIN ref
  WHERE
    lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r)
    OR lower(COALESCE(b.pedido_codigo, '')) LIKE lower(ref.r) || '%'
    OR b.pedido_id = ref.r
    OR (length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits)
  ORDER BY
    CASE WHEN lower(COALESCE(b.pedido_codigo, '')) = lower(ref.r) THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo, ''), length(ref.digits)) = ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_resolver_pedido_referencia(text, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_resolver_pedido_referencia(text, text) TO postgres;

-- DROP FUNCTION public.fn_resolver_pedido_referencia(text, text, int4);

CREATE OR REPLACE FUNCTION public.fn_resolver_pedido_referencia(p_telefono text, p_referencia text, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, subtotal numeric, total numeric, updated_at timestamp without time zone, items jsonb, direccion text, tiempo_estimado text, metodo_pago text, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_referencia, ''))                                        AS r,
      regexp_replace(COALESCE(p_referencia, ''), '[^0-9]', '', 'g')          AS digits
  ),
  base AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo, p.estado, p.tipo_despacho,
      p.subtotal, p.total, p.updated_at, p.items,
      p.direccion, p.tiempo_estimado, p.metodo_pago,
      CASE
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_modificable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    b.pedido_id, b.pedido_codigo, b.estado, b.tipo_despacho,
    b.subtotal, b.total, b.updated_at, b.items,
    b.direccion, b.tiempo_estimado, b.metodo_pago, b.es_modificable
  FROM base b
  CROSS JOIN ref
  WHERE
    lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r)
    OR lower(COALESCE(b.pedido_codigo,'')) LIKE lower(ref.r) || '%'
    OR b.pedido_id = ref.r
    OR (length(ref.digits) >= 3 AND right(COALESCE(b.pedido_codigo,''), length(ref.digits)) = ref.digits)
  ORDER BY
    CASE WHEN lower(COALESCE(b.pedido_codigo,'')) = lower(ref.r)           THEN 0 ELSE 1 END,
    CASE WHEN b.pedido_id = ref.r                                           THEN 0 ELSE 1 END,
    CASE WHEN length(ref.digits)>=3 AND right(COALESCE(b.pedido_codigo,''),length(ref.digits))=ref.digits THEN 0 ELSE 1 END,
    COALESCE(b.updated_at, NOW()) DESC,
    b.pedido_id DESC
  LIMIT 1
$function$
;

-- Permissions

ALTER FUNCTION public.fn_resolver_pedido_referencia(text, text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_resolver_pedido_referencia(text, text, int4) TO postgres;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, int8);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.total,
      p.updated_at,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    c.pedido_id,
    c.pedido_codigo,
    c.estado,
    c.tipo_despacho,
    c.total,
    c.updated_at,
    c.es_reutilizable AS es_modificable
  FROM cand c
  WHERE c.es_reutilizable
    AND (p_pedido_id IS NULL OR c.pedido_id = p_pedido_id::text)
    AND (p_session_id IS NULL OR c.pedido_id IN (
          SELECT id::text FROM public.pedidos WHERE session_id = p_session_id
        ))
  ORDER BY
    CASE WHEN p_session_id IS NOT NULL AND EXISTS(
           SELECT 1 FROM public.pedidos WHERE id::text = c.pedido_id AND session_id = p_session_id
         ) THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.pedido_id DESC
  LIMIT 1;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_select_pedido_reutilizable(text, text, int8) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_select_pedido_reutilizable(text, text, int8) TO postgres;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool, int4);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id text DEFAULT NULL::text, p_forzar_pedido_nuevo boolean DEFAULT false, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(id character varying, restaurante_id integer, usuario_id integer, telefono text, items jsonb, subtotal numeric, tipo_despacho text, direccion text, lat numeric, lng numeric, distancia_km numeric, tiempo_estimado text, costo_envio numeric, total numeric, metodo_pago text, estado text, notas text, created_at timestamp without time zone, updated_at timestamp without time zone, session_id text, session_started_at timestamp without time zone, pedido_numero integer, pedido_codigo text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id,''))                                          AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id,''), '[^0-9]', '', 'g')            AS pedido_digits
  ),
  cand AS (
    SELECT
      p.id,
      p.restaurante_id,
      p.usuario_id,
      p.telefono,
      p.items,
      p.subtotal,
      p.tipo_despacho,
      p.direccion,
      p.lat,
      p.lng,
      p.distancia_km,
      p.tiempo_estimado,
      p.costo_envio,
      p.total,
      p.metodo_pago,
      p.estado,
      p.notas,
      p.created_at,
      p.updated_at,
      p.session_id,
      p.session_started_at,
      p.pedido_numero,
      p.pedido_codigo,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb))='array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb))>0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.id::varchar,
    c.restaurante_id,
    c.usuario_id,
    c.telefono,
    c.items,
    c.subtotal,
    c.tipo_despacho,
    c.direccion,
    c.lat,
    c.lng,
    c.distancia_km,
    c.tiempo_estimado,
    c.costo_envio,
    c.total,
    c.metodo_pago,
    c.estado,
    c.notas,
    c.created_at,
    c.updated_at,
    c.session_id,
    c.session_started_at,
    c.pedido_numero,
    c.pedido_codigo
  FROM cand c
  CROSS JOIN ref
  WHERE c.es_reutilizable
  ORDER BY
    CASE
      WHEN ref.pedido_ref <> '' AND (
        c.id::text = ref.pedido_ref
        OR lower(COALESCE(c.pedido_codigo,'')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo,'')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits)>=3 AND right(COALESCE(c.pedido_codigo,''),length(ref.pedido_digits))=ref.pedido_digits)
      ) THEN 0 ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id,'')=p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items  THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'recibido')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1
$function$
;

-- Permissions

ALTER FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool, int4) TO postgres;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id text DEFAULT NULL::text, p_forzar_pedido_nuevo boolean DEFAULT false)
 RETURNS TABLE(id character varying, restaurante_id integer, usuario_id integer, telefono text, items jsonb, subtotal numeric, tipo_despacho text, direccion text, lat numeric, lng numeric, distancia_km numeric, tiempo_estimado text, costo_envio numeric, total numeric, metodo_pago text, estado text, notas text, created_at timestamp without time zone, updated_at timestamp without time zone, session_id text, session_started_at timestamp without time zone, pedido_numero integer, pedido_codigo text)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes',  60) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes', 30) AS modify_window_minutes
  ),
  ref AS (
    SELECT
      trim(COALESCE(p_pedido_id, ''))                                      AS pedido_ref,
      regexp_replace(COALESCE(p_pedido_id, ''), '[^0-9]', '', 'g')        AS pedido_digits
  ),
  cand AS (
    SELECT
      p.id,
      p.restaurante_id,
      p.usuario_id,
      p.telefono,
      p.items,
      p.subtotal,
      p.tipo_despacho,
      p.direccion,
      p.lat,
      p.lng,
      p.distancia_km,
      p.tiempo_estimado,
      p.costo_envio,
      p.total,
      p.metodo_pago,
      p.estado,
      p.notas,
      p.created_at,
      p.updated_at,
      p.session_id,
      p.session_started_at,
      p.pedido_numero,
      p.pedido_codigo,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(p.items, '[]'::jsonb)) > 0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN p_forzar_pedido_nuevo THEN false
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('en_curso', 'draft', 'recibido')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado, 'recibido')) IN ('pendiente_pago', 'confirmado', 'en_preparacion', 'pagado', 'paid')
          THEN COALESCE(p.updated_at, p.created_at, NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono = p_telefono
  )
  SELECT
    c.id::varchar,
    c.restaurante_id,
    c.usuario_id,
    c.telefono,
    c.items,
    c.subtotal,
    c.tipo_despacho,
    c.direccion,
    c.lat,
    c.lng,
    c.distancia_km,
    c.tiempo_estimado,
    c.costo_envio,
    c.total,
    c.metodo_pago,
    c.estado,
    c.notas,
    c.created_at,
    c.updated_at,
    c.session_id,
    c.session_started_at,
    c.pedido_numero,
    c.pedido_codigo
  FROM cand c
  CROSS JOIN ref
  WHERE c.es_reutilizable
  ORDER BY
    CASE
      WHEN ref.pedido_ref <> '' AND (
        c.id::text = ref.pedido_ref
        OR lower(COALESCE(c.pedido_codigo, '')) = lower(ref.pedido_ref)
        OR lower(COALESCE(c.pedido_codigo, '')) LIKE lower(ref.pedido_ref) || '%'
        OR (length(ref.pedido_digits) >= 3 AND right(COALESCE(c.pedido_codigo, ''), length(ref.pedido_digits)) = ref.pedido_digits)
      ) THEN 0
      ELSE 1
    END,
    CASE WHEN p_session_id IS NOT NULL AND COALESCE(c.session_id, '') = p_session_id THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado, 'recibido')) = 'recibido' THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.id DESC
  LIMIT 1;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_select_pedido_reutilizable(text, text, text, bool) TO postgres;

-- DROP FUNCTION public.fn_select_pedido_reutilizable(text, text, int8, int4);

CREATE OR REPLACE FUNCTION public.fn_select_pedido_reutilizable(p_telefono text, p_session_id text DEFAULT NULL::text, p_pedido_id bigint DEFAULT NULL::bigint, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(pedido_id text, pedido_codigo text, estado text, tipo_despacho text, total numeric, updated_at timestamp without time zone, es_modificable boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH cfg AS (
    SELECT
      public.fn_get_rest_config_int('cart_expiry_minutes'::text,  60, p_restaurante_id) AS cart_expiry_minutes,
      public.fn_get_rest_config_int('modify_window_minutes'::text, 30, p_restaurante_id) AS modify_window_minutes
  ),
  cand AS (
    SELECT
      p.id::text AS pedido_id,
      p.pedido_codigo,
      p.estado,
      p.tipo_despacho,
      p.total,
      p.updated_at,
      COALESCE(p.updated_at, p.created_at, NOW()) AS ref_ts,
      CASE WHEN jsonb_typeof(COALESCE(p.items,'[]'::jsonb))='array'
                AND jsonb_array_length(COALESCE(p.items,'[]'::jsonb))>0
           THEN true ELSE false END AS has_items,
      CASE
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('en_curso','draft','recibido')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT cart_expiry_minutes  FROM cfg))
        WHEN lower(COALESCE(p.estado,'recibido')) IN ('pendiente_pago','confirmado','en_preparacion','pagado','paid')
          THEN COALESCE(p.updated_at,p.created_at,NOW()) >= NOW() - make_interval(mins => (SELECT modify_window_minutes FROM cfg))
        ELSE false
      END AS es_reutilizable
    FROM public.pedidos p
    WHERE p.telefono       = p_telefono
      AND p.restaurante_id = p_restaurante_id
  )
  SELECT
    c.pedido_id,
    c.pedido_codigo,
    c.estado,
    c.tipo_despacho,
    c.total,
    c.updated_at,
    c.es_reutilizable AS es_modificable
  FROM cand c
  WHERE c.es_reutilizable
    AND (p_pedido_id IS NULL OR c.pedido_id = p_pedido_id::text)
    AND (p_session_id IS NULL OR EXISTS(
          SELECT 1 FROM public.pedidos p2
          WHERE p2.id::text = c.pedido_id AND p2.session_id = p_session_id
        ))
  ORDER BY
    CASE WHEN p_session_id IS NOT NULL AND EXISTS(
           SELECT 1 FROM public.pedidos p2
           WHERE p2.id::text = c.pedido_id AND p2.session_id = p_session_id
         ) THEN 0 ELSE 1 END,
    CASE WHEN c.has_items THEN 0 ELSE 1 END,
    CASE WHEN lower(COALESCE(c.estado,'recibido')) IN ('en_curso','recibido') THEN 0 ELSE 1 END,
    c.ref_ts DESC,
    c.pedido_id DESC
  LIMIT 1
$function$
;

-- Permissions

ALTER FUNCTION public.fn_select_pedido_reutilizable(text, text, int8, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_select_pedido_reutilizable(text, text, int8, int4) TO postgres;

-- DROP FUNCTION public.fn_set_pedido_codigo();

CREATE OR REPLACE FUNCTION public.fn_set_pedido_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prefix text;
  v_next integer;
BEGIN
  IF NEW.pedido_codigo IS NOT NULL AND btrim(NEW.pedido_codigo) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;

  v_prefix := to_char((COALESCE(NEW.created_at, NOW()) AT TIME ZONE 'Atlantic/Canary')::date, 'YYMMDD');

  PERFORM pg_advisory_xact_lock(hashtextextended('pedido_codigo_' || v_prefix, 0));

  SELECT COALESCE(MAX(split_part(pedido_codigo, '-', 2)::integer), 1000) + 1
    INTO v_next
  FROM public.pedidos
  WHERE pedido_codigo ~ ('^' || v_prefix || '-[0-9]{4}$');

  NEW.pedido_codigo := v_prefix || '-' || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_set_pedido_codigo() OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_set_pedido_codigo() TO postgres;

-- DROP FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text, int4);

CREATE OR REPLACE FUNCTION public.fn_upsert_usuario_perfil(p_telefono text, p_nombre text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_tipo_despacho text DEFAULT NULL::text, p_restaurante_id integer DEFAULT 1)
 RETURNS TABLE(id integer, telefono text, nombre text, direccion_frecuente text, updated_name boolean, updated_address boolean)
 LANGUAGE sql
AS $function$
WITH prev AS (
  SELECT u.id, u.telefono, u.nombre, u.direccion_frecuente
  FROM   public.usuarios u
  WHERE  u.telefono       = p_telefono
    AND  u.restaurante_id = p_restaurante_id
  LIMIT 1
),
upserted AS (
  INSERT INTO public.usuarios (
    restaurante_id, telefono, nombre, direccion_frecuente, created_at, updated_at
  )
  VALUES (
    p_restaurante_id,
    p_telefono,
    NULLIF(btrim(p_nombre), ''),
    CASE
      WHEN lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
       AND NULLIF(btrim(p_direccion), '') IS NOT NULL
      THEN NULLIF(btrim(p_direccion), '')
      ELSE NULL
    END,
    NOW(), NOW()
  )
  ON CONFLICT (restaurante_id, telefono)
  DO UPDATE SET
    updated_at          = NOW(),
    nombre              = CASE
                            WHEN NULLIF(btrim(p_nombre), '') IS NOT NULL
                            THEN NULLIF(btrim(p_nombre), '')
                            ELSE public.usuarios.nombre
                          END,
    direccion_frecuente = CASE
                            WHEN lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
                             AND NULLIF(btrim(p_direccion), '') IS NOT NULL
                            THEN NULLIF(btrim(p_direccion), '')
                            ELSE public.usuarios.direccion_frecuente
                          END
  RETURNING
    public.usuarios.id,
    public.usuarios.telefono,
    public.usuarios.nombre,
    public.usuarios.direccion_frecuente
)
SELECT
  u.id::int,
  u.telefono::text,
  u.nombre::text,
  u.direccion_frecuente::text,
  (
    NULLIF(btrim(p_nombre), '') IS NOT NULL
    AND (SELECT p.nombre FROM prev p LIMIT 1) IS DISTINCT FROM u.nombre
  ) AS updated_name,
  (
    lower(COALESCE(p_tipo_despacho,'')) IN ('delivery','domicilio')
    AND NULLIF(btrim(p_direccion), '') IS NOT NULL
    AND (SELECT p.direccion_frecuente FROM prev p LIMIT 1) IS DISTINCT FROM u.direccion_frecuente
  ) AS updated_address
FROM upserted u
$function$
;

-- Permissions

ALTER FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text, int4) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text, int4) TO postgres;

-- DROP FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text);

CREATE OR REPLACE FUNCTION public.fn_upsert_usuario_perfil(p_telefono text, p_nombre text DEFAULT NULL::text, p_direccion text DEFAULT NULL::text, p_tipo_despacho text DEFAULT NULL::text)
 RETURNS TABLE(id integer, telefono text, nombre text, direccion_frecuente text, updated_name boolean, updated_address boolean)
 LANGUAGE sql
AS $function$
WITH prev AS (
  SELECT
    u.id,
    u.telefono,
    u.nombre,
    u.direccion_frecuente
  FROM public.usuarios u
  WHERE u.telefono = p_telefono
  LIMIT 1
),
upserted AS (
  INSERT INTO public.usuarios (
    restaurante_id,
    telefono,
    nombre,
    direccion_frecuente,
    created_at,
    updated_at
  )
  VALUES (
    1,
    p_telefono,
    NULLIF(btrim(p_nombre), ''),
    CASE
      WHEN lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
       AND NULLIF(btrim(p_direccion), '') IS NOT NULL
      THEN NULLIF(btrim(p_direccion), '')
      ELSE NULL
    END,
    NOW(),
    NOW()
  )
  ON CONFLICT (telefono)
  DO UPDATE
    SET
      updated_at = NOW(),
      nombre = CASE
        WHEN NULLIF(btrim(p_nombre), '') IS NOT NULL
        THEN NULLIF(btrim(p_nombre), '')
        ELSE public.usuarios.nombre
      END,
      direccion_frecuente = CASE
        WHEN lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
         AND NULLIF(btrim(p_direccion), '') IS NOT NULL
        THEN NULLIF(btrim(p_direccion), '')
        ELSE public.usuarios.direccion_frecuente
      END
  RETURNING
    public.usuarios.id,
    public.usuarios.telefono,
    public.usuarios.nombre,
    public.usuarios.direccion_frecuente
)
SELECT
  u.id::int,
  u.telefono::text,
  u.nombre::text,
  u.direccion_frecuente::text,
  (
    NULLIF(btrim(p_nombre), '') IS NOT NULL
    AND (
      (SELECT p.nombre FROM prev p LIMIT 1) IS DISTINCT FROM u.nombre
    )
  ) AS updated_name,
  (
    lower(COALESCE(p_tipo_despacho, '')) IN ('delivery', 'domicilio')
    AND NULLIF(btrim(p_direccion), '') IS NOT NULL
    AND (
      (SELECT p.direccion_frecuente FROM prev p LIMIT 1) IS DISTINCT FROM u.direccion_frecuente
    )
  ) AS updated_address
FROM upserted u;
$function$
;

-- Permissions

ALTER FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text) OWNER TO postgres;
GRANT ALL ON FUNCTION public.fn_upsert_usuario_perfil(text, text, text, text) TO postgres;

-- DROP FUNCTION public.trg_set_pedido_codigo();

CREATE OR REPLACE FUNCTION public.trg_set_pedido_codigo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.pedido_codigo IS NULL OR btrim(NEW.pedido_codigo) = '' THEN
    NEW.pedido_codigo := public.fn_next_pedido_codigo(COALESCE(NEW.created_at::date, CURRENT_DATE));
  END IF;
  IF NEW.created_at IS NULL THEN NEW.created_at := NOW(); END IF;
  IF NEW.updated_at IS NULL THEN NEW.updated_at := NOW(); END IF;
  RETURN NEW;
END;
$function$
;

-- Permissions

ALTER FUNCTION public.trg_set_pedido_codigo() OWNER TO postgres;
GRANT ALL ON FUNCTION public.trg_set_pedido_codigo() TO postgres;






-- Permissions

GRANT ALL ON SCHEMA public TO pg_database_owner;
GRANT USAGE ON SCHEMA public TO public;

-- Triggers (movidos al final para respetar dependencias)

create trigger trg_n8n_chat_set_restaurante_id before
insert
    on
    public.n8n_chat_histories for each row execute function fn_n8n_chat_set_restaurante_id();

create trigger trg_set_pedido_codigo before
insert
    on
    public.pedidos for each row execute function fn_set_pedido_codigo();

create trigger trg_log_estado_pedido after
update
    on
    public.pedidos for each row execute function fn_log_estado_pedido();
