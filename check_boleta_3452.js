const { Client } = require('pg');
const conn = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

(async () => {
  const c = new Client({ connectionString: conn });
  await c.connect();

  // 1. Boleta y venta
  const r1 = await c.query(`
    SELECT b.id AS boleta_id, b.numero, b.estado, b.created_at,
           v.id AS venta_id, v.monto_total, v.abono_total, v.saldo_pendiente,
           v.estado_venta, v.es_venta_online, v.created_at AS venta_creada,
           cl.nombre, cl.identificacion
    FROM boletas b
    JOIN ventas v ON v.id = b.venta_id
    JOIN clientes cl ON cl.id = b.cliente_id
    WHERE b.numero = 3452 AND b.rifa_id = '151168bd-81c7-4210-919f-47256304ee2d'
  `);
  console.log('\n=== BOLETA 3452 + VENTA ===');
  console.table(r1.rows);

  // 2. Todas las boletas en la misma venta
  const r2 = await c.query(`
    SELECT b.numero, b.estado, b.rifa_id, r.nombre AS rifa,
           r.precio_boleta, b.created_at
    FROM boletas b
    JOIN rifas r ON r.id = b.rifa_id
    WHERE b.venta_id = '5748c16f-55fa-4a08-bc30-686c281a62a5'
    ORDER BY b.numero
  `);
  console.log('\n=== BOLETAS EN LA VENTA 5748c16f ===');
  console.table(r2.rows);
  console.log(`Total boletas en venta: ${r2.rows.length}`);
  if (r2.rows.length > 0) {
    const total = r2.rows.reduce((s, b) => s + parseFloat(b.precio_boleta), 0);
    console.log(`Suma precio_boleta: ${total} | monto_total en BD: 240000`);
  }

  // 3. Boletas de la misma rifa creadas en la misma ventana de tiempo (~10 min)
  const r3 = await c.query(`
    SELECT b.numero, b.estado, b.venta_id, b.cliente_id, b.created_at
    FROM boletas b
    WHERE b.rifa_id = '151168bd-81c7-4210-919f-47256304ee2d'
      AND b.created_at BETWEEN '2026-03-02 13:40:00+00' AND '2026-03-02 14:00:00+00'
    ORDER BY b.created_at
  `);
  console.log('\n=== BOLETAS MISMA RIFA ±10 min de la reserva (13:51 UTC) ===');
  console.table(r3.rows);

  // 4. Abonos de la venta
  const r4 = await c.query(`
    SELECT a.id, a.monto, a.estado, a.gateway_pago, a.referencia, a.created_at, a.notas
    FROM abonos a
    WHERE a.venta_id = '5748c16f-55fa-4a08-bc30-686c281a62a5'
    ORDER BY a.created_at
  `);
  console.log('\n=== ABONOS DE LA VENTA ===');
  console.table(r4.rows);
  console.log(`Total abonos: ${r4.rows.length}`);

  // 5. ¿Existen otras ventas del mismo cliente en la misma rifa?
  const r5 = await c.query(`
    SELECT v.id, v.monto_total, v.abono_total, v.saldo_pendiente, v.estado_venta,
           v.es_venta_online, v.created_at
    FROM ventas v
    WHERE v.cliente_id = 'b99ac834-5393-40b5-8fb0-3fb76c1b2e00'
      AND v.rifa_id = '151168bd-81c7-4210-919f-47256304ee2d'
    ORDER BY v.created_at
  `);
  console.log('\n=== OTRAS VENTAS DEL MISMO CLIENTE EN ESTA RIFA ===');
  console.table(r5.rows);

  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
