const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    const boletas = await c.query(`
      SELECT b.id, b.numero, b.rifa_id, r.nombre AS rifa, b.estado,
             b.venta_id, b.bloqueo_hasta, b.cliente_id
      FROM boletas b JOIN rifas r ON r.id = b.rifa_id
      WHERE CAST(b.numero AS TEXT) = '8205'
      ORDER BY b.id
    `);
    console.log('--- BOLETAS numero 8205 ---');
    console.table(boletas.rows);

    for (const b of boletas.rows) {
      console.log(`\n=== BOLETA ID=${b.id} numero=${b.numero} rifa=${b.rifa} estado=${b.estado} ===`);

      const ventas = await c.query(`
        SELECT v.id, v.estado_venta, v.monto_total, v.abono_total, v.saldo_pendiente,
               v.cliente_id, cl.nombre AS cliente, cl.identificacion AS cedula,
               v.created_at, v.updated_at
        FROM ventas v
        LEFT JOIN clientes cl ON cl.id = v.cliente_id
        WHERE v.id IN (
          SELECT DISTINCT venta_id FROM abonos WHERE boleta_id = $1
          UNION
          SELECT venta_id FROM boletas WHERE id = $1 AND venta_id IS NOT NULL
        )
        ORDER BY v.created_at
      `, [b.id]);
      console.log('--- VENTAS asociadas ---');
      console.table(ventas.rows);

      const ab = await c.query(`
        SELECT a.id, a.created_at, a.monto, a.venta_id, a.boleta_id,
               a.medio_pago_id, mp.nombre AS medio_pago, a.gateway_pago,
               a.referencia, a.notas, a.estado
        FROM abonos a
        LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
        WHERE a.boleta_id = $1
        ORDER BY a.created_at
      `, [b.id]);
      console.log('--- ABONOS de la boleta ---');
      console.table(ab.rows);
    }
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
