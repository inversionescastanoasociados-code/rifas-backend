-- Origen de la venta/reserva: línea telefónica (1-6) o pista (físico). Nullable para ventas anteriores.
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS linea_origen VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_linea_origen_check'
  ) THEN
    ALTER TABLE ventas
      ADD CONSTRAINT ventas_linea_origen_check
      CHECK (linea_origen IS NULL OR linea_origen IN ('1', '2', '3', '4', '5', '6', 'PISTA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ventas_linea_origen ON ventas (linea_origen)
  WHERE linea_origen IS NOT NULL;
