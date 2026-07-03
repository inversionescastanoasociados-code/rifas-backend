/**
 * Segunda tanda: corrige el mismo bug (liberarBoletaManual no recalculaba
 * monto_total) pero en ventas de la rifa YA TERMINADA "EL GRAN CAMION"
 * (precio_boleta = 120.000, NO 130.000 — esa rifa tenía su propio precio).
 *
 * Estas 6 ventas quedaron con monto_total inflado (calculado para más
 * boletas de las que realmente tienen vinculadas hoy). En 5 de ellas las
 * boletas individuales YA estaban marcadas PAGADA (el cálculo por boleta es
 * independiente y correcto), pero la venta seguía en estado ABONADA con un
 * saldo_pendiente fantasma. Se corrige monto_total (recalculado con el
 * precio real de la rifa y el número de boletas realmente vinculadas) y,
 * solo cuando TODAS las boletas de la venta ya están PAGADA, se marca la
 * venta como PAGADA (consistente con el estado real de sus boletas).
 * No se toca abono_total (dinero real) ni ningún otro registro.
 *
 * Uso:
 *   node scripts/fix-precio-boletas-monto-incorrecto-rifa-anterior.js            (preview)
 *   node scripts/fix-precio-boletas-monto-incorrecto-rifa-anterior.js --apply    (aplica)
 */
const { Pool } = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';
const APPLY = process.argv.includes('--apply');

const TARGETS = [
  { venta_id: '9b424c11-bc34-4ddb-800e-20c78dcfe3b0', num_boletas_esperado: 2, monto_actual_esperado: 480000 },
  { venta_id: 'd2143994-9ba0-4d0d-b8a9-a61a16c157f7', num_boletas_esperado: 2, monto_actual_esperado: 360000 },
  { venta_id: '6da78605-2238-4ba7-95cb-f3d5fd54b2a1', num_boletas_esperado: 1, monto_actual_esperado: 240000 },
  { venta_id: 'c2111997-4663-4ddc-91aa-10feeaae00fd', num_boletas_esperado: 1, monto_actual_esperado: 360000 },
  { venta_id: 'd3d46a43-42df-4f7d-aab8-dcc9c8323037', num_boletas_esperado: 1, monto_actual_esperado: 240000 },
  { venta_id: '98002d79-8a27-48b3-8bea-0f87ad4b5559', num_boletas_esperado: 3, monto_actual_esperado: 720000 },
];

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log(`\n=== PREVIEW (${TARGETS.length} ventas objetivo, rifa EL GRAN CAMION $120.000) ===`);

    const previews = [];
    for (const t of TARGETS) {
      const res = await client.query(
        `SELECT
           v.id AS venta_id, v.monto_total, v.abono_total, v.saldo_pendiente, v.estado_venta,
           r.precio_boleta, r.nombre AS rifa,
           (SELECT COUNT(*) FROM boletas WHERE venta_id = v.id)::int AS num_boletas_actuales,
           (SELECT COUNT(*) FILTER (WHERE estado <> 'PAGADA') FROM boletas WHERE venta_id = v.id)::int AS num_boletas_no_pagadas,
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
      if (Number(row.precio_boleta) !== 120000) {
        throw new Error(`Venta ${t.venta_id}: precio_boleta inesperado (${row.precio_boleta}). Aborto por seguridad.`);
      }

      const precioBoleta = Number(row.precio_boleta);
      const nuevoMontoTotal = row.num_boletas_actuales * precioBoleta;
      const nuevoSaldo = Math.max(nuevoMontoTotal - Number(row.abono_total), 0);
      const todasPagadas = row.num_boletas_no_pagadas === 0;
      const nuevoEstadoVenta = todasPagadas ? 'PAGADA' : row.estado_venta;

      previews.push({
        venta_id: row.venta_id,
        rifa: row.rifa,
        numeros: row.numeros,
        monto_total_ANTES: Number(row.monto_total),
        monto_total_DESPUES: nuevoMontoTotal,
        abono_total: Number(row.abono_total),
        saldo_pendiente_ANTES: Number(row.saldo_pendiente),
        saldo_pendiente_DESPUES: nuevoSaldo,
        estado_venta_ANTES: row.estado_venta,
        estado_venta_DESPUES: nuevoEstadoVenta,
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

      const recheck = await client.query(
        `SELECT monto_total, abono_total, estado_venta,
                (SELECT COUNT(*) FROM boletas WHERE venta_id = ventas.id)::int AS num_boletas_actuales,
                (SELECT COUNT(*) FILTER (WHERE estado <> 'PAGADA') FROM boletas WHERE venta_id = ventas.id)::int AS num_boletas_no_pagadas
         FROM ventas WHERE id = $1`,
        [p.venta_id]
      );
      const r = recheck.rows[0];
      if (Number(r.monto_total) !== p.monto_total_ANTES || r.estado_venta !== p.estado_venta_ANTES) {
        throw new Error(`Venta ${p.venta_id} cambió entre preview y apply. Aborto.`);
      }

      const upd = await client.query(
        `UPDATE ventas
         SET monto_total = $2,
             estado_venta = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND monto_total = $4
           AND estado_venta = $5
         RETURNING id, monto_total, abono_total, saldo_pendiente, estado_venta`,
        [p.venta_id, p.monto_total_DESPUES, p.estado_venta_DESPUES, p.monto_total_ANTES, p.estado_venta_ANTES]
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
