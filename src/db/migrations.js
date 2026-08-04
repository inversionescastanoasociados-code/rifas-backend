const fs = require('fs');
const path = require('path');
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

  // ── Migración 4: Crear tabla notificaciones_recordatorio ──
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificaciones_recordatorio (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        notificado_por UUID REFERENCES usuarios(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notif_recordatorio_cliente 
        ON notificaciones_recordatorio(cliente_id);
    `);
    logger.info('[Migrations] Tabla notificaciones_recordatorio creada/verificada');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 4:', error.message);
  }

  // ── Migración 5: historial_movimientos (auditoría append-only) ──
  try {
    const sqlPath = path.join(
      __dirname,
      '../../scripts/migrations/005_historial_movimientos.sql'
    );
    const migrationSql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(migrationSql);
    logger.info('[Migrations] historial_movimientos y triggers verificados');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 5:', error.message);
  }

  // ── Migración 6: historial con usuario que realizó la acción ──
  try {
    const sqlPath6 = path.join(
      __dirname,
      '../../scripts/migrations/006_historial_usuario.sql'
    );
    const migrationSql6 = fs.readFileSync(sqlPath6, 'utf8');
    await pool.query(migrationSql6);
    logger.info('[Migrations] historial usuario/responsable verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 6:', error.message);
  }

  // ── Migración 8: rifa_id en notificaciones_recordatorio ──
  try {
    const sqlPath8 = path.join(
      __dirname,
      '../../scripts/migrations/008_notificaciones_recordatorio_rifa.sql'
    );
    const migrationSql8 = fs.readFileSync(sqlPath8, 'utf8');
    await pool.query(migrationSql8);
    logger.info('[Migrations] notificaciones_recordatorio.rifa_id verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 8:', error.message);
  }
}

module.exports = { runMigrations };
