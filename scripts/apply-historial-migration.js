#!/usr/bin/env node
/**
 * Aplica migración 005 (historial_movimientos) con verificación previa.
 *
 * Uso:
 *   DATABASE_URL="..." node scripts/apply-historial-migration.js --dry-run
 *   DATABASE_URL="..." node scripts/apply-historial-migration.js --apply
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

if (!dryRun && !apply) {
  console.error('Indica --dry-run o --apply');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL.replace(/\?.*$/, ''),
  ssl: { rejectUnauthorized: false },
});

const sqlPath = path.join(__dirname, 'migrations', '005_historial_movimientos.sql');
const migrationSql = fs.readFileSync(sqlPath, 'utf8');

async function checkExisting() {
  const { rows } = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'historial_movimientos'
    ) AS existe
  `);
  return rows[0].existe;
}

async function listTriggers() {
  const { rows } = await pool.query(`
    SELECT tgname, relname AS tabla
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal
      AND tgname LIKE 'historial_%'
    ORDER BY relname, tgname
  `);
  return rows;
}

async function main() {
  console.log('=== Migración historial_movimientos ===');
  console.log('Modo:', dryRun ? 'DRY-RUN (solo lectura)' : 'APPLY');

  const existe = await checkExisting();
  console.log('Tabla historial_movimientos existe:', existe);

  const triggers = await listTriggers();
  console.log('Triggers historial actuales:', triggers.length);
  triggers.forEach((t) => console.log(`  - ${t.tabla}.${t.tgname}`));

  if (dryRun) {
    console.log('\nSQL a ejecutar:', sqlPath);
    console.log('Líneas:', migrationSql.split('\n').length);
    console.log('\nDry-run OK. Usa --apply para aplicar.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');
    console.log('\nMigración aplicada correctamente.');

    const postTriggers = await listTriggers();
    console.log('Triggers historial después:', postTriggers.length);
    postTriggers.forEach((t) => console.log(`  - ${t.tabla}.${t.tgname}`));

    const count = await pool.query('SELECT COUNT(*)::int AS n FROM historial_movimientos');
    console.log('Registros en historial_movimientos:', count.rows[0].n);
    console.log('\nNota: el historial empieza vacío; solo registra movimientos desde ahora.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR — rollback:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
