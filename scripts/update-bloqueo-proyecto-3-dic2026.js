/**
 * Actualiza bloqueo_hasta al 23-dic-2026 23:59:59 COT en boletas asignadas de la rifa Proyecto 3.
 *
 * Uso:
 *   DATABASE_URL="..." node scripts/update-bloqueo-proyecto-3-dic2026.js
 *   DATABASE_URL="..." node scripts/update-bloqueo-proyecto-3-dic2026.js --apply
 */
const { Pool } = require('pg');
const { esRifaProyecto3, PROYECTO_3_BLOQUEO_UTC } = require('../src/utils/rifaBloqueoHasta');

const DATABASE_URL = process.env.DATABASE_URL;
const APPLY = process.argv.includes('--apply');
const RIFA_ID = process.env.RIFA_PROYECTO_3_ID || null;

if (!DATABASE_URL) {
  console.error('Falta DATABASE_URL');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    const rifas = await client.query(
      `SELECT id, nombre, estado FROM rifas ORDER BY created_at DESC`
    );
    const targets = rifas.rows.filter(
      (r) => (RIFA_ID && r.id === RIFA_ID) || esRifaProyecto3(r)
    );

    if (targets.length === 0) {
      console.log('No se encontró rifa Proyecto 3. Define RIFA_PROYECTO_3_ID o usa nombre "Proyecto 3".');
      return;
    }

    console.log('Rifas objetivo:', targets.map((r) => `${r.nombre} (${r.id})`).join(', '));
    console.log('Nuevo bloqueo UTC:', PROYECTO_3_BLOQUEO_UTC.toISOString());

    for (const rifa of targets) {
      const preview = await client.query(
        `SELECT estado, COUNT(*)::int AS n
         FROM boletas
         WHERE rifa_id = $1 AND cliente_id IS NOT NULL
         GROUP BY estado`,
        [rifa.id]
      );
      console.log(`\n[${rifa.nombre}] boletas con cliente:`, preview.rows);

      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM boletas
         WHERE rifa_id = $1 AND cliente_id IS NOT NULL`,
        [rifa.id]
      );
      const n = countRes.rows[0].n;

      if (!APPLY) {
        console.log(`Preview: se actualizarían ${n} boletas (usa --apply para ejecutar).`);
        continue;
      }

      await client.query('BEGIN');
      const upd = await client.query(
        `UPDATE boletas
         SET bloqueo_hasta = $1, updated_at = CURRENT_TIMESTAMP
         WHERE rifa_id = $2 AND cliente_id IS NOT NULL`,
        [PROYECTO_3_BLOQUEO_UTC, rifa.id]
      );
      await client.query('COMMIT');
      console.log(`✅ Actualizadas ${upd.rowCount} boletas.`);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
