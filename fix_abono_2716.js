const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

// Boleta 2716 - EL GRAN CAMION
const ABONO_ID_ANULAR = 'd7e6ac2c-8ddb-4b3f-946d-1fa2156e3849'; // 60.000, 2026-03-18 08:24, PSE - SEGUNDO/DUPLICADO
const ABONO_ID_KEEP   = '7e89b833-0584-4e2e-980b-67180b7cbb17'; // 60.000, 2026-03-15, PSE - PRIMERO
const VENTA_ID        = '4c73c2bf-fc46-4bdc-83ca-b5787ef58819';
const BOLETA_ID       = 'dc8fe7e3-da29-4ece-923d-c5ec3bd419f3';
const CLIENTE_ID      = '1853d0dc-1caf-425e-b0b1-4f92f60a675b';
const BLOQUEO_HASTA   = '2026-06-21T04:59:59.000Z';

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
    if (parseFloat(r.monto) !== 60000)   throw new Error(`monto inesperado: ${r.monto}`);
    if (r.estado !== 'CONFIRMADO')       throw new Error(`estado inesperado: ${r.estado}`);
    if (r.gateway_pago !== 'PSE')        throw new Error(`gateway_pago inesperado: ${r.gateway_pago}`);

    // Validar que el abono que se conserva existe y es CONFIRMADO 60.000
    const keep = await c.query(
      `SELECT id, monto, estado FROM abonos WHERE id = $1`,
      [ABONO_ID_KEEP]
    );
    if (keep.rows.length !== 1) throw new Error('Abono a conservar no encontrado');
    if (parseFloat(keep.rows[0].monto) !== 60000) throw new Error('Monto del abono a conservar inesperado');
    if (keep.rows[0].estado !== 'CONFIRMADO')     throw new Error('Estado del abono a conservar inesperado');

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

    // 3) Anular el abono duplicado
    //    El trigger recalcula ventas.abono_total y cambia estado_venta PAGADA->ABONADA,
    //    lo que dispara el trigger que pondria boletas a DISPONIBLE / venta_id=NULL.
    //    Restauramos la boleta a continuacion dentro de la misma transaccion.
    const upd = await c.query(
      `UPDATE abonos
          SET estado = 'ANULADO'::estado_abono,
              notas  = COALESCE(notas, '') || ' | ANULADO 2026-05-09: abono PSE duplicado (segundo de dos pagos identicos de 60.000), se conserva abono inicial id 7e89b833-0584-4e2e-980b-67180b7cbb17'
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
    if (parseFloat(ventaPost.rows[0].abono_total) !== 60000) {
      throw new Error(`abono_total esperado 60000, obtenido ${ventaPost.rows[0].abono_total}`);
    }

    // 5) Restaurar boleta a RESERVADA (segun instruccion del usuario)
    //    El trigger pudo haber puesto estado=DISPONIBLE, venta_id=NULL, cliente_id=NULL.
    const boletaPostTrigger = await c.query(
      `SELECT id, estado, venta_id, cliente_id, bloqueo_hasta
         FROM boletas WHERE id = $1`,
      [BOLETA_ID]
    );
    console.log('BOLETA POST-TRIGGER (antes de restaurar):', boletaPostTrigger.rows[0]);

    const updBoleta = await c.query(
      `UPDATE boletas
          SET estado        = 'RESERVADA'::estado_boleta,
              venta_id      = $2,
              cliente_id    = $3,
              bloqueo_hasta = $4
        WHERE id = $1
        RETURNING id, numero, estado, venta_id, cliente_id, bloqueo_hasta`,
      [BOLETA_ID, VENTA_ID, CLIENTE_ID, BLOQUEO_HASTA]
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
    if (confirmados.length !== 1) throw new Error(`Esperado 1 abono CONFIRMADO, hay ${confirmados.length}`);
    if (parseFloat(confirmados[0].monto) !== 60000) throw new Error('Abono CONFIRMADO no es 60000');

    await c.query('COMMIT');
    console.log('\n✅ COMMIT OK\n');

    // 7) Reporte final
    const finalVenta = await c.query(
      `SELECT id, monto_total, abono_total, saldo_pendiente, estado_venta
         FROM ventas WHERE id = $1`,
      [VENTA_ID]
    );
    console.log('VENTA FINAL:', finalVenta.rows[0]);

    const finalBoleta = await c.query(
      `SELECT id, numero, estado, venta_id, cliente_id, bloqueo_hasta
         FROM boletas WHERE id = $1`,
      [BOLETA_ID]
    );
    console.log('BOLETA FINAL:', finalBoleta.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('❌ ROLLBACK -', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
