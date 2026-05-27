const { Client } = require('pg');
const cs = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';
(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  try {
    for (const t of ['boletas', 'ventas', 'abonos']) {
      const r = await c.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`, [t]);
      console.log(`\n--- ${t} ---`);
      console.table(r.rows);
    }
    const estados = await c.query(`SELECT DISTINCT estado FROM boletas ORDER BY 1`);
    console.log('\nEstados boletas:', estados.rows.map(r => r.estado));
    const estadosV = await c.query(`SELECT DISTINCT estado_venta FROM ventas ORDER BY 1`);
    console.log('Estados ventas:', estadosV.rows.map(r => r.estado_venta));
  } finally { await c.end(); }
})().catch(e => { console.error(e); process.exit(1); });
