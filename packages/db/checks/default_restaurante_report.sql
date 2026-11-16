-- Informe de solo lectura: funciones cuyo parámetro `p_restaurante_id` tiene un valor por defecto
-- (hoy `DEFAULT 1`, el restaurante de La Isla). Con un valor por defecto, olvidar pasar el
-- restaurante lee o escribe en el restaurante 1 en vez de fallar.
--
-- No hay propuesta de migración todavía: PostgreSQL no deja quitar un valor por defecto con
-- CREATE OR REPLACE (hay que borrar y recrear la función) y los parámetros anteriores con valor
-- por defecto también tendrían que ser obligatorios. Antes de proponerla hay que confirmar, con los
-- flujos activos de n8n, que ninguna llamada omite el restaurante (ver proposed/0101).
--
-- Ejecutar en el entorno que se quiera revisar; no modifica nada.
SELECT p.proname                                   AS funcion,
       pg_get_function_arguments(p.oid)            AS argumentos
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  pg_get_function_arguments(p.oid) ~* 'p_restaurante_id\s+\w+\s+DEFAULT'
ORDER  BY p.proname, p.oid;
