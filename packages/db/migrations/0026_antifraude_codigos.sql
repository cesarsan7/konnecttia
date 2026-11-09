-- =============================================================================
-- 0026 · Antifraude capa 3: código de verificación solo cuando hay riesgo (ADR 0011)
--
-- Componente: PostgreSQL. La API (checkout web) y n8n (envío de la plantilla) vendrán en PRs
--             siguientes; esta migración solo prepara los datos.
-- Reutiliza:  restaurante, pedidos, fn_telefono_normalizado (0021), config_clave (0007).
-- Riesgo:     bajo. Una tabla, dos funciones y tres claves de diccionario nuevas. Nada las lee
--             todavía: sin clave `antifraude_codigo_canal` la capa 3 queda apagada y el
--             comportamiento no cambia.
-- Fase:       post-MVP.
--
-- `verificacion_codigo`: un código enviado a un teléfono para un restaurante.
--   * El código de 6 cifras NUNCA se guarda: solo `codigo_hash` (HMAC-SHA256 con un secreto de la
--     API), así un volcado de la base no sirve para verificar teléfonos.
--   * Caduca (`caduca_at`) y limita los intentos (`intentos` / `max_intentos`): fuerza bruta
--     sobre 6 cifras sin tope sería trivial.
--   * `verificado_at` lo marca la API al acertar; `consumido_at`, al crear el pedido con ese
--     teléfono, para que un mismo código no sirva para varios pedidos.
--   * `coste_eur` es el coste estimado del envío (WhatsApp ≈ 0,0166 €, SMS ≈ 0,08 €). Es la única
--     columna de dinero que no va en céntimos enteros: un código cuesta menos de 2 céntimos y el
--     redondeo a céntimos falsearía el tope mensual.
--   * `motivo` guarda por qué se pidió, para auditar y ajustar las reglas.
--
-- Funciones (para la API y n8n; `p_restaurante_id` obligatorio, sin valores por defecto):
--   fn_telefono_conocido(restaurante, telefono): ese teléfono ya recibió un pedido entregado en
--     ese restaurante; no vuelve a pasar por el código (ADR 0011, punto 3).
--   fn_codigo_gasto_mes(restaurante, ahora): euros gastados en códigos en el mes natural de ese
--     restaurante (zona horaria del restaurante), para aplicar el tope mensual.
--
-- Claves opcionales de restaurante_config (sin valor, ver cada descripción):
--   antifraude_codigo_canal, antifraude_codigo_tope_mensual_eur, antifraude_codigo_importe_umbral_eur.
--
-- Reversión:
--   DELETE FROM public.restaurante_config WHERE config_key IN
--     ('antifraude_codigo_canal', 'antifraude_codigo_tope_mensual_eur', 'antifraude_codigo_importe_umbral_eur');
--   DELETE FROM public.config_clave WHERE clave IN
--     ('antifraude_codigo_canal', 'antifraude_codigo_tope_mensual_eur', 'antifraude_codigo_importe_umbral_eur');
--   DROP FUNCTION public.fn_codigo_gasto_mes(int4, timestamptz);
--   DROP FUNCTION public.fn_telefono_conocido(int4, text);
--   DROP TABLE public.verificacion_codigo;
-- =============================================================================

CREATE TABLE public.verificacion_codigo (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurante_id  int4 NOT NULL REFERENCES public.restaurante (id) ON DELETE CASCADE,
  telefono        text NOT NULL CHECK (telefono <> '' AND telefono = public.fn_telefono_normalizado(telefono)),
  canal           text NOT NULL CHECK (canal IN ('whatsapp', 'sms')),
  motivo          text NOT NULL CHECK (motivo IN ('telefono_nuevo', 'efectivo_reparto', 'importe_alto')),
  codigo_hash     text NOT NULL CHECK (codigo_hash <> ''),
  created_at      timestamptz NOT NULL DEFAULT now(),
  caduca_at       timestamptz NOT NULL,
  intentos        smallint NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  max_intentos    smallint NOT NULL DEFAULT 5 CHECK (max_intentos > 0),
  verificado_at   timestamptz NULL,
  consumido_at    timestamptz NULL,
  coste_eur       numeric(8, 4) NOT NULL DEFAULT 0 CHECK (coste_eur >= 0),
  CONSTRAINT verificacion_codigo_caduca_check CHECK (caduca_at > created_at),
  CONSTRAINT verificacion_codigo_verificado_check CHECK (verificado_at IS NULL OR verificado_at >= created_at),
  CONSTRAINT verificacion_codigo_consumido_check CHECK (consumido_at IS NULL OR verificado_at IS NOT NULL)
);

