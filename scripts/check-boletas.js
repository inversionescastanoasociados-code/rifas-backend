const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const res = await pool.query(`
    SELECT b.numero, b.estado, b.bloqueo_hasta, 
           c.nombre as cliente, c.identificacion
    FROM boletas b
    LEFT JOIN clientes c ON b.cliente_id = c.id
    WHERE b.estado = 'RESERVADA' AND b.bloqueo_hasta IS NOT NULL
    ORDER BY b.numero
  `);
  
  console.log('=== TODAS LAS BOLETAS RESERVADAS ===');
  console.log('Total:', res.rows.length);
  let malas = 0;
  for (const b of res.rows) {
    const bl = new Date(b.bloqueo_hasta);
    const blCOT = bl.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const esCorrecta = blCOT.includes('20/6/2026');
    const marca = esCorrecta ? 'OK' : 'MAL';
    if (marca === 'MAL') malas++;
    console.log('  ' + marca + ' #' + String(b.numero).padStart(4,'0') + ' | ' + blCOT + ' | ' + (b.cliente || 'SIN CLIENTE') + ' | CC: ' + (b.identificacion || 'N/A'));
  }
  console.log('');
  console.log('Correctas (20/06):', res.rows.length - malas);
  console.log('Incorrectas:', malas);
  
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
