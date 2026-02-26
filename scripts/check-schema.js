const { Pool } = require('pg');
const pool = new Pool({
  host: 'crossover.proxy.rlwy.net', port: 34599, database: 'railway',
  user: 'postgres', password: 'iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ', ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Estructura de ventas
    console.log('=== COLUMNAS DE VENTAS ===');
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default, generation_expression 
      FROM information_schema.columns 
      WHERE table_name = 'ventas' 
      ORDER BY ordinal_position
    `);
    cols.rows.forEach(c => {
      const gen = c.generation_expression ? ` [GENERATED: ${c.generation_expression}]` : '';
      const def = c.column_default ? ` [DEFAULT: ${c.column_default}]` : '';
      console.log(`  ${c.column_name} (${c.data_type})${gen}${def} ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });

    // Medios de pago
    console.log('\n=== MEDIOS DE PAGO ===');
    const mp = await pool.query('SELECT * FROM medios_pago ORDER BY nombre');
    if (mp.rows.length === 0) {
      console.log('  (tabla vacía)');
    } else {
      console.table(mp.rows);
    }

    // Intentar insert de prueba en ventas para ver el error exacto
    console.log('\n=== TEST INSERT VENTAS (dry run) ===');
    try {
      await pool.query('BEGIN');
      const test = await pool.query(`
        INSERT INTO ventas (rifa_id, cliente_id, monto_total, abono_total, estado_venta, es_venta_online)
        VALUES ('a7ed3394-bc23-4646-8b75-473d18c3a0a1', '5ca52891-1dcf-4c3c-9ef8-918c4def8061', 240000, 0, 'PENDIENTE', true)
        RETURNING id, monto_total, abono_total, saldo_pendiente, estado_venta
      `);
      console.log('  Insert OK:', test.rows[0]);
      await pool.query('ROLLBACK'); // No guardar
    } catch (e) {
      console.log('  Insert error:', e.message);
      await pool.query('ROLLBACK');
    }

  } catch(err) {
    console.error('ERROR:', err.message);
  } finally {
    await pool.end();
  }
})();
