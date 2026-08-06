-- Migración 12: corregir la unicidad del comprobante en abonos.
--
-- La migración 011 creó un índice único sobre abonos.referencia, pero un solo
-- pago (un solo comprobante) genera UN ABONO POR CADA BOLETA de la venta, así
-- que ese índice rompía cualquier abono de una venta con 2 o más boletas.
--
-- La unicidad correcta es por (referencia, boleta_id): el mismo comprobante
-- puede repartirse entre las boletas de un mismo pago, pero no puede aplicarse
-- dos veces a la misma boleta. La reutilización del comprobante en otro pago
-- se sigue bloqueando en la aplicación (verificarComprobanteUnico), y
-- ventas.referencia_pago conserva su índice único de la migración 011.

DROP INDEX IF EXISTS idx_abonos_referencia_unique;

-- Mismo problema con el índice histórico uq_abonos_venta_referencia
-- (venta_id, referencia): todos los abonos de un mismo pago comparten venta y
-- comprobante, así que impide repartir un pago entre las boletas de la venta.
-- Nunca estorbó antes porque abonos.referencia siempre estaba en NULL.
-- Ningún código lo usa (no hay ON CONFLICT ni llaves foráneas sobre él).
DROP INDEX IF EXISTS uq_abonos_venta_referencia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abonos_referencia_boleta_unique
  ON abonos (referencia, boleta_id)
  WHERE referencia IS NOT NULL AND btrim(referencia) <> '';

-- Índice de apoyo para las búsquedas de comprobante existente.
CREATE INDEX IF NOT EXISTS idx_abonos_referencia_lookup
  ON abonos (referencia)
  WHERE referencia IS NOT NULL AND btrim(referencia) <> '';
