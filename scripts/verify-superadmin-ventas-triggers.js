/**
 * VERIFICACIÓN (solo lectura efectiva): confirma el comportamiento real de los
 * triggers de producción para cada operación que hará el módulo superadmin.
 * TODO corre dentro de BEGIN ... ROLLBACK: NO persiste ningún cambio.
 *
 * Uso: node scripts/verify-superadmin-ventas-triggers.js
 */
const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const MP_EFECTIVO = 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7';

async function snapshotVenta(client, ventaId, label) {
  const v = await client.query(
    `SELECT monto_total, abono_total, saldo_pendiente, estado_venta FROM ventas WHERE id = $1`,
    [ventaId]
  );
  const b = await client.query(
    `SELECT numero, estado FROM boletas WHERE venta_id = $1 ORDER BY numero`,
    [ventaId]
  );
  const a = await client.query(
    `SELECT id, monto, estado, gateway_pago FROM abonos WHERE venta_id = $1 ORDER BY created_at`,
    [ventaId]
  );
  console.log(`\n--- ${label} ---`);
  console.log('venta:', v.rows[0]);
  console.log('boletas:', b.rows.map((r) => `#${r.numero}:${r.estado}`).join(', '));
  console.log('abonos:', a.rows.map((r) => `${r.monto}/${r.estado}/${r.gateway_pago}`).join(' | '));
  return { v: v.rows[0], b: b.rows, a: a.rows };
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // Buscar una venta ABONADA con al menos un abono confirmado para las pruebas
    const cand = await client.query(`
      SELECT v.id
      FROM ventas v
      WHERE v.estado_venta = 'ABONADA'
        AND EXISTS (SELECT 1 FROM abonos a WHERE a.venta_id = v.id AND a.estado = 'CONFIRMADO')
        AND EXISTS (SELECT 1 FROM boletas b WHERE b.venta_id = v.id)
      ORDER BY v.created_at DESC
      LIMIT 1
    `);
    if (cand.rows.length === 0) {
      console.log('No hay venta ABONADA de prueba disponible.');
      return;
    }
    const ventaId = cand.rows[0].id;
    console.log('Venta de prueba:', ventaId);

    // ═══ TEST 1: editar monto de un abono → ¿trigger recalcula abono_total/estado? ═══
    await client.query('BEGIN');
    const s0 = await snapshotVenta(client, ventaId, 'TEST1 ANTES (editar monto abono)');
    const abono = s0.a.find((x) => x.estado === 'CONFIRMADO');
    await client.query(`UPDATE abonos SET monto = monto + 1000 WHERE id = $1`, [abono.id]);
    await snapshotVenta(client, ventaId, 'TEST1 DESPUES (+1000 al abono) [esperado: abono_total sube solo]');
    await client.query('ROLLBACK');

    // ═══ TEST 2: cambiar método de pago de un abono ═══
    await client.query('BEGIN');
    await snapshotVenta(client, ventaId, 'TEST2 ANTES (cambiar metodo abono)');
    await client.query(
      `UPDATE abonos SET medio_pago_id = $2, gateway_pago = 'Efectivo' WHERE id = $1`,
      [abono.id, MP_EFECTIVO]
    );
    await snapshotVenta(client, ventaId, 'TEST2 DESPUES (metodo=Efectivo) [esperado: totales iguales]');
    await client.query('ROLLBACK');

    // ═══ TEST 3: anular un abono → ¿trigger baja abono_total y ajusta estado? ═══
    await client.query('BEGIN');
    await snapshotVenta(client, ventaId, 'TEST3 ANTES (anular abono)');
    await client.query(`UPDATE abonos SET estado = 'ANULADO' WHERE id = $1`, [abono.id]);
    await snapshotVenta(client, ventaId, 'TEST3 DESPUES (abono ANULADO) [esperado: abono_total baja]');
    await client.query('ROLLBACK');

    // ═══ TEST 4: agregar un abono nuevo ═══
    await client.query('BEGIN');
    const s4 = await snapshotVenta(client, ventaId, 'TEST4 ANTES (agregar abono)');
    const boleta4 = s4.b[0];
    const boletaRow = await client.query(`SELECT id FROM boletas WHERE venta_id=$1 ORDER BY numero LIMIT 1`, [ventaId]);
    await client.query(
      `INSERT INTO abonos (venta_id, boleta_id, monto, estado, medio_pago_id, gateway_pago, moneda, created_at)
       VALUES ($1,$2,$3,'CONFIRMADO',$4,'Efectivo','COP',CURRENT_TIMESTAMP)`,
      [ventaId, boletaRow.rows[0].id, 5000, MP_EFECTIVO]
    );
    await snapshotVenta(client, ventaId, 'TEST4 DESPUES (+abono 5000) [esperado: abono_total sube solo]');
    await client.query('ROLLBACK');

    // ═══ TEST 5: cambiar estado_venta manual (a CANCELADA) → ¿toca boletas? ═══
    await client.query('BEGIN');
    await snapshotVenta(client, ventaId, 'TEST5 ANTES (estado->CANCELADA)');
    await client.query(`UPDATE ventas SET estado_venta = 'CANCELADA' WHERE id = $1`, [ventaId]);
    await snapshotVenta(client, ventaId, 'TEST5 DESPUES (CANCELADA) [esperado: boletas SIN cambio por trigger]');
    await client.query('ROLLBACK');

    // ═══ TEST 6: liberar boleta (a DISPONIBLE) + recalcular monto_total ═══
    await client.query('BEGIN');
    const s6 = await snapshotVenta(client, ventaId, 'TEST6 ANTES (liberar 1 boleta)');
    const libRow = await client.query(`SELECT id, rifa_id FROM boletas WHERE venta_id=$1 ORDER BY numero LIMIT 1`, [ventaId]);
    await client.query(
      `UPDATE boletas SET estado='DISPONIBLE', cliente_id=NULL, venta_id=NULL, vendido_por=NULL, reserva_token=NULL, bloqueo_hasta=NULL WHERE id=$1`,
      [libRow.rows[0].id]
    );
    await snapshotVenta(client, ventaId, 'TEST6 DESPUES (1 boleta liberada) [esperado: 1 boleta menos; monto_total lo ajusta la app]');
    await client.query('ROLLBACK');

    console.log('\n\nTODOS LOS TESTS EJECUTADOS CON ROLLBACK — no se persistió nada.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error en verificación:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
