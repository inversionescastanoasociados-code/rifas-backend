-- Notas opcionales al marcar Notificado / No contestó; filas existentes quedan NULL (sin backfill).
ALTER TABLE notificaciones_recordatorio
  ADD COLUMN IF NOT EXISTS observacion TEXT;
