const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // Corregir TODAS las boletas con bloqueo_hasta que NO sea 20/06/2026 23:59:59 COT
  // y que tengan cliente y bloqueo futuro (no las expiradas sin cliente)
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
  
  console.log('=== BOLETAS CORREGIDAS ===');
  console.log('Total:', fix.rows.length);
  for (const b of fix.rows) {
    const bl = new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    console.log('  #' + String(b.numero).padStart(4,'0'), '| Estado:', b.estado, '| Nuevo bloqueo:', bl);
  }
  
  // Verificacion final: TODAS las boletas con bloqueo_hasta
  console.log('');
  const check = await pool.query(`
    SELECT b.numero, b.estado, b.bloqueo_hasta, c.nombre
    FROM boletas b
    LEFT JOIN clientes c ON b.cliente_id = c.id
    WHERE b.bloqueo_hasta IS NOT NULL AND b.cliente_id IS NOT NULL AND b.bloqueo_hasta > NOW()
    ORDER BY b.numero
  `);
  console.log('=== VERIFICACION: Todas las boletas con bloqueo futuro ===');
  let todas_ok = true;
  for (const b of check.rows) {
    const bl = new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const ok = bl.includes('20/6/2026, 11:59:59 p. m.');
    if (ok === false) todas_ok = false;
    console.log('  ' + (ok ? 'OK' : 'MAL') + ' #' + String(b.numero).padStart(4,'0'), '|', b.estado, '|', bl, '|', b.nombre);
  }
  console.log('');
  console.log(todas_ok ? 'TODAS CORRECTAS' : 'AUN HAY ERRORES');
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
