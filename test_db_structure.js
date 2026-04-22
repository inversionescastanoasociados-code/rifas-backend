const { Client } = require('pg');

async function checkStructure() {
  const client = new Client({
    connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  });

  try {
    await client.connect();
    console.log('Conexion exitosa');

    const tables = ['abonos', 'medios_pago', 'ventas', 'venta_detalles', 'boletas', 'clientes', 'rifas'];
    for (const table of tables) {
      const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position;", [table]);
      
      console.log('--- Estructura de ' + table + ' ---');
      if (res.rows.length === 0) {
        console.log('Tabla no encontrada.');
      } else {
        res.rows.forEach(row => {
          console.log(row.column_name + ': ' + row.data_type);
        });
      }
    }

  } catch (err) {
    console.error('Error de conexion o consulta:', err);
  } finally {
    await client.end();
  }
}

checkStructure();
