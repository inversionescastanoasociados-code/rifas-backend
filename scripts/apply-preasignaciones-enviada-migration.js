/**
 * Aplica migración 021 (columna enviada en boletas_preasignadas).
 *
 *   node scripts/apply-preasignaciones-enviada-migration.js
 *   node scripts/apply-preasignaciones-enviada-migration.js --apply
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sqlPath = path.join(__dirname, 'migrations/021_preasignaciones_enviada.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    const before = await c.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'boletas_preasignadas' AND column_name = 'enviada'
    `);
    console.log('Columna enviada existe:', before.rows.length > 0 ? 'sí' : 'no');
    if (!APPLY) {
      console.log('\nModo preview. Ejecuta con --apply para aplicar.');
      console.log(sql);
      return;
    }
    await c.query(sql);
    const after = await c.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE enviada)::int AS enviadas
      FROM boletas_preasignadas
    `);
    console.log('✅ Migración 021 aplicada.', after.rows[0]);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
