-- =============================================================================
-- 0040 · Carrito del agente de WhatsApp
--
-- Componente: base de datos (API /agente, agente de WhatsApp en n8n)
-- Reutiliza:  canal_whatsapp (0038), sucursal (UNIQUE id+restaurante_id de la 0003), pedidos,
--             config_clave cart_expiry_minutes (0007)
-- Tablas:     nueva agente_carrito
-- Riesgo:     bajo. Tabla nueva; no toca pedidos ni los flujos actuales. El pedido se crea solo al
--             confirmar, con las mismas reglas que la web (placeOrder, canal whatsapp).
-- MVP:        sí (diseño en integrations/n8n/diseno/agente-carta-real.md, sección 4)
--
-- Reversión:
--   DROP TABLE public.agente_carrito;
-- =============================================================================

-- Carrito que el cliente arma conversando con el agente. Guarda solo ids y cantidades: el precio
-- se calcula siempre en la API con la carta vigente. Un carrito abierto por número y cliente, así
-- que un carrito nunca pasa de un local a otro (cada número es de un local o del restaurante).
CREATE TABLE public.agente_carrito (
  id             bigserial    PRIMARY KEY,
  restaurante_id int4         NOT NULL,
  canal_id       bigint       NOT NULL,
  telefono       text         NOT NULL CHECK (telefono ~ '^\+[1-9][0-9]{6,14}$'),
  -- [{"menu_item_id":1,"menu_variant_id":2,"cantidad":1,"extras":[{"extra_id":3,"cantidad":1}],"nota":null}]
  lineas         jsonb        NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(lineas) = 'array'),
  tipo_despacho  varchar(20)  NULL CHECK (tipo_despacho IN ('retiro', 'delivery')),
  sucursal_id    bigint       NULL,
  direccion      text         NULL CHECK (direccion IS NULL OR length(direccion) <= 300),
  lat            numeric(10, 7) NULL,
  lng            numeric(10, 7) NULL,
  zona_id        int4         NULL REFERENCES public.delivery_zone (delivery_zone_id) ON DELETE SET NULL,
  estado         varchar(20)  NOT NULL DEFAULT 'abierto'
                 CHECK (estado IN ('abierto', 'confirmado', 'caducado', 'descartado')),
  pedido_id      int4         NULL REFERENCES public.pedidos (id) ON DELETE SET NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT agente_carrito_canal_fk FOREIGN KEY (canal_id, restaurante_id)
    REFERENCES public.canal_whatsapp (id, restaurante_id) ON DELETE CASCADE,
  CONSTRAINT agente_carrito_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id),
  CONSTRAINT agente_carrito_ubicacion_ck CHECK ((lat IS NULL) = (lng IS NULL))
);

CREATE UNIQUE INDEX ux_agente_carrito_abierto
  ON public.agente_carrito (canal_id, telefono) WHERE estado = 'abierto';
CREATE INDEX idx_agente_carrito_restaurante
  ON public.agente_carrito (restaurante_id, estado, updated_at);

COMMENT ON TABLE public.agente_carrito IS
  'Carrito del agente de WhatsApp (ids y cantidades, sin precios). Caduca tras cart_expiry_minutes sin cambios; al confirmar se crea el pedido con placeOrder y se guarda pedido_id.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'konnecttia_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.agente_carrito TO konnecttia_app;
    GRANT USAGE, SELECT ON SEQUENCE public.agente_carrito_id_seq TO konnecttia_app;
  END IF;
END $$;
