const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const abonoId = 'a493deb8-e803-4f51-ac27-363e7f496eac';

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
        v.monto_total as venta_monto_total,
        v.abono_total as venta_abono_total,
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
      WHERE a.id = $1;
    `;

    const res = await client.query(query, [abonoId]);
    console.log(JSON.stringify(res.rows[0], null, 2));

  } catch (err) {
    console.error('Error executing query', err.stack);
  } finally {
    await client.end();
  }
}

run();
