const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const ABONO_ID_ANULAR = '5a8ba1f7-4821-4300-8a2a-b3fd47779683'; // 50.000, 2026-05-07
const ABONO_ID_KEEP   = '5495511b-ea1c-400e-8625-e51e737341fc'; // 60.000, 2026-03-14
const VENTA_ID        = '9137bddd-a1d6-4da0-a101-5774f356019a';
const BOLETA_ID       = '49163704-f8ce-4bf0-a73f-add596e5f955';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query('BEGIN');

    const before = await c.query(
      `SELECT id, monto, estado, venta_id, boleta_id, notas
         FROM abonos WHERE id = $1 FOR UPDATE`,
      [ABONO_ID_ANULAR]
    );
    if (before.rows.length !== 1) throw new Error('Abono a anular no encontrado');
    const r = before.rows[0];
    console.log('ABONO ANTES:', r);

    if (r.venta_id !== VENTA_ID)   throw new Error(`venta_id no coincide: ${r.venta_id}`);
    if (r.boleta_id !== BOLETA_ID) throw new Error(`boleta_id no coincide: ${r.boleta_id}`);
    if (parseFloat(r.monto) !== 50000) throw new Error(`monto inesperado: ${r.monto}`);
    if (r.estado !== 'CONFIRMADO') throw new Error(`estado inesperado: ${r.estado}`);

    const ventaBefore = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA ANTES:', ventaBefore.rows[0]);

    const upd = await c.query(
      `UPDATE abonos
          SET estado = 'ANULADO'::estado_abono,
              notas  = COALESCE(notas, '') || ' | ANULADO 2026-05-07: abono duplicado/erroneo, se conserva abono inicial de 60.000 (id 5495511b)'
        WHERE id = $1
          AND estado = 'CONFIRMADO'::estado_abono
        RETURNING id, monto, estado, notas`,
      [ABONO_ID_ANULAR]
    );
    if (upd.rowCount !== 1) throw new Error(`Update afecto ${upd.rowCount} filas, esperado 1`);
    console.log('ABONO DESPUES:', upd.rows[0]);

    const ventaAfter = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA DESPUES (pre-commit):', ventaAfter.rows[0]);

    if (parseFloat(ventaAfter.rows[0].abono_total) !== 60000) {
      throw new Error(`abono_total esperado 60000, obtenido ${ventaAfter.rows[0].abono_total}`);
    }

    await c.query('COMMIT');
    console.log('COMMIT OK');

    const final = await c.query(
      `SELECT a.id, a.monto, a.estado, a.notas, a.created_at
         FROM abonos a
        WHERE a.venta_id = $1
        ORDER BY a.created_at`,
      [VENTA_ID]
    );
    console.log('--- ABONOS FINALES ---');
    console.table(final.rows);

    const ventaFinal = await c.query(
      `SELECT id, monto_total, abono_total, estado_venta FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA FINAL:', ventaFinal.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ROLLBACK -', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
