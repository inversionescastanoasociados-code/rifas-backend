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
        a.id as abono_id, 
        a.created_at, 
        a.monto, 
        a.venta_id, 
        a.boleta_id, 
        a.medio_pago_id, 
        a.gateway_pago, 
        mp.nombre as mp_nombre,
        v.estado_venta,
        v.monto_total,
        v.abono_total,
        c.nombre as cliente_nombre,
        c.identificacion as cliente_cedula,
        b.numero as boleta_numero,
        r.nombre as rifa_nombre,
        a.referencia,
        a.notas,
        COALESCE(NULLIF(BTRIM(mp.nombre), ''), NULLIF(BTRIM(a.gateway_pago), ''), 'SIN_GATEWAY') as metodo_calculado
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN boletas b ON a.boleta_id = b.id
      WHERE r.nombre = 'EL GRAN CAMION'
        AND a.estado = 'CONFIRMADO'
        AND a.created_at >= $1
        AND a.created_at <= $2
        AND a.monto::numeric = 60000;
    `;

    const res = await client.query(query, [start, end]);
    
    // Filtrar abonos que puedan tener inconsistencias en el nombre del medio de pago o gateway
    const results = res.rows.map(row => ({
        id: row.abono_id,
        monto: row.monto,
        metodo: row.metodo_calculado,
        mp_id: row.medio_pago_id,
        mp_nombre: row.mp_nombre,
        gateway: row.gateway_pago,
        cliente: row.cliente_nombre
    }));
    
    console.table(results);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
