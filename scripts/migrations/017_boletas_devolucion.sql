-- Etiqueta de devolución al liberar boletas (filas existentes: es_devolucion = false, sin backfill).
ALTER TABLE boletas
  ADD COLUMN IF NOT EXISTS es_devolucion BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE boletas
  ADD COLUMN IF NOT EXISTS devolucion_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_boletas_devolucion_disponibles
  ON boletas (devolucion_en DESC)
  WHERE es_devolucion = true AND estado = 'DISPONIBLE';

CREATE OR REPLACE FUNCTION boletas_clear_devolucion_on_assign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL
     AND (OLD.cliente_id IS DISTINCT FROM NEW.cliente_id OR OLD.estado = 'DISPONIBLE') THEN
    NEW.es_devolucion := false;
    NEW.devolucion_en := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_boletas_clear_devolucion ON boletas;
CREATE TRIGGER trg_boletas_clear_devolucion
  BEFORE UPDATE ON boletas
  FOR EACH ROW
  EXECUTE PROCEDURE boletas_clear_devolucion_on_assign();
