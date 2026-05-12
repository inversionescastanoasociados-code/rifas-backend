const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    const boletas = await c.query(`
      SELECT b.id, b.numero, b.rifa_id, r.nombre AS rifa, b.estado
      FROM boletas b JOIN rifas r ON r.id = b.rifa_id
      WHERE CAST(b.numero AS TEXT) = '4862'
      ORDER BY b.id
    `);
    console.log('--- BOLETAS numero 4862 ---');
    console.table(boletas.rows);

    for (const b of boletas.rows) {
      const ab = await c.query(`
        SELECT a.id, a.created_at, a.monto, a.venta_id, a.boleta_id,
               a.medio_pago_id, mp.nombre AS medio_pago, a.gateway_pago,
               a.referencia, a.notas, a.estado,
               v.estado_venta, v.monto_total, v.abono_total,
               cl.nombre AS cliente, cl.identificacion AS cedula
        FROM abonos a
        LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
        JOIN ventas v ON v.id = a.venta_id
        LEFT JOIN clientes cl ON cl.id = v.cliente_id
        WHERE a.boleta_id = $1
        ORDER BY a.created_at
      `, [b.id]);
      console.log(`--- ABONOS boleta_id=${b.id} (numero=${b.numero}, rifa=${b.rifa}) ---`);
      console.table(ab.rows);

      // Tambien busco abonos por venta_id (por si hubiera abonos asociados a la venta sin boleta_id)
      const ventaIds = [...new Set(ab.rows.map(r => r.venta_id))];
      for (const vid of ventaIds) {
        const vAb = await c.query(`
          SELECT a.id, a.created_at, a.monto, a.boleta_id, mp.nombre AS medio_pago, a.gateway_pago, a.estado
          FROM abonos a LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
          WHERE a.venta_id = $1 ORDER BY a.created_at
        `, [vid]);
        console.log(`--- TODOS los ABONOS de venta_id=${vid} ---`);
        console.table(vAb.rows);
      }
    }
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
