const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

// Boleta 8205 - EL GRAN CAMION
const ABONO_ID_ANULAR = '9d11fbd6-db6f-4603-987c-8847f5f460c3'; // 30.000 PSE 2026-05-09 23:35 (6:35pm CO) - tercer abono duplicado
const VENTA_ID        = 'd2153347-f940-4c94-80f9-4ce32d61c838';
const BOLETA_ID       = 'd35892f1-3f06-41fa-9dc4-6d175c75cd53';
const CLIENTE_ID      = 'a9fa1fff-87ae-4f94-bb9f-c4dd5ee668ef';

(async () => {
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query('BEGIN');

    // 1) Validar abono a anular
    const before = await c.query(
      `SELECT id, monto, estado, venta_id, boleta_id, gateway_pago, created_at, notas
         FROM abonos WHERE id = $1 FOR UPDATE`,
      [ABONO_ID_ANULAR]
    );
    if (before.rows.length !== 1) throw new Error('Abono a anular no encontrado');
    const r = before.rows[0];
    console.log('ABONO ANTES:', r);

    if (r.venta_id !== VENTA_ID)         throw new Error(`venta_id no coincide: ${r.venta_id}`);
    if (r.boleta_id !== BOLETA_ID)       throw new Error(`boleta_id no coincide: ${r.boleta_id}`);
    if (parseFloat(r.monto) !== 30000)   throw new Error(`monto inesperado: ${r.monto}`);
    if (r.estado !== 'CONFIRMADO')       throw new Error(`estado inesperado: ${r.estado}`);
    if (r.gateway_pago !== 'PSE')        throw new Error(`gateway_pago inesperado: ${r.gateway_pago}`);

    // 2) Snapshot boleta y venta antes
    const boletaBefore = await c.query(
      `SELECT id, numero, estado, venta_id, cliente_id, bloqueo_hasta
         FROM boletas WHERE id = $1 FOR UPDATE`,
      [BOLETA_ID]
    );
    console.log('BOLETA ANTES:', boletaBefore.rows[0]);

    const ventaBefore = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA ANTES:', ventaBefore.rows[0]);

    // 3) Anular el abono PSE duplicado
    const upd = await c.query(
      `UPDATE abonos
          SET estado = 'ANULADO'::estado_abono,
              notas  = COALESCE(notas, '') || ' | ANULADO 2026-05-11: abono PSE duplicado de 30.000 (segundo PSE del 2026-05-09 18:35), boleta queda con 90.000 abonados (60k Efectivo + 30k PSE)'
        WHERE id = $1
          AND estado = 'CONFIRMADO'::estado_abono
        RETURNING id, monto, estado, notas`,
      [ABONO_ID_ANULAR]
    );
    if (upd.rowCount !== 1) throw new Error(`Update afecto ${upd.rowCount} filas, esperado 1`);
    console.log('ABONO DESPUES:', upd.rows[0]);

    // 4) Verificar venta tras trigger
    const ventaPost = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA POST-TRIGGER:', ventaPost.rows[0]);
    if (parseFloat(ventaPost.rows[0].abono_total) !== 90000) {
      throw new Error(`abono_total esperado 90000, obtenido ${ventaPost.rows[0].abono_total}`);
    }

    // 5) Restaurar boleta a ABONADA si el trigger la cambio
    const boletaPostTrigger = await c.query(
      `SELECT id, estado, venta_id, cliente_id, bloqueo_hasta
         FROM boletas WHERE id = $1`,
      [BOLETA_ID]
    );
    console.log('BOLETA POST-TRIGGER (antes de restaurar):', boletaPostTrigger.rows[0]);

    const updBoleta = await c.query(
      `UPDATE boletas
          SET estado     = 'ABONADA'::estado_boleta,
              venta_id   = $2,
              cliente_id = $3
        WHERE id = $1
        RETURNING id, numero, estado, venta_id, cliente_id, bloqueo_hasta`,
      [BOLETA_ID, VENTA_ID, CLIENTE_ID]
    );
    if (updBoleta.rowCount !== 1) throw new Error(`Update boleta afecto ${updBoleta.rowCount} filas`);
    console.log('BOLETA DESPUES:', updBoleta.rows[0]);

    // 6) Verificacion final pre-commit
    const finalAbonos = await c.query(
      `SELECT a.id, a.created_at, a.monto, a.gateway_pago, a.estado
         FROM abonos a
        WHERE a.venta_id = $1
        ORDER BY a.created_at`,
      [VENTA_ID]
    );
    console.log('--- ABONOS FINALES ---');
    console.table(finalAbonos.rows);

    const confirmados = finalAbonos.rows.filter(a => a.estado === 'CONFIRMADO');
    const sumaConfirmados = confirmados.reduce((s, a) => s + parseFloat(a.monto), 0);
    if (sumaConfirmados !== 90000) {
      throw new Error(`Suma esperada 90000, obtenido ${sumaConfirmados}`);
    }
    if (confirmados.length !== 2) {
      throw new Error(`Esperado 2 abonos CONFIRMADO, hay ${confirmados.length}`);
    }

    if (process.env.COMMIT === '1') {
      await c.query('COMMIT');
      console.log('\n✅ COMMIT aplicado.');
    } else {
      await c.query('ROLLBACK');
      console.log('\n🔁 DRY-RUN (ROLLBACK). Re-ejecuta con COMMIT=1 para aplicar.');
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('ERROR, ROLLBACK:', e);
    process.exit(1);
  } finally {
    await c.end();
  }
})();
