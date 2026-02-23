// SQL queries for authentication module

const createUsersTable = `
  CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    rol VARCHAR(50) DEFAULT 'vendedor' CHECK (rol IN ('admin', 'vendedor')),
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP
  );
`;

const createAdminUser = `
  INSERT INTO usuarios (email, password, nombre, rol, activo) 
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (email) DO NOTHING;
`;

module.exports = {
  createUsersTable,
  createAdminUser
};
