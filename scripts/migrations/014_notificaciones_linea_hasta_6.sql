-- Permitir línea 6 en notificaciones (alineado con ventas.linea_origen)
ALTER TABLE notificaciones_recordatorio
  DROP CONSTRAINT IF EXISTS notificaciones_recordatorio_linea_contacto_check;

ALTER TABLE notificaciones_recordatorio
  ADD CONSTRAINT notificaciones_recordatorio_linea_contacto_check
  CHECK (linea_contacto IS NULL OR (linea_contacto >= 1 AND linea_contacto <= 6));
