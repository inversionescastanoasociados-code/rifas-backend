const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const ABONO_ID = '6314c846-dd3f-46cd-a7e8-168fb15bdccb';
const EFECTIVO_ID = 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7';
const PSE_ID = 'db94562d-bb01-42a3-9414-6e369a1a70ba';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query('BEGIN');

    const before = await c.query(
      `SELECT id, monto, medio_pago_id, gateway_pago, notas, estado, boleta_id, venta_id, created_at
       FROM abonos WHERE id = $1 FOR UPDATE`,
      [ABONO_ID]
    );
    if (before.rows.length !== 1) throw new Error('Abono no encontrado');
    const row = before.rows[0];
    console.log('ANTES:', row);

    if (row.medio_pago_id !== PSE_ID) {
      throw new Error(`Verificacion fallida: medio_pago_id actual no es PSE (${row.medio_pago_id})`);
    }
    if (parseFloat(row.monto) !== 30000) {
      throw new Error(`Verificacion fallida: monto inesperado (${row.monto})`);
    }

    const upd = await c.query(
      `UPDATE abonos
         SET medio_pago_id = $1,
             gateway_pago = 'Efectivo'
       WHERE id = $2
         AND medio_pago_id = $3
       RETURNING id, monto, medio_pago_id, gateway_pago, notas, estado`,
      [EFECTIVO_ID, ABONO_ID, PSE_ID]
    );
    if (upd.rowCount !== 1) throw new Error(`Update afecto ${upd.rowCount} filas, esperado 1`);
    console.log('DESPUES:', upd.rows[0]);

    await c.query('COMMIT');
    console.log('COMMIT OK');

    const after = await c.query(
      `SELECT a.id, a.monto, mp.nombre AS medio_pago, a.gateway_pago, a.estado
         FROM abonos a LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
        WHERE a.id = $1`,
      [ABONO_ID]
    );
    console.log('VERIFICACION FINAL:', after.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ROLLBACK -', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
