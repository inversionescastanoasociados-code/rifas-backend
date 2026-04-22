const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ventas'");
    console.log('Columns in ventas:');
    console.table(res.rows.map(r => r.column_name));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
