-- Conservar devolucion_en como historial; al reasignar solo se quita la etiqueta activa.
CREATE OR REPLACE FUNCTION boletas_clear_devolucion_on_assign()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cliente_id IS NOT NULL
     AND (OLD.cliente_id IS DISTINCT FROM NEW.cliente_id OR OLD.estado = 'DISPONIBLE') THEN
    NEW.es_devolucion := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_boletas_devolucion_historial
  ON boletas (devolucion_en DESC)
  WHERE devolucion_en IS NOT NULL;
