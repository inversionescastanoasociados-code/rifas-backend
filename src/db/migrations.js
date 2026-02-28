const { pool } = require('./pool');
const logger = require('../utils/logger');

/**
 * Ejecutar migraciones pendientes al iniciar el servidor.
 * Cada migración se ejecuta una sola vez (idempotente).
 */
async function runMigrations() {
  try {
    // ── Migración 1: Agregar 'SIN_REVISAR' al ENUM estado_venta ──
    // ALTER TYPE ... ADD VALUE es idempotente con IF NOT EXISTS (PG 9.3+)
    await pool.query(`
      ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'SIN_REVISAR' BEFORE 'PENDIENTE'
    `);
    logger.info('[Migrations] ENUM estado_venta actualizado con SIN_REVISAR');

  } catch (error) {
    // Si falla por cualquier razón, logear pero NO detener el servidor
    logger.warn('[Migrations] Error ejecutando migraciones (puede ser normal si ya se aplicaron):', error.message);
  }
}

module.exports = { runMigrations };
