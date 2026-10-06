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

  // ── Migración 9: linea_contacto en notificaciones_recordatorio ──
  try {
    const sqlPath9 = path.join(
      __dirname,
      '../../scripts/migrations/009_notificaciones_linea_contacto.sql'
    );
    const migrationSql9 = fs.readFileSync(sqlPath9, 'utf8');
    await pool.query(migrationSql9);
    logger.info('[Migrations] notificaciones_recordatorio.linea_contacto verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 9:', error.message);
  }

  // ── Migración 10: linea_origen en ventas ──
  try {
    const sqlPath10 = path.join(
      __dirname,
      '../../scripts/migrations/010_ventas_linea_origen.sql'
    );
    const migrationSql10 = fs.readFileSync(sqlPath10, 'utf8');
    await pool.query(migrationSql10);
    logger.info('[Migrations] ventas.linea_origen verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 10:', error.message);
  }

  // ── Migración 11: comprobante de pago único (ventas.referencia_pago / abonos.referencia) ──
  try {
    const sqlPath11 = path.join(
      __dirname,
      '../../scripts/migrations/011_comprobante_pago_unico.sql'
    );
    const migrationSql11 = fs.readFileSync(sqlPath11, 'utf8');
    await pool.query(migrationSql11);
    logger.info('[Migrations] Índices únicos de comprobante de pago verificados');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 11:', error.message);
  }

  // ── Migración 12: comprobante único por (referencia, boleta) en abonos ──
  try {
    const sqlPath12 = path.join(
      __dirname,
      '../../scripts/migrations/012_comprobante_abonos_por_boleta.sql'
    );
    const migrationSql12 = fs.readFileSync(sqlPath12, 'utf8');
    await pool.query(migrationSql12);
    logger.info('[Migrations] Unicidad de comprobante en abonos ajustada por boleta');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 12:', error.message);
  }

  // ── Migración 13: resultado en notificaciones_recordatorio ──
  try {
    const sqlPath13 = path.join(
      __dirname,
      '../../scripts/migrations/013_notificaciones_resultado.sql'
    );
    const migrationSql13 = fs.readFileSync(sqlPath13, 'utf8');
    await pool.query(migrationSql13);
    logger.info('[Migrations] notificaciones_recordatorio.resultado verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 13:', error.message);
  }

  // ── Migración 14: linea_contacto 1-6 en notificaciones ──
  try {
    const sqlPath14 = path.join(
      __dirname,
      '../../scripts/migrations/014_notificaciones_linea_hasta_6.sql'
    );
    const migrationSql14 = fs.readFileSync(sqlPath14, 'utf8');
    await pool.query(migrationSql14);
    logger.info('[Migrations] notificaciones_recordatorio linea 1-6 verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 14:', error.message);
  }

  // ── Migración 15: observacion en notificaciones_recordatorio ──
  try {
    const sqlPath15 = path.join(
      __dirname,
      '../../scripts/migrations/015_notificaciones_observacion.sql'
    );
    const migrationSql15 = fs.readFileSync(sqlPath15, 'utf8');
    await pool.query(migrationSql15);
    logger.info('[Migrations] notificaciones_recordatorio.observacion verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 15:', error.message);
  }

  // ── Migración 16: línea 7 en ventas y notificaciones ──
  try {
    const sqlPath16 = path.join(
      __dirname,
      '../../scripts/migrations/016_ventas_linea_7.sql'
    );
    const migrationSql16 = fs.readFileSync(sqlPath16, 'utf8');
    await pool.query(migrationSql16);
    logger.info('[Migrations] ventas/notificaciones línea 7 verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 16:', error.message);
  }

  // ── Migración 17: etiqueta devolución en boletas ──
  try {
    const sqlPath17 = path.join(
      __dirname,
      '../../scripts/migrations/017_boletas_devolucion.sql'
    );
    const migrationSql17 = fs.readFileSync(sqlPath17, 'utf8');
    await pool.query(migrationSql17);
    logger.info('[Migrations] boletas.es_devolucion verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 17:', error.message);
  }

  // ── Migración 18: historial devolución (conservar devolucion_en) ──
  try {
    const sqlPath18 = path.join(
      __dirname,
      '../../scripts/migrations/018_boletas_devolucion_historial.sql'
    );
    const migrationSql18 = fs.readFileSync(sqlPath18, 'utf8');
    await pool.query(migrationSql18);
    logger.info('[Migrations] trigger devolución historial verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 18:', error.message);
  }

  // ── Migración 19: linea_origen en abonos ──
  try {
    const sqlPath19 = path.join(
      __dirname,
      '../../scripts/migrations/019_abonos_linea_origen.sql'
    );
    const migrationSql19 = fs.readFileSync(sqlPath19, 'utf8');
    await pool.query(migrationSql19);
    logger.info('[Migrations] abonos.linea_origen verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 19:', error.message);
  }

  // ── Migración 20: medio Cuenta extranjero ──
  try {
    const sqlPath20 = path.join(
      __dirname,
      '../../scripts/migrations/020_medio_pago_cuenta_extranjero.sql'
    );
    const migrationSql20 = fs.readFileSync(sqlPath20, 'utf8');
    await pool.query(migrationSql20);
    logger.info('[Migrations] medios_pago Cuenta extranjero verificado');
  } catch (error) {
    logger.warn('[Migrations] Error en migración 20:', error.message);
  }
}

module.exports = { runMigrations };
