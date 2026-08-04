-- Vincular contactos de recordatorio a la rifa activa (no arrastrar entre proyectos).
ALTER TABLE notificaciones_recordatorio
  ADD COLUMN IF NOT EXISTS rifa_id UUID REFERENCES rifas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notif_recordatorio_rifa_cliente
  ON notificaciones_recordatorio (cliente_id, rifa_id);
