// SQL queries para el módulo de clientes

const createClientesTable = `
  CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    identificacion VARCHAR(50) NOT NULL,
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT clientes_email_key UNIQUE (email),
    CONSTRAINT clientes_telefono_key UNIQUE (telefono),
    CONSTRAINT clientes_identificacion_key UNIQUE (identificacion)
  );
`;

const createIndexes = `
  CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes USING gin (nombre gin_trgm_ops);
  CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes (telefono);
  CREATE INDEX IF NOT EXISTS idx_clientes_identificacion ON clientes (identificacion);
  CREATE INDEX IF NOT EXISTS idx_clientes_created_at ON clientes (created_at);
`;

const createTrigger = `
  CREATE OR REPLACE FUNCTION update_clientes_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ language 'plpgsql';
  
  DROP TRIGGER IF EXISTS update_clientes_updated_at ON clientes;
  CREATE TRIGGER update_clientes_updated_at
    BEFORE UPDATE ON clientes
    FOR EACH ROW
    EXECUTE FUNCTION update_clientes_updated_at();
`;

module.exports = {
  createClientesTable,
  createIndexes,
  createTrigger
};
