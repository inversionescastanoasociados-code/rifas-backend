const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Verificar: todas deben tener bloqueo_hasta = 2026-06-21T04:59:59.000Z (= 20/06 23:59:59 COT)
  const res = await pool.query(`
    SELECT numero, estado, bloqueo_hasta,
           bloqueo_hasta = '2026-06-21T04:59:59.000Z'::timestamptz as es_correcta
    FROM boletas
    WHERE bloqueo_hasta IS NOT NULL AND cliente_id IS NOT NULL AND bloqueo_hasta > NOW()
    ORDER BY numero
  `);
  
  let ok = 0, mal = 0;
  for (const b of res.rows) {
    if (b.es_correcta) { ok++; } 
    else {
      mal++;
      console.log('  MAL #' + String(b.numero).padStart(4,'0'), '| bloqueo_hasta:', new Date(b.bloqueo_hasta).toISOString());
    }
  }
  console.log('');
  console.log('Total boletas:', res.rows.length);
  console.log('Correctas:', ok);
  console.log('Incorrectas:', mal);
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
