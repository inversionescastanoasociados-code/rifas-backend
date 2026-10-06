-- Migración 021: marcar preasignaciones como notificación enviada al cliente
-- Aditiva e idempotente.

ALTER TABLE boletas_preasignadas
  ADD COLUMN IF NOT EXISTS enviada BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN boletas_preasignadas.enviada IS
  'Indica si ya se notificó/envió al cliente la información de sus boletas preasignadas.';

CREATE INDEX IF NOT EXISTS idx_boletas_preasignadas_enviada
  ON boletas_preasignadas (enviada);
