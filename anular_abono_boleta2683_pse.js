/**
 * Fix boleta 2683 – Anular pago PSE $120.000 hecho por error hoy 23/24-May-2026
 * Cliente: ARBEY ZAPATA (3218356743)
 *
 * Operaciones (en transacción):
 *  1. abonos.estado  = 'ANULADO'   (id 69d24150-1ef5-4acd-9d34-948d70d111ef)
 *  2. ventas: abono_total = 0, saldo_pendiente = 120000, estado_venta = 'PENDIENTE'
 *  3. boletas.estado = 'RESERVADA'
 */

const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const ABONO_ID  = '69d24150-1ef5-4acd-9d34-948d70d111ef';
const VENTA_ID  = '0a57b448-577f-4ebe-a5dc-b06612e6b853';
const BOLETA_ID = '51f32bb3-bd2e-470b-8f8c-29a713e1e0ef';

const pool = new Pool({ connectionString: DATABASE_URL });

async function fix() {
  const client = await pool.connect();
  try {
    console.log('=== ANULAR PAGO BOLETA 2683 ===\n');

    // ── Snapshot ANTES ──────────────────────────────────────────────────
    const snap = await client.query(`
      SELECT b.numero, b.estado AS boleta_estado,
             v.estado_venta, v.abono_total, v.saldo_pendiente,
             a.estado AS abono_estado, a.monto, a.gateway_pago, a.created_at
      FROM boletas b
      JOIN ventas  v ON v.id = b.venta_id
      JOIN abonos  a ON a.id = $1
      WHERE b.id = $2
    `, [ABONO_ID, BOLETA_ID]);
    console.log('ANTES:', JSON.stringify(snap.rows[0], null, 2));

    // ── Validaciones ────────────────────────────────────────────────────
    const row = snap.rows[0];
    if (!row) throw new Error('No se encontró la boleta/abono — revisar IDs');
    if (row.abono_estado === 'ANULADO') throw new Error('El abono ya está ANULADO, nada que hacer');
    if (row.boleta_estado !== 'PAGADA') throw new Error(`Estado inesperado de boleta: ${row.boleta_estado}`);

    // ── BEGIN ────────────────────────────────────────────────────────────
    await client.query('BEGIN');

    // 1. Anular el abono
    await client.query(
      `UPDATE abonos SET estado = 'ANULADO' WHERE id = $1`,
      [ABONO_ID]
    );

    // 2. Revertir la venta (saldo_pendiente es columna generada: monto_total - abono_total)
    await client.query(
      `UPDATE ventas
       SET abono_total  = 0,
           estado_venta = 'PENDIENTE'
       WHERE id = $1`,
      [VENTA_ID]
    );

    // 3. Volver boleta a RESERVADA
    await client.query(
      `UPDATE boletas SET estado = 'RESERVADA' WHERE id = $1`,
      [BOLETA_ID]
    );

    // ── Snapshot DESPUÉS ────────────────────────────────────────────────
    const snap2 = await client.query(`
      SELECT b.numero, b.estado AS boleta_estado,
             v.estado_venta, v.abono_total, v.saldo_pendiente,
             a.estado AS abono_estado, a.monto, a.gateway_pago
      FROM boletas b
      JOIN ventas  v ON v.id = b.venta_id
      JOIN abonos  a ON a.id = $1
      WHERE b.id = $2
    `, [ABONO_ID, BOLETA_ID]);
    console.log('\nDESPUÉS:', JSON.stringify(snap2.rows[0], null, 2));

    // ── COMMIT ───────────────────────────────────────────────────────────
    await client.query('COMMIT');
    console.log('\n✅ COMMIT exitoso — boleta 2683 queda como RESERVADA, abono ANULADO');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ROLLBACK —', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();
