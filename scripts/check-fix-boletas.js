const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  // 1. Buscar la boleta 2511 en cualquier estado
  const b2511 = await pool.query(`
    SELECT b.numero, b.estado, b.bloqueo_hasta, b.venta_id, b.cliente_id,
           c.nombre, c.identificacion
    FROM boletas b
    LEFT JOIN clientes c ON b.cliente_id = c.id
    WHERE b.numero = 2511
  `);
  console.log('=== BOLETA #2511 ===');
  for (const b of b2511.rows) {
    const bl = b.bloqueo_hasta ? new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'N/A';
    console.log('  Estado:', b.estado, '| Bloqueo:', bl, '| Cliente:', b.nombre || 'N/A', '| CC:', b.identificacion || 'N/A');
  }

  // 2. Buscar YEIRON ANDRES BENJUMEA
  const yeiron = await pool.query(`
    SELECT b.numero, b.estado, b.bloqueo_hasta, c.nombre, c.identificacion
    FROM boletas b
    JOIN clientes c ON b.cliente_id = c.id
    WHERE c.identificacion = '1221713364' OR c.nombre ILIKE '%YEIRON%' OR c.nombre ILIKE '%BENJUMEA%'
    ORDER BY b.numero
  `);
  console.log('');
  console.log('=== BOLETAS DE YEIRON ANDRES BENJUMEA ===');
  for (const b of yeiron.rows) {
    const bl = b.bloqueo_hasta ? new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'N/A';
    console.log('  #' + String(b.numero).padStart(4,'0'), '| Estado:', b.estado, '| Bloqueo:', bl);
  }

  // 3. Corregir la boleta #0427 que tiene fecha incorrecta
  console.log('');
  console.log('=== CORRIGIENDO BOLETA #0427 ===');
  const fix = await pool.query(`
    UPDATE boletas 
    SET bloqueo_hasta = '2026-06-21T04:59:59.000Z'::timestamptz,
        updated_at = CURRENT_TIMESTAMP
    WHERE estado = 'RESERVADA' 
      AND bloqueo_hasta IS NOT NULL
      AND bloqueo_hasta != '2026-06-21T04:59:59.000Z'::timestamptz
      AND cliente_id IS NOT NULL
    RETURNING numero, bloqueo_hasta
  `);
  for (const b of fix.rows) {
    const bl = new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    console.log('  Corregida #' + String(b.numero).padStart(4,'0'), '->', bl);
  }
  if (fix.rows.length === 0) console.log('  Ninguna boleta necesitaba corrección adicional');
  
  console.log('');
  console.log('DONE');
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
