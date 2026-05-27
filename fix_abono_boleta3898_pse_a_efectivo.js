/**
 * fix_abono_boleta3898_pse_a_efectivo.js
 * -------------------------------------------------------
 * Cambia el método de pago del abono PSE de la boleta 3898
 * de PSE → Efectivo.
 *
 * Hay DOS abonos de $60.000 para esta boleta:
 *   - 7fed0c09... PSE      ← ESTE se cambia
 *   - f224c53e... Efectivo ← ESTE no se toca
 *
 * Abono a modificar:
 *   ID         : 7fed0c09-399d-4e53-8fe9-b2d0798796f3
 *   Monto      : 60.000
 *   Boleta     : 3898  (id: 7c914eec-eb82-4b49-9be3-f138745d4a9f)
 *   Venta      : 25d8dbed-448f-45f6-81ce-456198da26f7
 *   Cliente    : ROSENDO MARTINEZ RUBIO (3219019057)
 *   Fecha CO   : 2026-05-16 16:55
 *
 * Cambio:
 *   gateway_pago  : PSE       → EFECTIVO
 *   medio_pago_id : db94562d… → d397d917… (Efectivo)
 *
 * Solo se modifican gateway_pago y medio_pago_id.
 * El abono Efectivo f224c53e... NO se toca.
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const ABONO_ID_PSE     = '7fed0c09-399d-4e53-8fe9-b2d0798796f3';
const ABONO_ID_EFE     = 'f224c53e-31fb-471e-a35e-7e5d24a5bba3'; // solo para confirmar que existe, no se toca
const VENTA_ID         = '25d8dbed-448f-45f6-81ce-456198da26f7';
const BOLETA_ID        = '7c914eec-eb82-4b49-9be3-f138745d4a9f';
const MONTO_ESPERADO   = 60000;
const MP_ID_PSE        = 'db94562d-bb01-42a3-9414-6e369a1a70ba';
const MP_ID_EFECTIVO   = 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();

  try {
    await c.query('BEGIN');

    // ── 1) Leer y bloquear el abono PSE ─────────────────────────────────────
    const before = await c.query(
      `SELECT id, monto, estado, venta_id, boleta_id,
              gateway_pago, medio_pago_id, notas, created_at
         FROM abonos
        WHERE id = $1
          FOR UPDATE`,
      [ABONO_ID_PSE]
    );
    if (before.rows.length !== 1) throw new Error('❌ Abono PSE no encontrado');
    const ab = before.rows[0];
    console.log('\n📋 ABONO PSE ANTES:');
    console.table([ab]);

    // ── 2) Validaciones estrictas ────────────────────────────────────────────
    if (ab.venta_id  !== VENTA_ID)       throw new Error(`❌ venta_id no coincide: ${ab.venta_id}`);
    if (ab.boleta_id !== BOLETA_ID)      throw new Error(`❌ boleta_id no coincide: ${ab.boleta_id}`);
    if (parseFloat(ab.monto) !== MONTO_ESPERADO) throw new Error(`❌ monto inesperado: ${ab.monto}`);
    if (ab.estado !== 'CONFIRMADO')      throw new Error(`❌ estado inesperado: ${ab.estado}`);
    if (ab.gateway_pago !== 'PSE')       throw new Error(`❌ gateway_pago no es PSE: ${ab.gateway_pago}`);
    if (ab.medio_pago_id !== MP_ID_PSE)  throw new Error(`❌ medio_pago_id no es PSE: ${ab.medio_pago_id}`);

    console.log('\n✅ Validaciones del abono PSE OK\n');

    // ── 3) Confirmar que el abono Efectivo existe y NO lo tocamos ────────────
    const abonoEfe = await c.query(
      `SELECT id, monto, estado, gateway_pago, medio_pago_id
         FROM abonos WHERE id = $1`,
      [ABONO_ID_EFE]
    );
    if (abonoEfe.rows.length !== 1) throw new Error('❌ Abono Efectivo de referencia no encontrado');
    console.log('📋 ABONO EFECTIVO (se deja intacto):');
    console.table(abonoEfe.rows);

    // ── 4) Snapshot venta ────────────────────────────────────────────────────
    const ventaBefore = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('📋 VENTA ANTES:');
    console.table(ventaBefore.rows);

    // ── 5) Actualización (solo gateway_pago y medio_pago_id del abono PSE) ──
    const upd = await c.query(
      `UPDATE abonos
          SET gateway_pago  = 'EFECTIVO',
              medio_pago_id = $2,
              notas         = COALESCE(notas, '') || ' | CORREGIDO 2026-05-16: método de pago cambiado de PSE a EFECTIVO'
        WHERE id            = $1
          AND estado        = 'CONFIRMADO'
          AND gateway_pago  = 'PSE'
          AND medio_pago_id = $3
        RETURNING id, monto, estado, gateway_pago, medio_pago_id, notas`,
      [ABONO_ID_PSE, MP_ID_EFECTIVO, MP_ID_PSE]
    );
    if (upd.rowCount !== 1) throw new Error(`❌ UPDATE afectó ${upd.rowCount} filas (esperado 1). ABORTANDO.`);

    console.log('\n✅ ABONO PSE DESPUÉS:');
    console.table(upd.rows);

    // ── 6) Verificar que la venta no cambió (montos idénticos) ──────────────
    const ventaAfter = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('\n📋 VENTA DESPUÉS (debe ser idéntica):');
    console.table(ventaAfter.rows);

    const vB = ventaBefore.rows[0];
    const vA = ventaAfter.rows[0];
    if (parseFloat(vA.abono_total)     !== parseFloat(vB.abono_total)     ||
        parseFloat(vA.saldo_pendiente) !== parseFloat(vB.saldo_pendiente) ||
        vA.estado_venta                !== vB.estado_venta) {
      throw new Error('❌ Los totales de la venta cambiaron inesperadamente. ABORTANDO.');
    }

    // ── 7) Confirmar que el abono Efectivo sigue intacto ────────────────────
    const abonoEfeAfter = await c.query(
      `SELECT id, monto, estado, gateway_pago, medio_pago_id
         FROM abonos WHERE id = $1`,
      [ABONO_ID_EFE]
    );
    console.log('\n📋 ABONO EFECTIVO DESPUÉS (debe ser idéntico):');
    console.table(abonoEfeAfter.rows);
    if (abonoEfeAfter.rows[0].gateway_pago !== 'Efectivo' ||
        abonoEfeAfter.rows[0].medio_pago_id !== MP_ID_EFECTIVO) {
      throw new Error('❌ El abono Efectivo fue modificado inesperadamente. ABORTANDO.');
    }

    // ── 8) COMMIT ────────────────────────────────────────────────────────────
    await c.query('COMMIT');
    console.log('\n🎉 COMMIT exitoso. PSE → EFECTIVO en boleta 3898.');
    console.log('   Ambos abonos quedan en EFECTIVO. Venta sigue PAGADA.');

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n⛔ ROLLBACK ejecutado. Error:', err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
