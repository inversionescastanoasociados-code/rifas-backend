-- Línea telefónica usada al contactar (1-5). Nullable: registros anteriores no se alteran.
ALTER TABLE notificaciones_recordatorio
  ADD COLUMN IF NOT EXISTS linea_contacto SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notificaciones_recordatorio_linea_contacto_check'
  ) THEN
    ALTER TABLE notificaciones_recordatorio
      ADD CONSTRAINT notificaciones_recordatorio_linea_contacto_check
      CHECK (linea_contacto IS NULL OR (linea_contacto >= 1 AND linea_contacto <= 5));
  END IF;
END $$;
