-- =============================================================================
-- 0051 · Valores iniciales de configuración para cada restaurante nuevo
--
-- Componente: base de datos (diccionario `config_clave` y trigger sobre `restaurante`).
-- Reutiliza: `config_clave` (0007) y `restaurante_config`; mismo patrón que el trigger de la
--            sucursal principal (0003): el dato nace con el restaurante, sea cual sea la vía de alta
--            (panel interno, alta autoservicio, clonado o un seed SQL).
-- Riesgo: bajo, solo añade. Una columna nueva y un trigger que inserta con ON CONFLICT DO NOTHING.
-- Fase: MVP.
--
-- Problema (17/11): la migración 0009 solo cargó `modo_ocupado_opciones` y
-- `modo_ocupado_duracion_minutos` en los restaurantes que existían entonces. Los creados después
-- no las tenían y, sin `modo_ocupado_opciones`, el tablero NO muestra el botón «Modo ocupado».
--
-- Solución sin valores en el código: `config_clave.valor_inicial` guarda el valor con el que nace
-- cada clave; el trigger copia al restaurante nuevo las claves activas con valor inicial. Añadir
-- otra clave con valor inicial en el futuro es una migración de datos, no un cambio de código.
-- También se rellenan los restaurantes que ya existen y no tienen esas claves.
--
-- Reversión:
--   DROP TRIGGER trg_restaurante_config_inicial ON public.restaurante;
--   DROP FUNCTION public.fn_restaurante_config_inicial();
--   ALTER TABLE public.config_clave DROP COLUMN valor_inicial;
--   (las filas ya copiadas en restaurante_config se conservan: son configuración de cada local)
-- =============================================================================

ALTER TABLE public.config_clave ADD COLUMN valor_inicial text NULL;

COMMENT ON COLUMN public.config_clave.valor_inicial IS
  'Valor con el que nace la clave en cada restaurante nuevo (trigger trg_restaurante_config_inicial). NULL = no se crea sola.';

UPDATE public.config_clave SET valor_inicial = '[10, 20, 30]' WHERE clave = 'modo_ocupado_opciones';
UPDATE public.config_clave SET valor_inicial = '60'           WHERE clave = 'modo_ocupado_duracion_minutos';

CREATE FUNCTION public.fn_restaurante_config_inicial() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
  SELECT NEW.id, c.clave, c.valor_inicial, c.descripcion
  FROM   public.config_clave c
  WHERE  c.valor_inicial IS NOT NULL AND c.estado = 'activa'
  ON CONFLICT (config_key, restaurante_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_restaurante_config_inicial() IS
  'Copia a cada restaurante nuevo las claves de config_clave con valor_inicial (0051).';

CREATE TRIGGER trg_restaurante_config_inicial
  AFTER INSERT ON public.restaurante
  FOR EACH ROW EXECUTE FUNCTION public.fn_restaurante_config_inicial();

-- Restaurantes que ya existen y no tienen esas claves (los de 0009 ya las tienen: no se tocan).
INSERT INTO public.restaurante_config (restaurante_id, config_key, config_value, description)
SELECT r.id, c.clave, c.valor_inicial, c.descripcion
FROM   public.restaurante r
CROSS  JOIN public.config_clave c
WHERE  c.valor_inicial IS NOT NULL AND c.estado = 'activa'
ON CONFLICT (config_key, restaurante_id) DO NOTHING;
