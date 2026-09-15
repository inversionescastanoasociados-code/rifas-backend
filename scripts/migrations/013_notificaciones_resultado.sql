-- Columna nueva solo para intentos futuros; filas existentes quedan con resultado NULL (sin backfill).
ALTER TABLE notificaciones_recordatorio
  ADD COLUMN IF NOT EXISTS resultado VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notificaciones_recordatorio_resultado_check'
  ) THEN
    ALTER TABLE notificaciones_recordatorio
      ADD CONSTRAINT notificaciones_recordatorio_resultado_check
      CHECK (resultado IS NULL OR resultado IN ('CONTACTADO', 'NO_CONTESTO'));
  END IF;
END $$;
