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
        a.medio_pago_id, 
        a.gateway_pago, 
        mp.nombre as mp_nombre
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE r.nombre = $1
        AND a.estado = 'CONFIRMADO'
        AND a.created_at >= $2
        AND a.created_at <= $3
        AND COALESCE(NULLIF(BTRIM(mp.nombre), ''), NULLIF(BTRIM(a.gateway_pago), ''), 'SIN_GATEWAY') = 'SIN_GATEWAY';
    `;

    const res = await client.query(query, [rifaName, start, end]);
    
    if (res.rows.length > 0) {
        console.log('ENCONTRADOS:');
        console.table(res.rows);
    } else {
        console.log('No hay abonos con SIN_GATEWAY exacto en este rango.');
        
        // Revisar si hay alguno que sume 60000 siendo nulo el mp_nombre pero con mp_id
        const checkNullQuery = `
          SELECT a.id, a.monto, a.medio_pago_id, a.gateway_pago
          FROM abonos a
          JOIN ventas v ON a.venta_id = v.id
          JOIN rifas r ON v.rifa_id = r.id
          LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
          WHERE r.nombre = $1 AND a.estado = 'CONFIRMADO' AND a.created_at >= $2 AND a.created_at <= $3
          AND a.medio_pago_id IS NULL AND a.gateway_pago IS NULL;
        `;
        const res2 = await client.query(checkNullQuery, [rifaName, start, end]);
        console.log('Nulos absolutos:', res2.rows);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
