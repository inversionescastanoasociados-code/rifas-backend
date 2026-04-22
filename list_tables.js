const { Client } = require('pg');
const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function run() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
run();
