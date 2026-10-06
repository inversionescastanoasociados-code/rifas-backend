-- Línea / pista donde se registró cada abono (independiente de la venta inicial).
ALTER TABLE abonos
  ADD COLUMN IF NOT EXISTS linea_origen VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'abonos_linea_origen_check'
  ) THEN
    ALTER TABLE abonos
      ADD CONSTRAINT abonos_linea_origen_check
      CHECK (
        linea_origen IS NULL
        OR linea_origen IN ('1', '2', '3', '4', '5', '6', '7', 'PISTA')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_abonos_linea_origen ON abonos (linea_origen)
  WHERE linea_origen IS NOT NULL;