COMMENT ON TABLE public.verificacion_codigo IS 'Códigos de verificación de teléfono del checkout web, solo cuando hay riesgo (pieza Q, capa 3, ADR 0011).';
COMMENT ON COLUMN public.verificacion_codigo.codigo_hash IS 'HMAC-SHA256 del código con un secreto de la API. El código en claro no se guarda nunca.';
COMMENT ON COLUMN public.verificacion_codigo.coste_eur IS 'Coste estimado del envío en euros (no en céntimos: un código cuesta menos de 2 céntimos).';
COMMENT ON COLUMN public.verificacion_codigo.consumido_at IS 'Cuándo un pedido usó esta verificación; un código sirve para un solo pedido.';

-- Códigos recientes de un teléfono (límite de reenvíos y verificación en curso).
CREATE INDEX ix_verificacion_codigo_telefono
  ON public.verificacion_codigo (restaurante_id, telefono, created_at DESC);
-- Gasto del mes por restaurante.
CREATE INDEX ix_verificacion_codigo_mes
  ON public.verificacion_codigo (restaurante_id, created_at);

CREATE FUNCTION public.fn_telefono_conocido(p_restaurante_id int4, p_telefono text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.pedidos p
    WHERE  p.restaurante_id = p_restaurante_id
      AND  public.fn_telefono_normalizado(p.telefono) = public.fn_telefono_normalizado(p_telefono)
      AND  p.estado = 'entregado'
  )
$$;

COMMENT ON FUNCTION public.fn_telefono_conocido(int4, text) IS 'true si el teléfono ya tiene un pedido entregado en ese restaurante: no necesita código de verificación.';

CREATE FUNCTION public.fn_codigo_gasto_mes(p_restaurante_id int4, p_ahora timestamptz) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(v.coste_eur), 0)
  FROM   public.restaurante r
  JOIN   public.verificacion_codigo v ON v.restaurante_id = r.id
  WHERE  r.id = p_restaurante_id
    AND  v.created_at >= date_trunc('month', p_ahora AT TIME ZONE r.zona_horaria) AT TIME ZONE r.zona_horaria
    AND  v.created_at <  (date_trunc('month', p_ahora AT TIME ZONE r.zona_horaria) + interval '1 month') AT TIME ZONE r.zona_horaria
$$;

COMMENT ON FUNCTION public.fn_codigo_gasto_mes(int4, timestamptz) IS 'Euros gastados en códigos de verificación en el mes natural (zona horaria del restaurante) que contiene p_ahora.';

INSERT INTO public.config_clave (clave, descripcion, tipo, unidad, ejemplo, usado_por) VALUES
  ('antifraude_codigo_canal', 'Canal del código de verificación del checkout web: whatsapp o sms. Sin valor: la capa 3 está apagada y no se pide código.', 'texto', NULL, 'whatsapp', '{api-konnecttia}'),
  ('antifraude_codigo_tope_mensual_eur', 'Gasto máximo mensual en códigos de verificación por restaurante. Al llegar, no se envían más códigos y el pedido de riesgo pide pago con tarjeta o llamar al local. Sin valor: 10.', 'decimal', 'EUR', '10', '{api-konnecttia}'),
  ('antifraude_codigo_importe_umbral_eur', 'Importe del pedido (total) a partir del cual se pide código aunque el teléfono sea conocido. Sin valor: no se aplica la regla de importe.', 'decimal', 'EUR', '40', '{api-konnecttia}');
