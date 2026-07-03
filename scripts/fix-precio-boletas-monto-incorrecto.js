/**
 * Corrige ventas cuyo monto_total quedó desactualizado porque se liberó
 * manualmente UNA boleta de una venta con varias boletas (liberarBoletaManual
 * no recalculaba monto_total). Esto hacía que boletas de $130.000 aparecieran
 * con precio de $260.000 (o $390.000, etc).
 *
 * SOLO corrige ventas explícitamente listadas en TARGETS (verificadas a mano),
 * recalculando monto_total = num_boletas_actuales_vinculadas x precio_boleta
 * de su propia rifa, y saldo_pendiente = monto_total - abono_total.
 * No toca abono_total (dinero real recibido) ni ningún otro campo/registro.
 *
 * Uso:
 *   node scripts/fix-precio-boletas-monto-incorrecto.js            (preview)
 *   node scripts/fix-precio-boletas-monto-incorrecto.js --apply    (aplica)
 */
const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';
const APPLY = process.argv.includes('--apply');

// Ventas de la rifa ACTIVA (PROYECTO 2 EL GRAN CAMION, precio_boleta=130000)
// con monto_total desactualizado tras liberar boletas manualmente.
const TARGETS = [
  { venta_id: '43aeef3c-a9d3-41f1-8749-02182f0805d3', num_boletas_esperado: 1, monto_actual_esperado: 260000 },
  { venta_id: '8321f33a-d9ce-4dda-857e-d144e5fc03e2', num_boletas_esperado: 2, monto_actual_esperado: 390000 },
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log(`\n=== PREVIEW (${TARGETS.length} ventas objetivo) ===`);

    const previews = [];
    for (const t of TARGETS) {
      const res = await client.query(
        `SELECT
           v.id AS venta_id, v.monto_total, v.abono_total, v.saldo_pendiente, v.estado_venta,
           r.precio_boleta, r.nombre AS rifa,
           (SELECT COUNT(*) FROM boletas WHERE venta_id = v.id)::int AS num_boletas_actuales,
           (SELECT array_agg(numero ORDER BY numero) FROM boletas WHERE venta_id = v.id) AS numeros
         FROM ventas v
         JOIN rifas r ON r.id = v.rifa_id
         WHERE v.id = $1`,
        [t.venta_id]
      );
      if (res.rows.length !== 1) throw new Error(`Venta no encontrada: ${t.venta_id}`);
      const row = res.rows[0];

      if (row.num_boletas_actuales !== t.num_boletas_esperado) {
        throw new Error(
          `Venta ${t.venta_id}: num_boletas_actuales=${row.num_boletas_actuales}, esperado=${t.num_boletas_esperado}. Aborto por seguridad.`
        );
      }
      if (Number(row.monto_total) !== t.monto_actual_esperado) {
        throw new Error(
          `Venta ${t.venta_id}: monto_total=${row.monto_total}, esperado=${t.monto_actual_esperado}. Aborto por seguridad.`
        );
      }

      const precioBoleta = Number(row.precio_boleta);
      const nuevoMontoTotal = row.num_boletas_actuales * precioBoleta;
      const nuevoSaldo = Math.max(nuevoMontoTotal - Number(row.abono_total), 0);

      previews.push({
        venta_id: row.venta_id,
        rifa: row.rifa,
        numeros: row.numeros,
        monto_total_ANTES: Number(row.monto_total),
        monto_total_DESPUES: nuevoMontoTotal,
        abono_total: Number(row.abono_total),
        saldo_pendiente_ANTES: Number(row.saldo_pendiente),
        saldo_pendiente_DESPUES: nuevoSaldo,
        estado_venta: row.estado_venta,
      });
    }
    console.table(previews);

    if (!APPLY) {
      console.log('\nPreview OK. Ejecutar con --apply para corregir.');
      return;
    }

    await client.query('BEGIN');

    const resultados = [];
    for (const p of previews) {
      const lock = await client.query(`SELECT id FROM ventas WHERE id = $1 FOR UPDATE`, [p.venta_id]);
      if (lock.rowCount !== 1) throw new Error(`No se pudo bloquear venta ${p.venta_id}`);

      // Re-verificar dentro de la transacción (evitar condiciones de carrera)
      const recheck = await client.query(
        `SELECT monto_total, abono_total,
                (SELECT COUNT(*) FROM boletas WHERE venta_id = ventas.id)::int AS num_boletas_actuales
         FROM ventas WHERE id = $1`,
        [p.venta_id]
      );
      const r = recheck.rows[0];
      if (Number(r.monto_total) !== p.monto_total_ANTES) {
        throw new Error(`Venta ${p.venta_id} cambió de monto_total entre preview y apply. Aborto.`);
      }

      // saldo_pendiente es columna generada (monto_total - abono_total); se
      // recalcula sola al actualizar monto_total, no se puede escribir directo.
      const upd = await client.query(
        `UPDATE ventas
         SET monto_total = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND monto_total = $3
         RETURNING id, monto_total, abono_total, saldo_pendiente, estado_venta`,
        [p.venta_id, p.monto_total_DESPUES, p.monto_total_ANTES]
      );

      if (upd.rowCount !== 1) throw new Error(`UPDATE no afectó 1 fila para venta ${p.venta_id}`);
      resultados.push(upd.rows[0]);
    }

    await client.query('COMMIT');
    console.log('\n=== DESPUÉS (aplicado) ===');
    console.table(resultados);
    console.log(`\n✅ COMMIT — ${resultados.length} ventas corregidas.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ ROLLBACK — nada se modificó. Motivo:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
