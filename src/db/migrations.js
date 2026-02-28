const { pool } = require('./pool');
const logger = require('../utils/logger');

/**
 * Ejecutar migraciones pendientes al iniciar el servidor.
 * Cada migración se ejecuta una sola vez (idempotente).
 */
async function runMigrations() {
  try {
    // ── Migración 1: Agregar 'SIN_REVISAR' al ENUM estado_venta ──
    await pool.query(`
      ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'SIN_REVISAR' BEFORE 'PENDIENTE'
    `);
    logger.info('[Migrations] ENUM estado_venta actualizado con SIN_REVISAR');

  } catch (error) {
    logger.warn('[Migrations] Error en migración 1:', error.message);
  }

  // ── Migración 2: Quitar UNIQUE de email y telefono en clientes ──
  // Solo identificacion debe ser único. Email y teléfono pueden repetirse.
  try {
    await pool.query(`
      ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_email_key;
      ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_telefono_key;
    `);
    logger.info('[Migrations] UNIQUE constraints removidos de email y telefono en clientes');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 2 (puede ser normal si ya se aplicó):', error.message);
  }

  // ── Migración 3: Hacer email y telefono nullable en clientes ──
  try {
    await pool.query(`
      ALTER TABLE clientes ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE clientes ALTER COLUMN identificacion DROP NOT NULL;
    `);
    logger.info('[Migrations] Columnas email e identificacion ahora son nullable');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 3:', error.message);
  }
}

module.exports = { runMigrations };
