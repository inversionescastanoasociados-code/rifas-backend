/**
 * Desactiva medios de pago excepto Efectivo, PSE y Cuenta extranjero.
 * Solo modifica medios_pago.activo — no toca ventas, abonos ni otros datos.
 *
 * Uso:
 *   node scripts/disable-medios-pago-excepto-pse-efectivo.js          (preview)
 *   node scripts/disable-medios-pago-excepto-pse-efectivo.js --apply  (aplica)
 */
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

const PERMITIDOS = [
  { id: 'd397d917-c0d0-4c61-b2b3-2ebfab7deeb7', nombre: 'Efectivo' },
  { id: 'db94562d-bb01-42a3-9414-6e369a1a70ba', nombre: 'PSE' },
  { id: 'c8f4e2a1-9b3d-4e7f-8c6d-5a4b3c2d1e0f', nombre: 'Cuenta extranjero' },
];

const APPLY = process.argv.includes('--apply');

async function listar(c, label) {
  const r = await c.query(`SELECT id, nombre, activo FROM medios_pago ORDER BY nombre`);
  console.log(`\n=== ${label} ===`);
  r.rows.forEach((row) => console.log(`  ${row.activo ? 'ACTIVO' : 'INACTIVO'} | ${row.nombre} (${row.id})`));
  return r.rows;
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await listar(c, 'ANTES');

    const idsPermitidos = PERMITIDOS.map((p) => p.id);

    const desactivar = await c.query(
      `UPDATE medios_pago SET activo = false
       WHERE id <> ALL($1::uuid[]) AND activo = true
       RETURNING id, nombre`,
      [idsPermitidos]
    );

    const activar = await c.query(
      `UPDATE medios_pago SET activo = true
       WHERE id = ANY($1::uuid[]) AND activo = false
       RETURNING id, nombre`,
      [idsPermitidos]
    );

    console.log(`\nA desactivar: ${desactivar.rowCount}`);
    desactivar.rows.forEach((r) => console.log(`  - ${r.nombre}`));
    console.log(`A reactivar (por si acaso): ${activar.rowCount}`);
    activar.rows.forEach((r) => console.log(`  + ${r.nombre}`));

    await listar(c, 'DESPUES (dentro de la transacción)');

    if (APPLY) {
      await c.query('COMMIT');
      console.log('\n✅ CAMBIOS APLICADOS. Solo se modificó medios_pago.activo.');
    } else {
      await c.query('ROLLBACK');
      console.log('\n🔍 PREVIEW con ROLLBACK. Ejecuta con --apply para confirmar.');
    }
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
}

main();
