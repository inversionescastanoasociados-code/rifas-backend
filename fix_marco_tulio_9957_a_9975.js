/**
 * Fix Marco Tulio: Boleta 9957 -> 9975 (cliente se confundió de número)
 *
 * Plan A (confirmado por el usuario):
 *  - La venta antigua (1c2ec790, fecha 2026-04-12, $120k pagados) pasa a ser de la 9975.
 *  - La boleta 9975 se reasigna a esa venta antigua (queda PAGADA).
 *  - Los 2 abonos PSE antiguos (60k + 60k) se mueven de la 9957 a la 9975.
 *  - La boleta 9957 queda DISPONIBLE (liberada).
 *  - La venta NUEVA de hoy (b7c202a5, $120k de hoy) y su abono se BORRAN (pago duplicado).
 *
 * UUIDs fijos detectados:
 *   Cliente Marco Tulio:        25c5e8e6-f0aa-44aa-8aba-3c5348f859b8
 *   Boleta 9957 (a liberar):    bacd16f4-17e9-4fdc-8944-4cb24195575f
 *   Boleta 9975 (a asignar):    d6b76875-52bd-4119-a417-d172e0f80bde
 *   Venta antigua (queda):      1c2ec790-b4fe-42b2-a3b8-85646e67195f
 *   Venta nueva (a borrar):     b7c202a5-4da3-48f9-b885-fd94772bf6c5
 *   Abono nuevo (a borrar):     b15042d4-6b67-4ca7-9f4b-e175b142b359
 */
