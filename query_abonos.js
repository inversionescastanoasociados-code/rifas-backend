const { Client } = require('pg');

async function queryAbonos() {
  const client = new Client({
    connectionString: 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway',
  });

  try {
    await client.connect();
    
    const query = "SELECT a.id AS abono_id, a.created_at, a.monto, a.venta_id, a.boleta_id, a.medio_pago_id, mp.nombre AS medio_pago_nombre, a.referencia, a.notas, a.estado, v.monto_total AS venta_total, v.abono_total AS venta_abono_total, c.nombre AS cliente_nombre, r.nombre AS rifa_nombre, b.numero AS boleta_numero FROM abonos a LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id LEFT JOIN ventas v ON a.venta_id = v.id LEFT JOIN clientes c ON v.cliente_id = c.id LEFT JOIN rifas r ON v.rifa_id = r.id LEFT JOIN boletas b ON a.boleta_id = b.id WHERE a.monto = 60000 ORDER BY a.created_at DESC;";

    const res = await client.query(query);
    
    console.log('Registros encontrados: ' + res.rows.length);
    if (res.rows.length > 0) {
      console.log('--- Listado de Abonos (60000) ---');
      res.rows.forEach(row => {
        const medio = row.medio_pago_nombre || (row.medio_pago_id ? 'ID: ' + row.medio_pago_id : 'N/A');
        console.log('ID: ' + row.abono_id + ' | Fecha: ' + row.created_at.toISOString() + ' | Monto: ' + row.monto + ' | Medio: ' + medio + ' | Cliente: ' + (row.cliente_nombre || 'N/A') + ' | Boleta #' + (row.boleta_numero || 'N/A') + ' | Estado: ' + row.estado);
      });
      
      const nulos = res.rows.filter(r => r.medio_pago_id && !r.medio_pago_nombre);
      if (nulos.length > 0) {
        console.log('\n--- Alerta: Abonos con medio_pago_id pero sin nombre de medio ---');
        nulos.forEach(n => console.log('Abono ID: ' + n.abono_id + ' | Medio Pago ID: ' + n.medio_pago_id));
      }
    }

  } catch (err) {
    console.error('Error en la consulta:', err);
  } finally {
    await client.end();
  }
}

queryAbonos();
