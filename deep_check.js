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
        v.estado_venta,
        v.monto_total,
        v.abono_total,
        c.nombre as cliente_nombre,
        c.identificacion as cliente_cedula,
        b.numero as boleta_numero,
        r.nombre as rifa_nombre,
        mp.nombre as mp_raw_nombre
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN boletas b ON a.boleta_id = b.id
      WHERE r.nombre = $1
        AND a.created_at >= $2
        AND a.created_at <= $3
      ORDER BY a.created_at ASC;
    `;

    const res = await client.query(query, [rifaName, start, end]);
    
    console.log('--- Buscando cualquier abono de 60000 que pueda ser el "Sin metodo" ---');
    
    res.rows.forEach(row => {
        const metodoCalculado = (row.mp_raw_nombre || '').trim() || (row.gateway_pago || '').trim() || 'SIN_GATEWAY';
        if (parseFloat(row.monto) === 60000) {
             console.log(`ID: ${row.abono_id} | Monto: ${row.monto} | Metodo Calc: ${metodoCalculado} | MP: ${row.mp_raw_nombre} | GW: ${row.gateway_pago} | Cliente: ${row.cliente_nombre}`);
        }
    });

    // Validar si existe alguno con MP_ID pero sin nombre en medios_pago que de 60000
    const suspects = res.rows.filter(row => parseFloat(row.monto) === 60000 && (!row.mp_raw_nombre && !row.gateway_pago));
    if (suspects.length > 0) {
        console.log('\n--- SOSPECHOSOS (Sin MP nombre y sin Gateway) ---');
        console.log(JSON.stringify(suspects, null, 2));
    } else {
        console.log('\nNo hay abonos de 60000 con MP Y GW nulos simultaneamente.');
    }

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
