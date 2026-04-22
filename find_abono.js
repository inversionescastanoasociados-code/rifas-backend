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
        mp.nombre as medio_pago_nombre, 
        a.referencia, 
        a.notas, 
        v.estado_venta, 
        v.monto_total as venta_monto_total, 
        v.abono_total as venta_abono_total, 
        c.nombre as cliente_nombre, 
        c.identificacion as cliente_cedula, 
        b.numero as boleta_numero, 
        r.nombre as rifa_nombre,
        COALESCE(NULLIF(BTRIM(mp.nombre), ''), NULLIF(BTRIM(a.gateway_pago), ''), 'SIN_GATEWAY') as metodo_calculado
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN boletas b ON a.boleta_id = b.id
      WHERE r.nombre = $1
        AND a.estado = 'CONFIRMADO'
        AND a.created_at >= $2
        AND a.created_at <= $3
      ORDER BY a.created_at ASC;
    `;

    const res = await client.query(query, [rifaName, start, end]);
    
    console.log('--- Todos los abonos del dia para la rifa ---');
    console.table(res.rows.map(row => ({
        id: row.abono_id,
        monto: row.monto,
        metodo: row.metodo_calculado,
        cliente: row.cliente_nombre,
        boleta: row.boleta_numero
    })));

    const matching = res.rows.filter(row => row.metodo_calculado === 'SIN_GATEWAY' && parseFloat(row.monto) === 60000);
    
    if (matching.length > 0) {
        console.log('\n--- Coincidencias encontradas (SIN_GATEWAY + $60,000) ---');
        console.log(JSON.stringify(matching, null, 2));
    } else {
        console.log('\nNo se encontro abono exacto con "SIN_GATEWAY" y $60,000');
    }

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
