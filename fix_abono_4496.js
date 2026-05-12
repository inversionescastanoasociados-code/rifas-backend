const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const ABONO_ID  = '6007aba2-b670-4f1e-8846-09976665ffe8'; // segundo abono, 60k -> 30k
const VENTA_ID  = 'aefbbe16-508c-4bd9-8b54-679761fdf86f';
const BOLETA_ID = '4995d9f0-53d9-46b0-a59d-af0c9c379d90';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query('BEGIN');

    // 1) Snapshot estado actual
    const abonoBefore = await c.query(
      `SELECT id, monto, estado, venta_id, boleta_id, notas, created_at
         FROM abonos WHERE id = $1 FOR UPDATE`, [ABONO_ID]);
    if (abonoBefore.rows.length !== 1) throw new Error('Abono no encontrado');
    const a = abonoBefore.rows[0];
    console.log('ABONO ANTES:', a);

    if (a.venta_id !== VENTA_ID)   throw new Error(`venta_id no coincide: ${a.venta_id}`);
    if (a.boleta_id !== BOLETA_ID) throw new Error(`boleta_id no coincide: ${a.boleta_id}`);
    if (parseFloat(a.monto) !== 60000) throw new Error(`monto inesperado: ${a.monto}`);
    if (a.estado !== 'CONFIRMADO') throw new Error(`estado inesperado: ${a.estado}`);

    const ventaBefore = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta, cliente_id, rifa_id
         FROM ventas WHERE id = $1 FOR UPDATE`, [VENTA_ID]);
    console.log('VENTA ANTES:', ventaBefore.rows[0]);

    const boletaBefore = await c.query(
      `SELECT id, numero, estado, cliente_id, venta_id, bloqueo_hasta, reserva_token
         FROM boletas WHERE id = $1 FOR UPDATE`, [BOLETA_ID]);
    console.log('BOLETA ANTES:', boletaBefore.rows[0]);

    if (parseFloat(ventaBefore.rows[0].monto_total) !== 120000) {
      throw new Error('monto_total venta inesperado');
    }
    if (parseFloat(ventaBefore.rows[0].abono_total) !== 120000) {
      throw new Error('abono_total venta inesperado');
    }

    // 2) Deshabilitar trigger destructivo en ventas
    await c.query(`ALTER TABLE ventas DISABLE TRIGGER on_venta_estado_change`);

    // 3) Bajar monto a 30000 + nota de auditoria
    const upd = await c.query(
      `UPDATE abonos
          SET monto = 30000,
              notas = COALESCE(notas, '') || ' | AJUSTE 2026-05-07: monto corregido de 60.000 a 30.000 (registro erroneo)'
        WHERE id = $1
          AND monto = 60000
          AND estado = 'CONFIRMADO'::estado_abono
        RETURNING id, monto, estado, notas`, [ABONO_ID]);
    if (upd.rowCount !== 1) throw new Error(`Update afecto ${upd.rowCount} filas, esperado 1`);
    console.log('ABONO DESPUES:', upd.rows[0]);

    // 4) Verificar venta tras recalc trigger (que sigue activo)
    const ventaMid = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id = $1`, [VENTA_ID]);
    console.log('VENTA DESPUES recalc:', ventaMid.rows[0]);
    if (parseFloat(ventaMid.rows[0].abono_total) !== 90000) {
      throw new Error(`abono_total esperado 90000, obtenido ${ventaMid.rows[0].abono_total}`);
    }
    if (ventaMid.rows[0].estado_venta !== 'ABONADA') {
      throw new Error(`estado_venta esperado ABONADA, obtenido ${ventaMid.rows[0].estado_venta}`);
    }

    // 5) Ajustar boleta a ABONADA (preservar cliente_id y venta_id)
    const updBoleta = await c.query(
      `UPDATE boletas
          SET estado = 'ABONADA'
        WHERE id = $1
        RETURNING id, numero, estado, cliente_id, venta_id`, [BOLETA_ID]);
    console.log('BOLETA DESPUES:', updBoleta.rows[0]);

    // 6) Reactivar trigger
    await c.query(`ALTER TABLE ventas ENABLE TRIGGER on_venta_estado_change`);

    // 7) Verificacion final pre-commit
    const final = await c.query(
      `SELECT a.id, a.monto, a.estado, a.created_at
         FROM abonos a WHERE a.venta_id = $1 ORDER BY a.created_at`, [VENTA_ID]);
    console.log('--- ABONOS FINALES ---');
    console.table(final.rows);

    const ventaFinal = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id = $1`, [VENTA_ID]);
    console.log('VENTA FINAL:', ventaFinal.rows[0]);

    const boletaFinal = await c.query(
      `SELECT id, numero, estado, cliente_id, venta_id FROM boletas WHERE id = $1`, [BOLETA_ID]);
    console.log('BOLETA FINAL:', boletaFinal.rows[0]);

    if (boletaFinal.rows[0].cliente_id == null) throw new Error('cliente_id de boleta se perdio');
    if (boletaFinal.rows[0].venta_id == null)   throw new Error('venta_id de boleta se perdio');

    await c.query('COMMIT');
    console.log('COMMIT OK');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ROLLBACK -', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
