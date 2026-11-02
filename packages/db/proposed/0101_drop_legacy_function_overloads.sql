-- =============================================================================
-- PROPUESTA (no se aplica automáticamente) — borrar versiones antiguas sin tenant
--
-- Las funciones de abajo conviven con una versión nueva que recibe p_restaurante_id.
-- Revisión del 2026-11-01: los flujos n8n versionados en cesarsan7/easyorder (docs/n8n)
-- y la API llaman siempre a la versión CON restaurante_id, así que estas no se usan.
-- Antes de aplicar: confirmar que los flujos activos en n8n son los del repositorio.
--
-- Pendiente (siguiente paso): las versiones nuevas usan `p_restaurante_id DEFAULT 1`.
-- Se quitará ese valor por defecto al mover estas consultas a la API de Konnecttia,
-- para que olvidar el restaurante produzca un error y no datos del restaurante 1.
-- =============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_select_pedido_reutilizable(text, text, bigint);
DROP FUNCTION IF EXISTS public.fn_select_pedido_reutilizable(text, text, text, boolean);
DROP FUNCTION IF EXISTS public.fn_menu_lookup(text);
DROP FUNCTION IF EXISTS public.fn_menu_catalog();
DROP FUNCTION IF EXISTS public.fn_listar_pedidos_modificables(text);
DROP FUNCTION IF EXISTS public.fn_resolver_pedido_modificable(text, text);
DROP FUNCTION IF EXISTS public.fn_resolver_pedido_referencia(text, text);
DROP FUNCTION IF EXISTS public.fn_upsert_usuario_perfil(text, text, text, text);
DROP FUNCTION IF EXISTS public.fn_next_pedido_numero();
DROP FUNCTION IF EXISTS public.fn_next_pedido_codigo(date);
DROP FUNCTION IF EXISTS public.fn_get_rest_config_int(text, integer);

COMMIT;
