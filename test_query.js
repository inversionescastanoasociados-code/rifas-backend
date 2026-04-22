const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const rifaName = 'EL GRAN CAMION';
    
    const query = `
      WITH RifaInfo AS (
        SELECT id FROM rifas WHERE nombre = $1 LIMIT 1
      )
      SELECT 
        COALESCE(NULLIF(BTRIM(mp.nombre), ''), NULLIF(BTRIM(a.gateway_pago), ''), 'SIN_GATEWAY') as metodo,
        COUNT(*) as cantidad,
        SUM(a.monto) as total
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN RifaInfo ri ON v.rifa_id = ri.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE a.estado = 'CONFIRMADO'
      GROUP BY metodo
      ORDER BY total DESC;
    `;

    const res = await client.query(query, [rifaName]);
    console.table(res.rows);

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
