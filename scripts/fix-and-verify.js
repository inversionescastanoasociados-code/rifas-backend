const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Corregir CUALQUIER boleta con bloqueo incorrecto
  const fix = await pool.query(`
    UPDATE boletas 
    SET bloqueo_hasta = '2026-06-21T04:59:59.000Z'::timestamptz,
        updated_at = CURRENT_TIMESTAMP
    WHERE bloqueo_hasta IS NOT NULL
      AND cliente_id IS NOT NULL
      AND bloqueo_hasta != '2026-06-21T04:59:59.000Z'::timestamptz
      AND bloqueo_hasta > NOW()
    RETURNING numero, estado, bloqueo_hasta
  `);
  
  console.log('Corregidas:', fix.rows.length);
  for (const b of fix.rows) {
    const bl = new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    console.log('  #' + String(b.numero).padStart(4,'0'), b.estado, '->', bl);
  }
  
  // Verificar
  const check = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE bloqueo_hasta = '2026-06-21T04:59:59.000Z'::timestamptz) as correctas
    FROM boletas
    WHERE bloqueo_hasta IS NOT NULL AND cliente_id IS NOT NULL AND bloqueo_hasta > NOW()
  `);
  console.log('Total:', check.rows[0].total, '| Correctas:', check.rows[0].correctas);
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
