/**
 * Script para crear la usuaria SARA con rol VENDEDOR
 * 
 * Ejecutar desde la carpeta rifas-backend-main:
 *   node scripts/create-vendedor-sara.js
 */

require('dotenv').config()
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

const BCRYPT_ROUNDS = 12

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'rifas',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  })

  const email = 'sara@rifas.com'
  const password = 'SARA123'
  const nombre = 'Sara'
  const rol = 'VENDEDOR'

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    const result = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, activo)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         nombre = EXCLUDED.nombre,
         rol = EXCLUDED.rol,
         activo = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, email, nombre, rol, activo`,
      [email, passwordHash, nombre, rol]
    )

    console.log('✅ Usuario vendedor creado/actualizado:')
    console.log(result.rows[0])
  } catch (err) {
    console.error('❌ Error creando usuario:', err.message)
  } finally {
    await pool.end()
  }
}

main()
