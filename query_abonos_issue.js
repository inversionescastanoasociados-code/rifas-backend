const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const totalResult = await client.query("SELECT COUNT(*) FROM abonos WHERE monto = 60000");
    console.log("Cantidad total de abonos de 60000: " + totalResult.rows[0].count);

    const checkMetodos = await client.query(`
      SELECT a.id, a.medio_pago_id, mp.nombre 
      FROM abonos a
      LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
      WHERE a.monto = 60000
      LIMIT 5
    `);
    console.log("Muestra de abonos de 60000 y sus métodos:");
    console.table(checkMetodos.rows);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
