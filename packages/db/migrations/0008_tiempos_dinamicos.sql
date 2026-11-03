-- =============================================================================
-- 0008 · Tiempo estimado variable (hora punta, modo ocupado y cola)
--
-- tiempo = base (zona o restaurante_config)
--        + la franja punta mayor que coincida (franja_pico)
--        + el modo ocupado activo mayor (modo_ocupado, se activa desde el panel)
--        + cola: cola_minutos_por_pedido × (pedidos activos − cola_pedidos_sin_espera)
-- Si el restaurante usa un texto fijo (pickup_eta_text / delivery_eta_text) se muestra tal cual.
-- sucursal_id NULL = vale para todos los locales.
-- Reversión: DROP TABLE public.modo_ocupado, public.franja_pico;
--            DELETE FROM public.config_clave WHERE clave LIKE 'cola_%';
-- =============================================================================

CREATE TABLE public.franja_pico (
  id              bigserial   PRIMARY KEY,
  restaurante_id  int4        NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  sucursal_id     bigint      NULL,
  -- NULL = todos los días.
  dia             text        NULL CHECK (dia IS NULL OR dia IN
                    ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')),
  desde           time        NOT NULL,
  hasta           time        NOT NULL,
  servicio        varchar(10) NOT NULL DEFAULT 'ambos' CHECK (servicio IN ('recogida','reparto','ambos')),
  minutos_extra   int2        NOT NULL CHECK (minutos_extra BETWEEN 1 AND 240),
  activo          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT franja_pico_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id) ON DELETE CASCADE,
  CONSTRAINT franja_pico_horas_check CHECK (desde <> hasta)
);

COMMENT ON TABLE public.franja_pico IS
  'Horas punta recurrentes: minutos extra en un día y franja (si hasta < desde, cruza la medianoche).';

CREATE TABLE public.modo_ocupado (
  id              bigserial   PRIMARY KEY,
  restaurante_id  int4        NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  sucursal_id     bigint      NULL,
  servicio        varchar(10) NOT NULL DEFAULT 'ambos' CHECK (servicio IN ('recogida','reparto','ambos')),
  minutos_extra   int2        NOT NULL CHECK (minutos_extra BETWEEN 1 AND 240),
  desde           timestamptz NOT NULL DEFAULT now(),
  hasta           timestamptz NOT NULL,
  motivo          varchar(200) NULL,
  creado_por      text        NULL,
  finalizado_at   timestamptz NULL,
  CONSTRAINT modo_ocupado_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id) ON DELETE CASCADE,
  CONSTRAINT modo_ocupado_rango_check CHECK (hasta > desde)
);

CREATE INDEX idx_modo_ocupado_vigente ON public.modo_ocupado (restaurante_id, hasta)
  WHERE finalizado_at IS NULL;

COMMENT ON TABLE public.modo_ocupado IS
  '«Modo ocupado» activado desde el panel: minutos extra hasta una hora (o hasta finalizarlo).';

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('cola_minutos_por_pedido', 'Minutos extra por cada pedido activo por encima de cola_pedidos_sin_espera. Sin valor: no se ajusta por cola.', 'entero', 'minutos', '2', '{api-konnecttia}'),
  ('cola_pedidos_sin_espera', 'Pedidos activos que el local asume sin sumar tiempo (umbral de la cola).', 'entero', 'pedidos', '3', '{api-konnecttia}');
