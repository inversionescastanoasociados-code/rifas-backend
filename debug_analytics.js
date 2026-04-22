const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const rifaRes = await client.query("SELECT id, nombre FROM rifas WHERE nombre = 'EL GRAN CAMION'");
    if (rifaRes.rows.length === 0) {
      console.log("Rifa 'EL GRAN CAMION' no encontrada.");
      return;
    }
    const rifaId = rifaRes.rows[0].id;
    console.log("Rifa ID:", rifaId);

    const query = `
      SELECT 
        a.id, 
        a.created_at, 
        a.monto, 
        a.venta_id, 
        a.boleta_id, 
        a.medio_pago_id, 
        a.gateway_pago, 
        a.referencia, 
        a.notas,
        mp.nombre as medio_pago_nombre,
        c.nombre as cliente_nombre,
        c.identificacion as cliente_identificacion,
        v.estado_venta,
        v.monto_total as venta_monto_total,
        v.abono_total as venta_abono_total,
        b.numero as boleta_numero,
        r.nombre as rifa_nombre
      FROM abonos a
      JOIN ventas v ON a.venta_id = v.id
      JOIN rifas r ON v.rifa_id = r.id
      LEFT JOIN clientes c ON v.cliente_id = c.id
      LEFT JOIN boletas b ON a.boleta_id = b.id
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE r.id = $1
        AND a.estado = 'CONFIRMADO'
        AND a.gateway_pago IS NULL
    `;

    const abonosRes = await client.query(query, [rifaId]);

    console.log("Total abonos encontrados:", abonosRes.rows.length);
    const totalSuma = abonosRes.rows.reduce((acc, row) => acc + parseFloat(row.monto), 0);
    console.log("Suma total de abonos (Sin Gateway):", totalSuma);

    if (abonosRes.rows.length > 0) {
      console.log("Registros causantes:");
      console.table(abonosRes.rows.map(r => ({
        id: r.id,
        monto: r.monto,
        venta: r.venta_id,
        boleta: r.boleta_numero,
        cliente: r.cliente_nombre,
        medio_pago: r.medio_pago_nombre || 'N/A',
        created_at: r.created_at
      })));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
