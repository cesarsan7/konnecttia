-- =============================================================================
-- 0011 · Carta editable desde el panel: orden de productos, variantes y extras, y alérgenos
--
-- Solo añade columnas con valor por defecto: n8n (fn_menu_lookup y compañía) y el dashboard
-- actual siguen leyendo las mismas tablas sin cambios.
--
-- Orden: sort_order en menu_item, menu_variant y extra (menu_category ya lo tenía). Todo empieza
-- en 0, así que la carta se ve igual que antes hasta que alguien reordene desde el panel
-- (desempate: variantes por precio, productos y extras por id).
--
-- Alérgenos (Reglamento UE 1169/2011, anexo II). Columna `alergenos text[]`:
--   NULL  = «no informados» (valor por defecto: la web nunca dice «sin alérgenos» si falta el dato)
--   '{}'  = el restaurante declara que no contiene ninguno de los 14
--   lista = los que contiene
-- En menu_item y extra. La columna antigua extra.allergens (texto libre, sin uso en la web) se
-- conserva sin tocar. Los códigos deben coincidir con ALLERGENS de packages/domain (lo comprueba
-- una prueba).
--
-- Reversión:
--   ALTER TABLE public.menu_item    DROP COLUMN sort_order, DROP COLUMN alergenos;
--   ALTER TABLE public.menu_variant DROP COLUMN sort_order;
--   ALTER TABLE public.extra        DROP COLUMN sort_order, DROP COLUMN alergenos;
--   DROP FUNCTION public.fn_alergenos_validos(text[]);
-- =============================================================================

CREATE FUNCTION public.fn_alergenos_validos(p_alergenos text[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT p_alergenos IS NULL OR p_alergenos <@ ARRAY[
    'gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes', 'soja', 'lacteos',
    'frutos_de_cascara', 'apio', 'mostaza', 'sesamo', 'sulfitos', 'altramuces', 'moluscos'
  ]::text[]
$$;

COMMENT ON FUNCTION public.fn_alergenos_validos(text[]) IS
  'Los 14 alérgenos de declaración obligatoria (UE 1169/2011). Mismos códigos que ALLERGENS en packages/domain.';

ALTER TABLE public.menu_item
  ADD COLUMN sort_order int4 NOT NULL DEFAULT 0,
  ADD COLUMN alergenos  text[] NULL,
  ADD CONSTRAINT ck_menu_item_alergenos CHECK (public.fn_alergenos_validos(alergenos));

ALTER TABLE public.menu_variant
  ADD COLUMN sort_order int4 NOT NULL DEFAULT 0;

ALTER TABLE public.extra
  ADD COLUMN sort_order int4 NOT NULL DEFAULT 0,
  ADD COLUMN alergenos  text[] NULL,
  ADD CONSTRAINT ck_extra_alergenos CHECK (public.fn_alergenos_validos(alergenos));

COMMENT ON COLUMN public.menu_item.alergenos IS
  'Alérgenos del producto. NULL = no informados (nunca mostrar «sin alérgenos»); {} = ninguno.';
COMMENT ON COLUMN public.extra.alergenos IS
  'Alérgenos del extra. NULL = no informados; {} = ninguno. Sustituye al texto libre de allergens.';

CREATE INDEX ix_menu_item_category_sort ON public.menu_item (menu_category_id, sort_order, menu_item_id);