const { Client } = require('pg');
const cs = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const CLIENTE_ID = '25c5e8e6-f0aa-44aa-8aba-3c5348f859b8';
const BOLETA_9957 = 'bacd16f4-17e9-4fdc-8944-4cb24195575f';
const BOLETA_9975 = 'd6b76875-52bd-4119-a417-d172e0f80bde';
const VENTA_VIEJA = '1c2ec790-b4fe-42b2-a3b8-85646e67195f';
const VENTA_NUEVA = 'b7c202a5-4da3-48f9-b885-fd94772bf6c5';
const ABONO_NUEVO = 'b15042d4-6b67-4ca7-9f4b-e175b142b359';

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  let committed = false;
  try {
    await c.query('BEGIN');
    console.log('🔒 Transacción iniciada');

    // ── Sanity checks pre-fix ───────────────────────────────────────
    const pre9957 = await c.query(`SELECT id, numero, estado, venta_id, cliente_id, vendido_por FROM boletas WHERE id=$1`, [BOLETA_9957]);
    const pre9975 = await c.query(`SELECT id, numero, estado, venta_id, cliente_id, vendido_por FROM boletas WHERE id=$1`, [BOLETA_9975]);
    const preVV   = await c.query(`SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id=$1`, [VENTA_VIEJA]);
    const preVN   = await c.query(`SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id=$1`, [VENTA_NUEVA]);
    const preAB   = await c.query(`SELECT id, monto, venta_id, boleta_id FROM abonos WHERE id=$1`, [ABONO_NUEVO]);
    const preABV  = await c.query(`SELECT id, monto, boleta_id FROM abonos WHERE venta_id=$1 ORDER BY created_at`, [VENTA_VIEJA]);

    if (pre9957.rows.length !== 1 || pre9957.rows[0].numero !== 9957) throw new Error('Boleta 9957 no coincide');
    if (pre9975.rows.length !== 1 || pre9975.rows[0].numero !== 9975) throw new Error('Boleta 9975 no coincide');
    if (preVV.rows.length !== 1 || preVV.rows[0].estado_venta !== 'PAGADA' || Number(preVV.rows[0].monto_total) !== 120000) throw new Error('Venta vieja no coincide');
    if (preVN.rows.length !== 1 || preVN.rows[0].estado_venta !== 'PAGADA' || Number(preVN.rows[0].monto_total) !== 120000) throw new Error('Venta nueva no coincide');
    if (preAB.rows.length !== 1 || Number(preAB.rows[0].monto) !== 120000) throw new Error('Abono nuevo no coincide');
    if (preABV.rows.length !== 2) throw new Error(`Se esperaban 2 abonos en venta vieja, hay ${preABV.rows.length}`);

    const vendidoPor9957 = pre9957.rows[0].vendido_por;
    console.log('✅ Verificación previa OK');

    // ── 1) Liberar boleta 9975 de la venta nueva (para luego reasignarla) ──
    let r = await c.query(`
      UPDATE boletas
      SET venta_id = NULL, cliente_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND venta_id = $2
    `, [BOLETA_9975, VENTA_NUEVA]);
    console.log(`(1) boletas 9975 desvinculada de venta nueva: ${r.rowCount}`);
    if (r.rowCount !== 1) throw new Error('Paso 1 falló');

    // ── 2) Borrar abono nuevo ($120k de hoy, pago duplicado) ──
    r = await c.query(`DELETE FROM abonos WHERE id=$1 AND venta_id=$2`, [ABONO_NUEVO, VENTA_NUEVA]);
    console.log(`(2) abono nuevo borrado: ${r.rowCount}`);
    if (r.rowCount !== 1) throw new Error('Paso 2 falló');

    // ── 3) Borrar venta nueva (b7c202a5) ──
    r = await c.query(`DELETE FROM ventas WHERE id=$1`, [VENTA_NUEVA]);
    console.log(`(3) venta nueva borrada: ${r.rowCount}`);
    if (r.rowCount !== 1) throw new Error('Paso 3 falló');

    // Confirmar que ya no quedan abonos huérfanos de la venta nueva
    const huerf = await c.query(`SELECT COUNT(*)::int AS n FROM abonos WHERE venta_id=$1`, [VENTA_NUEVA]);
    if (huerf.rows[0].n !== 0) throw new Error('Quedaron abonos de la venta nueva');

    // ── 4) Asignar boleta 9975 a la venta vieja, con Marco Tulio, PAGADA ──
    r = await c.query(`
      UPDATE boletas
      SET venta_id = $2,
          cliente_id = $3,
          estado = 'PAGADA',
          bloqueo_hasta = NULL,
          vendido_por = COALESCE(vendido_por, $4),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [BOLETA_9975, VENTA_VIEJA, CLIENTE_ID, vendidoPor9957]);
    console.log(`(4) boleta 9975 asignada a venta vieja: ${r.rowCount}`);
    if (r.rowCount !== 1) throw new Error('Paso 4 falló');

    // ── 5) Mover los 2 abonos antiguos de la 9957 -> 9975 ──
    r = await c.query(`
      UPDATE abonos
      SET boleta_id = $2
      WHERE venta_id = $3 AND boleta_id = $1
    `, [BOLETA_9957, BOLETA_9975, VENTA_VIEJA]);
    console.log(`(5) abonos movidos de 9957 a 9975: ${r.rowCount}`);
    if (r.rowCount !== 2) throw new Error('Paso 5 falló (se esperaban 2 abonos)');

    // ── 6) Liberar boleta 9957 ──
    r = await c.query(`
      UPDATE boletas
      SET venta_id = NULL,
          cliente_id = NULL,
          vendido_por = NULL,
          estado = 'DISPONIBLE',
          bloqueo_hasta = NULL,
          reserva_token = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [BOLETA_9957]);
    console.log(`(6) boleta 9957 liberada: ${r.rowCount}`);
    if (r.rowCount !== 1) throw new Error('Paso 6 falló');

    // ── Validaciones post-fix ───────────────────────────────────────
    const post9957 = await c.query(`SELECT id, numero, estado, venta_id, cliente_id FROM boletas WHERE id=$1`, [BOLETA_9957]);
    const post9975 = await c.query(`SELECT id, numero, estado, venta_id, cliente_id FROM boletas WHERE id=$1`, [BOLETA_9975]);
    const postVV   = await c.query(`SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id=$1`, [VENTA_VIEJA]);
    const postVN   = await c.query(`SELECT COUNT(*)::int AS n FROM ventas WHERE id=$1`, [VENTA_NUEVA]);
    const postABV  = await c.query(`SELECT id, monto, boleta_id FROM abonos WHERE venta_id=$1 ORDER BY created_at`, [VENTA_VIEJA]);
    const postBolVV= await c.query(`SELECT id, numero, estado FROM boletas WHERE venta_id=$1`, [VENTA_VIEJA]);

    console.log('\n📋 ESTADO FINAL (dentro de la transacción):');
    console.log('Boleta 9957:'); console.table(post9957.rows);
    console.log('Boleta 9975:'); console.table(post9975.rows);
    console.log('Venta vieja:'); console.table(postVV.rows);
    console.log(`Venta nueva existe?: ${postVN.rows[0].n === 0 ? 'NO ✅' : 'SÍ ❌'}`);
    console.log('Abonos de la venta vieja:'); console.table(postABV.rows);
    console.log('Boletas asociadas a la venta vieja:'); console.table(postBolVV.rows);

    // Aserciones críticas
    if (post9957.rows[0].estado !== 'DISPONIBLE' || post9957.rows[0].venta_id !== null) throw new Error('9957 no quedó liberada');
    if (post9975.rows[0].estado !== 'PAGADA' || post9975.rows[0].venta_id !== VENTA_VIEJA) throw new Error('9975 no quedó asignada');
    if (postVN.rows[0].n !== 0) throw new Error('Venta nueva no fue borrada');
    if (postABV.rows.length !== 2 || postABV.rows.some(a => a.boleta_id !== BOLETA_9975)) throw new Error('Abonos no quedaron en 9975');
    if (postBolVV.rows.length !== 1 || postBolVV.rows[0].numero !== 9975) throw new Error('Venta vieja debe tener solo la 9975');

    await c.query('COMMIT');
    committed = true;
    console.log('\n🎉 COMMIT realizado. Fix aplicado correctamente.');
  } catch (e) {
    if (!committed) {
      try { await c.query('ROLLBACK'); console.error('🛑 ROLLBACK ejecutado.'); } catch {}
    }
    console.error('❌ Error:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
