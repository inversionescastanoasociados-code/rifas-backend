-- =============================================================================
-- Migración 007: boletas_preasignadas
-- Permite guardar, por adelantado, qué número de boleta le corresponde a qué
-- cliente para la PRÓXIMA rifa (clientes fijos que siempre piden el mismo
-- número). No depende de una rifa concreta: solo cliente + número.
--
-- Es 100% ADITIVA: solo crea una tabla nueva. No modifica ninguna tabla,
-- columna, trigger ni dato existente.
-- Idempotente: usa IF NOT EXISTS, se puede ejecutar más de una vez sin riesgo.
-- =============================================================================

CREATE TABLE IF NOT EXISTS boletas_preasignadas (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  numero_boleta SMALLINT NOT NULL,
  notas TEXT,
  creado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ultima_aplicacion_rifa_id UUID REFERENCES rifas(id) ON DELETE SET NULL,
  ultima_aplicacion_venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  ultima_aplicacion_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT boletas_preasignadas_numero_check CHECK (numero_boleta >= 0 AND numero_boleta <= 9999),
  CONSTRAINT boletas_preasignadas_numero_unique UNIQUE (numero_boleta)
);

CREATE INDEX IF NOT EXISTS idx_boletas_preasignadas_cliente
  ON boletas_preasignadas (cliente_id);

COMMENT ON TABLE boletas_preasignadas IS
  'Preferencias de número de boleta por cliente para futuras rifas. Se aplican manualmente a una rifa concreta mediante el módulo de preasignaciones (crea una reserva formal, no una venta pagada).';
