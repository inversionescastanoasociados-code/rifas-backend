const { Client } = require('pg');

const connectionString = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

async function investigate() {
  const client = new Client({ connectionString });
  try {
    await client.connect();

    const boletas = [3162, 6115];

    const boletasRes = await client.query(
      'SELECT id, numero, venta_id FROM boletas WHERE numero = ANY($1)',
      [boletas]
    );

    console.log('Boletas encontradas:', boletasRes.rows.length);
    console.table(boletasRes.rows);

    const boletaIds = boletasRes.rows.map(r => r.id);
    const ventaIds = [...new Set(boletasRes.rows.map(r => r.venta_id))];

    if (ventaIds.length === 0) {
      console.log('No hay venta asociada a esas boletas.');
      return;
    }

    for (const ventaId of ventaIds) {
      const ventaRes = await client.query(
        'SELECT id, monto_total, abono_total, estado_venta, cliente_id FROM ventas WHERE id = $1',
        [ventaId]
      );
      const venta = ventaRes.rows[0];
      console.log('\n=== Venta ID:', ventaId, '===');
      console.log('Monto total:', venta.monto_total);
      console.log('Abono total (guardado):', venta.abono_total);
      console.log('Estado venta:', venta.estado_venta);

      const abonosRes = await client.query(
        `SELECT a.id, a.created_at, a.monto, a.medio_pago_id, mp.nombre as medio, a.gateway_pago, a.referencia, a.notas, a.estado, a.boleta_id, b.numero as boleta_numero
         FROM abonos a
         LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
         LEFT JOIN boletas b ON a.boleta_id = b.id
         WHERE a.venta_id = $1
         ORDER BY a.created_at ASC`,
        [ventaId]
      );

      console.log('Abonos encontrados para venta:', abonosRes.rows.length);
      console.table(abonosRes.rows.map(r => ({
        id: r.id,
        fecha: r.created_at,
        monto: r.monto,
        medio: r.medio || r.gateway_pago,
        referencia: r.referencia,
        estado: r.estado,
        boleta_numero: r.boleta_numero
      })));

      const suma = abonosRes.rows.reduce((s, r) => s + parseFloat(r.monto || 0), 0);
      console.log('Suma de abonos (venta):', suma);

      // Abonos por boleta
      if (boletaIds.length > 0) {
        const byBoletaRes = await client.query(
          `SELECT a.id, a.created_at, a.monto, a.estado, a.boleta_id, b.numero
           FROM abonos a
           LEFT JOIN boletas b ON a.boleta_id = b.id
           WHERE a.boleta_id = ANY($1)
           ORDER BY a.created_at ASC`,
          [boletaIds]
        );
        console.log('\nAbonos vinculados a las boletas solicitadas:', byBoletaRes.rows.length);
        console.table(byBoletaRes.rows.map(r => ({
          id: r.id,
          fecha: r.created_at,
          monto: r.monto,
          estado: r.estado,
          boleta: r.numero
        })));
      }

      // Buscar posibles duplicados por referencia/gateway en montos iguales
      const posiblesDup = abonosRes.rows.reduce((map, r) => {
        const key = `${r.monto}::${r.referencia || ''}::${r.gateway_pago || ''}`;
        if (!map[key]) map[key] = [];
        map[key].push(r);
        return map;
      }, {});

      const duplicados = Object.values(posiblesDup).filter(arr => arr.length > 1);
      if (duplicados.length > 0) {
        console.log('\nPosibles duplicados encontrados (mismo monto+referencia+gateway):');
        duplicados.forEach(group => console.table(group.map(r => ({id: r.id, fecha: r.created_at, monto: r.monto, referencia: r.referencia, gateway: r.gateway_pago, medio: r.medio}))));
      } else {
        console.log('\nNo se detectaron duplicados exactos por referencia/gateway.');
      }

      // Resumen final por venta
      console.log('\n--- Resumen Venta', ventaId, '---');
      console.log('Venta monto_total:', venta.monto_total);
      console.log('Venta abono_total:', venta.abono_total);
      console.log('Suma abonos reales:', suma);
      console.log('Diferencia (suma_abonos - monto_total):', suma - parseFloat(venta.monto_total || 0));
    }

  } catch (err) {
    console.error('Error investigando:', err);
  } finally {
    await client.end();
  }
}

investigate();
