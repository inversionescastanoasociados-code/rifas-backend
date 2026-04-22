const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const targetDate = '2026-04-20';
    const start = `${targetDate} 00:00:00`;
    const end = `${targetDate} 23:59:59.999`;

    const query = `
      SELECT 
        a.id as abono_id, a.monto, a.gateway_pago, mp.nombre as mp_nombre
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE r.nombre = 'EL GRAN CAMION'
        AND a.estado = 'CONFIRMADO'
        AND a.created_at >= $1
        AND a.created_at <= $2;
    `;

    const res = await client.query(query, [start, end]);
    
    let totalPSE = 0;
    let totalEfectivo = 0;
    let totalSinMetodo = 0;
    
    res.rows.forEach(row => {
        // Simular lógica de analytics típica
        if (row.gateway_pago === 'PSE') totalPSE += parseFloat(row.monto);
        else if (row.gateway_pago === 'Efectivo') totalEfectivo += parseFloat(row.monto);
        else totalSinMetodo += parseFloat(row.monto);
    });

    console.log(`Simulacion por Gateway: PSE: ${totalPSE}, Efectivo: ${totalEfectivo}, SinMetodo: ${totalSinMetodo}`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
