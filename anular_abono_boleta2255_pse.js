/**
 * anular_abono_boleta2255_pse.js
 * -------------------------------------------------------
 * Anula el abono de $60.000 PSE de la boleta 2255
 * registrado el 2026-05-22 a las 19:49 (hora Colombia).
 * Se hizo por equivocación.
 *
 * Abono identificado:
 *   ID         : abb68a69-4d85-4ba4-99cf-8c5e43f5b718
 *   Monto      : 60.000
 *   Boleta     : 2255  (id: bb2f4d21-114c-4763-93d0-c5b601f24682)
 *   Venta      : 34c3f318-e464-4ce1-aa03-12407984ffe8
 *   Cliente    : JULIAN ANDRES GONZALES  (tel: 3226667418)
 *   Gateway    : PSE
 *
 * Estado ANTES de la corrección:
 *   - venta.monto_total     : 120.000
 *   - venta.abono_total     : 60.000
 *   - venta.saldo_pendiente : 60.000
 *   - venta.estado_venta    : ABONADA
 *   - boleta.estado         : ABONADA
 *
 * Efecto esperado:
 *   - abono.estado          → ANULADO
 *   - venta.abono_total     : 60.000 → 0
 *   - venta.saldo_pendiente : 60.000 → 120.000
 *   - venta.estado_venta    : ABONADA → PENDIENTE  (trigger)
 *
 * Solo se modifica el campo estado del abono.
 * Monto, boleta, venta y cliente NO se tocan.
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

// ── Constantes verificadas manualmente ──────────────────────────────────────
const ABONO_ID       = 'abb68a69-4d85-4ba4-99cf-8c5e43f5b718';
const VENTA_ID       = '34c3f318-e464-4ce1-aa03-12407984ffe8';
const BOLETA_ID      = 'bb2f4d21-114c-4763-93d0-c5b601f24682';
const MONTO_ESPERADO = 60000;
const MP_ID_PSE      = 'db94562d-bb01-42a3-9414-6e369a1a70ba';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();

  try {
    await c.query('BEGIN');

    // ── 1) Leer y bloquear el abono ──────────────────────────────────────────
    const before = await c.query(
      `SELECT id, monto, estado, venta_id, boleta_id,
              gateway_pago, medio_pago_id, notas, created_at
         FROM abonos
        WHERE id = $1
          FOR UPDATE`,
      [ABONO_ID]
    );

    if (before.rows.length !== 1) throw new Error('❌ Abono no encontrado');
    const ab = before.rows[0];
    console.log('\n📋 ABONO ANTES:');
    console.table([ab]);

    // ── 2) Validaciones estrictas ────────────────────────────────────────────
    if (ab.venta_id  !== VENTA_ID)       throw new Error(`❌ venta_id no coincide: ${ab.venta_id}`);
    if (ab.boleta_id !== BOLETA_ID)      throw new Error(`❌ boleta_id no coincide: ${ab.boleta_id}`);
    if (parseFloat(ab.monto) !== MONTO_ESPERADO) throw new Error(`❌ monto inesperado: ${ab.monto}`);
    if (ab.estado !== 'CONFIRMADO')      throw new Error(`❌ estado ya no es CONFIRMADO: ${ab.estado}`);
    if (ab.gateway_pago !== 'PSE')       throw new Error(`❌ gateway_pago no es PSE: ${ab.gateway_pago}`);
    if (ab.medio_pago_id !== MP_ID_PSE)  throw new Error(`❌ medio_pago_id no es PSE: ${ab.medio_pago_id}`);

    console.log('\n✅ Todas las validaciones pasaron. Procediendo con la anulación...\n');

    // ── 3) Snapshot boleta y venta antes ────────────────────────────────────
    const boletaBefore = await c.query(
      `SELECT id, numero, estado, venta_id FROM boletas WHERE id = $1`,
      [BOLETA_ID]
    );
    console.log('📋 BOLETA ANTES:');
    console.table(boletaBefore.rows);

    const ventaBefore = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('📋 VENTA ANTES:');
    console.table(ventaBefore.rows);

    // ── 4) Verificar que no haya otros abonos CONFIRMADOS en esta venta ─────
    const otrosAbonos = await c.query(
      `SELECT id, monto, estado, gateway_pago
         FROM abonos
        WHERE venta_id = $1
          AND id       != $2
          AND estado   = 'CONFIRMADO'`,
      [VENTA_ID, ABONO_ID]
    );
    console.log(`\n🔍 Otros abonos CONFIRMADOS en esta venta: ${otrosAbonos.rowCount}`);
    if (otrosAbonos.rowCount > 0) {
      console.table(otrosAbonos.rows);
    }

    // ── 5) Anular el abono ───────────────────────────────────────────────────
    const upd = await c.query(
      `UPDATE abonos
          SET estado = 'ANULADO'::estado_abono,
              notas  = COALESCE(notas, '') || ' | ANULADO 2026-05-23: abono PSE de $60.000 registrado por equivocación'
        WHERE id     = $1
          AND estado = 'CONFIRMADO'::estado_abono
        RETURNING id, monto, estado, gateway_pago, notas`,
      [ABONO_ID]
    );

    if (upd.rowCount !== 1) throw new Error(`❌ UPDATE afectó ${upd.rowCount} filas (esperado 1). ABORTANDO.`);

    console.log('\n✅ ABONO DESPUÉS:');
    console.table(upd.rows);

    // ── 6) Verificar venta tras trigger ─────────────────────────────────────
    const ventaAfter = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('\n📋 VENTA DESPUÉS:');
    console.table(ventaAfter.rows);

    const vA = ventaAfter.rows[0];
    if (parseFloat(vA.abono_total) !== 0) {
      console.warn(`⚠️  AVISO: abono_total quedó en ${vA.abono_total} (esperado 0). El trigger puede haber manejado otros abonos.`);
    }
    if (parseFloat(vA.saldo_pendiente) !== parseFloat(ventaBefore.rows[0].monto_total)) {
      console.warn(`⚠️  AVISO: saldo_pendiente quedó en ${vA.saldo_pendiente} (esperado ${ventaBefore.rows[0].monto_total}).`);
    }

    // ── 7) Verificar boleta ──────────────────────────────────────────────────
    const boletaAfter = await c.query(
      `SELECT id, numero, estado, venta_id FROM boletas WHERE id = $1`,
      [BOLETA_ID]
    );
    console.log('\n📋 BOLETA DESPUÉS:');
    console.table(boletaAfter.rows);

    // ── 8) COMMIT ────────────────────────────────────────────────────────────
    await c.query('COMMIT');
    console.log('\n🎉 COMMIT exitoso. Abono anulado correctamente.');
    console.log(`   Boleta 2255 | JULIAN ANDRES GONZALES | $60.000 PSE → ANULADO`);

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n⛔ ROLLBACK ejecutado. Error:', err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
