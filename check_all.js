const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const rifaName = 'EL GRAN CAMION';
    const targetDate = '2026-04-20';
    const start = `${targetDate} 00:00:00`;
    const end = `${targetDate} 23:59:59.999`;

    const query = `
      SELECT 
        a.id as abono_id, 
        a.created_at, 
        a.monto, 
        a.venta_id, 
        a.boleta_id, 
        a.medio_pago_id, 
        a.gateway_pago, 
        mp.nombre as mp_nombre,
        a.estado,
        r.nombre as rifa_nombre,
        COALESCE(NULLIF(BTRIM(mp.nombre), ''), NULLIF(BTRIM(a.gateway_pago), ''), 'SIN_GATEWAY') as metodo_calculado
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE r.nombre = $1
        AND a.created_at >= $2
        AND a.created_at <= $3
      ORDER BY a.created_at ASC;
    `;

    const res = await client.query(query, [rifaName, start, end]);
    
    console.log('--- Resumen de abonos del dia (incluyendo NO CONFIRMADOS) ---');
    const logs = res.rows.map(row => ({
        id: row.abono_id,
        monto: row.monto,
        estado: row.estado,
        metodo: row.metodo_calculado,
        mp_id: row.medio_pago_id,
        gateway: row.gateway_pago
    }));
    console.table(logs);

    const sinMetodoTotal = res.rows
        .filter(row => row.estado === 'CONFIRMADO' && row.metodo_calculado === 'SIN_GATEWAY')
        .reduce((sum, row) => sum + parseFloat(row.monto), 0);
    
    console.log(`\nTotal CONFIRMADO bajo "SIN_GATEWAY": ${sinMetodoTotal}`);

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
