/**
 * Aplica la migración 007: crea la tabla boletas_preasignadas.
 * Es 100% ADITIVA: no modifica ninguna tabla, columna ni dato existente.
 *
 * Uso:
 *   node scripts/run-migration-007-boletas-preasignadas.js          (preview, hace ROLLBACK)
 *   node scripts/run-migration-007-boletas-preasignadas.js --apply  (aplica de verdad, COMMIT)
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const APPLY = process.argv.includes('--apply');
const SQL_PATH = path.join(__dirname, 'migrations', '007_boletas_preasignadas.sql');

async function main() {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const before = await client.query(
      `SELECT to_regclass('public.boletas_preasignadas') AS existe`
    );
    console.log('Antes de migrar, tabla boletas_preasignadas existe:', !!before.rows[0].existe);

    await client.query('BEGIN');
    await client.query(sql);

    const after = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'boletas_preasignadas'
       ORDER BY ordinal_position`
    );
    console.log('\nEstructura resultante de boletas_preasignadas:');
    after.rows.forEach((r) =>
      console.log(`  - ${r.column_name} (${r.data_type}, nullable=${r.is_nullable})`)
    );

    // Verificación de seguridad: confirmar que ninguna otra tabla fue tocada
    // (esto solo comprueba que seguimos dentro de la misma transacción sin error)
    const countCheck = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM clientes) AS clientes,
         (SELECT COUNT(*) FROM ventas) AS ventas,
         (SELECT COUNT(*) FROM boletas) AS boletas`
    );
    console.log('\nConteos de control (no deben verse afectados):', countCheck.rows[0]);

    if (APPLY) {
      await client.query('COMMIT');
      console.log('\n✅ MIGRACIÓN APLICADA. Tabla boletas_preasignadas creada (o ya existía).');
    } else {
      await client.query('ROLLBACK');
      console.log('\n🔍 PREVIEW con ROLLBACK. Ejecuta con --apply para confirmar los cambios.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error aplicando la migración:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
