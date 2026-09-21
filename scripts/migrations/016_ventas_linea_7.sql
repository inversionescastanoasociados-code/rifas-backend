-- Línea telefónica 7 en origen de venta y en notificaciones (sin modificar filas existentes).
ALTER TABLE ventas
  DROP CONSTRAINT IF EXISTS ventas_linea_origen_check;

ALTER TABLE ventas
  ADD CONSTRAINT ventas_linea_origen_check
  CHECK (
    linea_origen IS NULL
    OR linea_origen IN ('1', '2', '3', '4', '5', '6', '7', 'PISTA')
  );

ALTER TABLE notificaciones_recordatorio
  DROP CONSTRAINT IF EXISTS notificaciones_recordatorio_linea_contacto_check;

ALTER TABLE notificaciones_recordatorio
  ADD CONSTRAINT notificaciones_recordatorio_linea_contacto_check
  CHECK (linea_contacto IS NULL OR (linea_contacto >= 1 AND linea_contacto <= 7));
