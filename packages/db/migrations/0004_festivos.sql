-- =============================================================================
-- 0004 · Festivos
--
-- Un festivo aplica el horario del domingo del restaurante (o del local, si tiene horario propio).
-- Con `cerrado = true`, el local no abre ese día.
-- `sucursal_id` NULL: el festivo vale para todos los locales del restaurante. Si un local tiene
-- su propio festivo en la misma fecha, manda el del local.
--
-- n8n todavía no lee esta tabla: el agente de WhatsApp sigue usando solo `horarios`.
-- Reversión: DROP TABLE public.festivo;
-- =============================================================================

CREATE TABLE public.festivo (
  id              bigserial    PRIMARY KEY,
  restaurante_id  int4         NOT NULL REFERENCES public.restaurante(id) ON DELETE CASCADE,
  sucursal_id     bigint       NULL,
  fecha           date         NOT NULL,
  nombre          varchar(120) NULL,
  cerrado         boolean      NOT NULL DEFAULT false,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  -- La sucursal, si se indica, debe ser del mismo restaurante.
  CONSTRAINT festivo_sucursal_fk FOREIGN KEY (sucursal_id, restaurante_id)
    REFERENCES public.sucursal (id, restaurante_id) ON DELETE CASCADE
);

-- Un festivo por fecha para el restaurante y, aparte, uno por fecha para cada local.
CREATE UNIQUE INDEX ux_festivo_restaurante_fecha
  ON public.festivo (restaurante_id, fecha) WHERE sucursal_id IS NULL;
CREATE UNIQUE INDEX ux_festivo_sucursal_fecha
  ON public.festivo (sucursal_id, fecha) WHERE sucursal_id IS NOT NULL;

COMMENT ON TABLE public.festivo IS
  'Días festivos: se aplica el horario del domingo, o cierre si cerrado = true.';
