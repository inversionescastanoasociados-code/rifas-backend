/**
 * Crear usuario ADMIN 5 (solo INSERT/UPSERT del usuario, no toca otros datos).
 *
 *   DATABASE_URL=... node scripts/create-admin5.js
 */

require('dotenv').config()
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')

const BCRYPT_ROUNDS = 12

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no configurada')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  const email = 'admin5@rifas.com'
  const password = 'admin12345'
  const nombre = 'Admin 5'
  const rol = 'ADMIN'

  try {
    const existing = await pool.query(
      'SELECT id, email, rol FROM usuarios WHERE LOWER(email) = LOWER($1)',
      [email]
    )
    if (existing.rows.length > 0) {
      console.log('ℹ️  El usuario ya existe:', existing.rows[0])
      process.exit(0)
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const result = await pool.query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, activo)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, email, nombre, rol, activo`,
      [email, passwordHash, nombre, rol]
    )

    console.log('✅ Admin creado:')
    console.log(result.rows[0])
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
