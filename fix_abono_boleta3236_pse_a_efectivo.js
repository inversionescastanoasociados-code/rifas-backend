/**
 * fix_abono_boleta3236_pse_a_efectivo.js
 * ----------------------------------------
 * Cambia el método de pago del abono de la boleta 3236
 * de PSE → Efectivo.
 *
 * Abono identificado:
 *   ID         : fee4ef86-0662-4118-8c54-72689965cdce
 *   Monto      : 70.000
 *   Boleta     : 3236 (id: 6eb3ad51-93d5-4b9b-b292-efb36fb3468c)
 *   Venta      : 132ef0f7-31a8-4212-a6b9-cc869887060c
 *   Cliente    : ORLANDO ALBEIRO VELEZ LOPEZ
 *   Fecha      : 2026-05-14
 *
 * Cambio:
 *   gateway_pago  : PSE  → EFECTIVO
 *   medio_pago_id : db94562d-bb01-42a3-9414-6e369a1a70ba (PSE)
 *                 → d397d917-c0d0-4c61-b2b3-2ebfab7deeb7 (Efectivo)
 */

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

// ── Constantes (hardcoded y verificadas antes de ejecutar) ──
const ABONO_ID        = 'fee4ef86-0662-4118-8c54-72689965cdce';
const VENTA_ID        = '132ef0f7-31a8-4212-a6b9-cc869887060c';
const BOLETA_ID       = '6eb3ad51-93d5-4b9b-b292-efb36fb3468c';
const MONTO_ESPERADO  = 70000;
const MP_ID_PSE       = 'db94562d-bb01-42a3-9414-6e369a1a70ba';
const MP_ID_EFECTIVO  = 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7';

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

    // ── 2) Validaciones estrictas (si algo no cuadra, aborta) ────────────────
    if (ab.venta_id  !== VENTA_ID)       throw new Error(`❌ venta_id no coincide: ${ab.venta_id}`);
    if (ab.boleta_id !== BOLETA_ID)      throw new Error(`❌ boleta_id no coincide: ${ab.boleta_id}`);
    if (parseFloat(ab.monto) !== MONTO_ESPERADO) throw new Error(`❌ monto inesperado: ${ab.monto}`);
    if (ab.estado !== 'CONFIRMADO')      throw new Error(`❌ estado inesperado: ${ab.estado}`);
    if (ab.gateway_pago !== 'PSE')       throw new Error(`❌ gateway_pago no es PSE: ${ab.gateway_pago}`);
    if (ab.medio_pago_id !== MP_ID_PSE)  throw new Error(`❌ medio_pago_id no es PSE: ${ab.medio_pago_id}`);

    console.log('\n✅ Todas las validaciones pasaron. Procediendo con la actualización...\n');

    // ── 3) Snapshot boleta y venta ──────────────────────────────────────────
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

    // ── 4) Actualizar el abono ───────────────────────────────────────────────
    const upd = await c.query(
      `UPDATE abonos
          SET gateway_pago  = 'EFECTIVO',
              medio_pago_id = $2,
              notas         = COALESCE(notas, '') || ' | CORREGIDO 2026-05-14: método de pago cambiado de PSE a EFECTIVO'
        WHERE id            = $1
          AND estado        = 'CONFIRMADO'
          AND gateway_pago  = 'PSE'
          AND medio_pago_id = $3
        RETURNING id, monto, estado, gateway_pago, medio_pago_id, notas`,
      [ABONO_ID, MP_ID_EFECTIVO, MP_ID_PSE]
    );

    if (upd.rowCount !== 1) throw new Error(`❌ UPDATE afectó ${upd.rowCount} filas (esperado 1). ABORTANDO.`);

    console.log('\n✅ ABONO DESPUÉS:');
    console.table(upd.rows);

    // ── 5) Verificar que la venta no cambió (montos deben ser idénticos) ────
    const ventaAfter = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('\n📋 VENTA DESPUÉS (debe ser idéntica a antes):');
    console.table(ventaAfter.rows);

    const vB = ventaBefore.rows[0];
    const vA = ventaAfter.rows[0];
    if (parseFloat(vA.abono_total) !== parseFloat(vB.abono_total) ||
        parseFloat(vA.saldo_pendiente) !== parseFloat(vB.saldo_pendiente) ||
        vA.estado_venta !== vB.estado_venta) {
      throw new Error('❌ Los totales de la venta cambiaron inesperadamente. ABORTANDO.');
    }

    // ── 6) COMMIT ────────────────────────────────────────────────────────────
    await c.query('COMMIT');
    console.log('\n🎉 COMMIT exitoso. Método de pago cambiado de PSE → EFECTIVO correctamente.');

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n⛔ ROLLBACK ejecutado. Error:', err.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
