-- Migración 11: comprobante de pago único (PSE/transferencia)
-- Las columnas ventas.referencia_pago y abonos.referencia YA EXISTEN en el esquema
-- (ver database-schema.sql). Esta migración solo agrega índices únicos parciales
-- para impedir que el mismo número de comprobante se reutilice, sin tocar datos
-- existentes (los NULL/valores vacíos quedan excluidos y no generan conflicto).

CREATE UNIQUE INDEX IF NOT EXISTS idx_ventas_referencia_pago_unique
  ON ventas (referencia_pago)
  WHERE referencia_pago IS NOT NULL AND btrim(referencia_pago) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_abonos_referencia_unique
  ON abonos (referencia)
  WHERE referencia IS NOT NULL AND btrim(referencia) <> '';
