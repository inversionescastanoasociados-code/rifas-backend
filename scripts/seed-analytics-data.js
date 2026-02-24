/**
 * SCRIPT DE DATOS PARA ANALYTICS - RIFAS SYSTEM
 * 
 * Inserta ventas y abonos distribuidos en las últimas 6 semanas
 * con diferentes medios de pago para alimentar las gráficas de analytics.
 * 
 * - Serie diaria con tendencia creciente + variación realista
 * - Mix de métodos de pago (Efectivo, Nequi, PSE, Tarjeta Crédito)
 * - Boletas en estados variados (PAGADA, ABONADA, RESERVADA)
 * - Días sin ventas para ver "huecos" en la gráfica
 * 
 * Ejecutar: node scripts/seed-analytics-data.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'crossover.proxy.rlwy.net',
  port: process.env.DB_PORT || 34599,
  database: process.env.DB_NAME || 'railway',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ',
});

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    console.log('🚀 Iniciando inserción de datos para ANALYTICS...\n');

    // ============================================
    // 1. Obtener datos existentes
    // ============================================
    const userRes = await client.query(`SELECT id FROM usuarios WHERE activo = true LIMIT 1`);
    if (!userRes.rows.length) throw new Error('No hay usuarios activos');
    const adminId = userRes.rows[0].id;
    console.log(`✅ Admin: ${adminId}`);

    const mediosRes = await client.query(`SELECT id, nombre FROM medios_pago WHERE activo = true`);
    const medios = {};
    for (const m of mediosRes.rows) {
      const key = m.nombre.toLowerCase().replace(/\s+/g, '_').replace(/é/g, 'e');
      medios[key] = m;
    }
    console.log(`✅ Medios de pago: ${Object.keys(medios).join(', ')}`);

    // Buscar las 2 rifas que insertamos antes (o cualquier rifa ACTIVA)
    const rifasRes = await client.query(`
      SELECT id, nombre, precio_boleta, total_boletas 
      FROM rifas 
      WHERE estado = 'ACTIVA' 
      ORDER BY created_at DESC 
      LIMIT 2
    `);
    if (!rifasRes.rows.length) throw new Error('No hay rifas activas');
    const rifas = rifasRes.rows;
    console.log(`✅ Rifas encontradas: ${rifas.map(r => `${r.nombre} ($${Number(r.precio_boleta).toLocaleString()})`).join(', ')}`);

    // Obtener clientes existentes
    const clientesRes = await client.query(`SELECT id, nombre FROM clientes ORDER BY created_at DESC LIMIT 15`);
    const clientes = clientesRes.rows;
    console.log(`✅ Clientes: ${clientes.length}`);

    // Obtener medio de pago por nombre parcial
    const getMedio = (nombre) => {
      const found = Object.values(medios).find(m => 
        m.nombre.toLowerCase().includes(nombre.toLowerCase())
      );
      return found || Object.values(medios)[0];
    };

    const efectivo = getMedio('efectivo');
    const nequi = getMedio('nequi');
    const pse = getMedio('pse');
    const tarjeta = getMedio('tarjeta') || getMedio('credito') || efectivo;

    console.log(`\n💳 Medios a usar: ${efectivo.nombre}, ${nequi.nombre}, ${pse.nombre}, ${tarjeta.nombre}`);

    // ============================================
    // 2. Generar fechas de las últimas 6 semanas
    // ============================================
    const hoy = new Date('2026-02-24');
    const generarFecha = (diasAtras, hora = 10) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() - diasAtras);
      d.setHours(hora, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60));
      return d.toISOString();
    };

    // ============================================
    // 3. Plan de ventas por día (últimas 6 semanas)
    // ============================================
    // Estructura: { diasAtras, rifaIdx, clienteIdx, cantBoletas, estadoVenta, estadoBoleta, abonoPercent, medioPago, hora }
    const planVentas = [
      // ---- SEMANA 6 (hace ~42-36 días) - Arranque lento ----
      { dias: 42, rifaIdx: 0, clienteIdx: 0, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 9 },
      { dias: 40, rifaIdx: 0, clienteIdx: 1, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 50, medio: nequi, hora: 14 },
      { dias: 38, rifaIdx: 1, clienteIdx: 2, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 11 },
      
      // ---- SEMANA 5 (hace ~35-29 días) - Crece un poco ----
      { dias: 35, rifaIdx: 0, clienteIdx: 3, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 10 },
      { dias: 34, rifaIdx: 1, clienteIdx: 4, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 16 },
      { dias: 33, rifaIdx: 0, clienteIdx: 5, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 60, medio: efectivo, hora: 12 },
      { dias: 31, rifaIdx: 1, clienteIdx: 6, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 15 },
      { dias: 29, rifaIdx: 0, clienteIdx: 7, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 40, medio: tarjeta, hora: 9 },

      // ---- SEMANA 4 (hace ~28-22 días) - Ritmo constante ----
      { dias: 28, rifaIdx: 0, clienteIdx: 8, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 10 },
      { dias: 27, rifaIdx: 1, clienteIdx: 9, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 11 },
      { dias: 26, rifaIdx: 0, clienteIdx: 10, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 14 },
      { dias: 25, rifaIdx: 1, clienteIdx: 11, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 70, medio: efectivo, hora: 16 },
      { dias: 24, rifaIdx: 0, clienteIdx: 12, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 13 },
      { dias: 23, rifaIdx: 1, clienteIdx: 13, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: tarjeta, hora: 10 },
      { dias: 22, rifaIdx: 0, clienteIdx: 14, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 30, medio: efectivo, hora: 17 },

      // ---- SEMANA 3 (hace ~21-15 días) - Pico de ventas ----
      { dias: 21, rifaIdx: 0, clienteIdx: 0, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 9 },
      { dias: 21, rifaIdx: 1, clienteIdx: 1, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 15 },
      { dias: 20, rifaIdx: 0, clienteIdx: 2, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 10 },
      { dias: 19, rifaIdx: 1, clienteIdx: 3, cant: 2, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 80, medio: nequi, hora: 12 },
      { dias: 18, rifaIdx: 0, clienteIdx: 4, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 11 },
      { dias: 18, rifaIdx: 1, clienteIdx: 5, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: tarjeta, hora: 16 },
      { dias: 17, rifaIdx: 0, clienteIdx: 6, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 14 },
      { dias: 16, rifaIdx: 1, clienteIdx: 7, cant: 4, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 10 },
      { dias: 15, rifaIdx: 0, clienteIdx: 8, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 55, medio: pse, hora: 13 },

      // ---- SEMANA 2 (hace ~14-8 días) - Se mantiene alto ----
      { dias: 14, rifaIdx: 0, clienteIdx: 9, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 9 },
      { dias: 14, rifaIdx: 1, clienteIdx: 10, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 17 },
      { dias: 13, rifaIdx: 0, clienteIdx: 11, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 65, medio: tarjeta, hora: 11 },
      { dias: 12, rifaIdx: 1, clienteIdx: 12, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 14 },
      { dias: 11, rifaIdx: 0, clienteIdx: 13, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 10 },
      { dias: 10, rifaIdx: 1, clienteIdx: 14, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 45, medio: efectivo, hora: 15 },
      { dias: 9, rifaIdx: 0, clienteIdx: 0, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 12 },
      { dias: 8, rifaIdx: 1, clienteIdx: 1, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 9 },

      // ---- SEMANA 1 (últimos 7 días) - Fuerte cierre ----
      { dias: 7, rifaIdx: 0, clienteIdx: 2, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: tarjeta, hora: 10 },
      { dias: 7, rifaIdx: 1, clienteIdx: 3, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 16 },
      { dias: 6, rifaIdx: 0, clienteIdx: 4, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 11 },
      { dias: 6, rifaIdx: 1, clienteIdx: 5, cant: 2, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 75, medio: pse, hora: 14 },
      { dias: 5, rifaIdx: 0, clienteIdx: 6, cant: 4, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 9 },
      { dias: 4, rifaIdx: 1, clienteIdx: 7, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 13 },
      { dias: 4, rifaIdx: 0, clienteIdx: 8, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 35, medio: tarjeta, hora: 17 },
      { dias: 3, rifaIdx: 1, clienteIdx: 9, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 10 },
      { dias: 3, rifaIdx: 0, clienteIdx: 10, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 15 },
      { dias: 2, rifaIdx: 1, clienteIdx: 11, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: efectivo, hora: 11 },
      { dias: 2, rifaIdx: 0, clienteIdx: 12, cant: 3, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 14 },
      { dias: 1, rifaIdx: 1, clienteIdx: 13, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: tarjeta, hora: 9 },
      { dias: 1, rifaIdx: 0, clienteIdx: 14, cant: 1, eVenta: 'ABONADA', eBoleta: 'ABONADA', abono: 50, medio: efectivo, hora: 16 },
      { dias: 0, rifaIdx: 0, clienteIdx: 0, cant: 2, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: nequi, hora: 10 },
      { dias: 0, rifaIdx: 1, clienteIdx: 1, cant: 1, eVenta: 'PAGADA', eBoleta: 'PAGADA', abono: 100, medio: pse, hora: 12 },
    ];

    console.log(`\n📅 Plan de ventas: ${planVentas.length} operaciones en ${new Set(planVentas.map(p => p.dias)).size} días distintos`);

    // ============================================
    // 4. Necesitamos boletas DISPONIBLES por rifa
    // ============================================
    const boletasDisponibles = {};
    for (const rifa of rifas) {
      const bolRes = await client.query(
        `SELECT id, numero FROM boletas WHERE rifa_id = $1 AND estado = 'DISPONIBLE' ORDER BY numero ASC`,
        [rifa.id]
      );
      boletasDisponibles[rifa.id] = bolRes.rows;
      console.log(`   🎫 Rifa "${rifa.nombre}": ${bolRes.rows.length} boletas disponibles`);
    }

    // ============================================
    // 5. Ejecutar plan de ventas
    // ============================================
    console.log('\n💰 Insertando ventas y abonos con fechas distribuidas...\n');

    let totalVentas = 0;
    let totalAbonos = 0;
    let totalRecaudo = 0;
    const recaudoPorMedio = {};
    const recaudoPorDia = {};

    for (const plan of planVentas) {
      const rifa = rifas[plan.rifaIdx % rifas.length];
      const clienteData = clientes[plan.clienteIdx % clientes.length];
      const precio = Number(rifa.precio_boleta);
      const disponibles = boletasDisponibles[rifa.id];

      if (disponibles.length < plan.cant) {
        console.log(`   ⚠️  Saltando: no hay ${plan.cant} boletas disponibles para "${rifa.nombre}"`);
        continue;
      }

      // Tomar las primeras N boletas disponibles
      const boletasAsignar = disponibles.splice(0, plan.cant);
      const montoTotal = precio * plan.cant;
      const abonoTotal = Math.round(montoTotal * (plan.abono / 100));
      const fechaCreacion = generarFecha(plan.dias, plan.hora);

      // Crear venta con fecha personalizada
      const ventaRes = await client.query(
        `INSERT INTO ventas (rifa_id, cliente_id, vendedor_id, monto_total, abono_total, estado_venta, medio_pago_id, gateway_pago, es_venta_admin, notas_admin, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $10)
         RETURNING id`,
        [rifa.id, clienteData.id, adminId, montoTotal, abonoTotal, plan.eVenta, plan.medio.id, plan.medio.nombre, `Venta analytics - ${plan.medio.nombre}`, fechaCreacion]
      );
      const ventaId = ventaRes.rows[0].id;
      totalVentas++;

      // Actualizar boletas y crear abonos
      for (const boleta of boletasAsignar) {
        await client.query(
          `UPDATE boletas SET estado = $1, cliente_id = $2, vendido_por = $3, venta_id = $4, updated_at = $5
           WHERE id = $6`,
          [plan.eBoleta, clienteData.id, adminId, ventaId, fechaCreacion, boleta.id]
        );

        if (abonoTotal > 0) {
          const montoPorBoleta = Math.round(abonoTotal / plan.cant);
          await client.query(
            `INSERT INTO abonos (venta_id, boleta_id, monto, estado, medio_pago_id, gateway_pago, moneda, registrado_por, notas, created_at)
             VALUES ($1, $2, $3, 'CONFIRMADO', $4, $5, 'COP', $6, $7, $8)`,
            [ventaId, boleta.id, montoPorBoleta, plan.medio.id, plan.medio.nombre, adminId, `Pago ${plan.medio.nombre}`, fechaCreacion]
          );
          totalAbonos++;
          totalRecaudo += montoPorBoleta;

          // Rastrear por medio
          const medioNombre = plan.medio.nombre;
          recaudoPorMedio[medioNombre] = (recaudoPorMedio[medioNombre] || 0) + montoPorBoleta;

          // Rastrear por día
          const diaKey = fechaCreacion.split('T')[0];
          recaudoPorDia[diaKey] = (recaudoPorDia[diaKey] || 0) + montoPorBoleta;
        }
      }

      const fechaCorta = fechaCreacion.split('T')[0];
      console.log(`   ✅ ${fechaCorta} | ${clienteData.nombre.split(' ').slice(0,2).join(' ')} | ${plan.cant} boleta(s) ${plan.eBoleta} | $${abonoTotal.toLocaleString()} ${plan.medio.nombre} | ${rifa.nombre.substring(0, 20)}...`);
    }

    // ============================================
    // 6. Actualizar contadores de rifas
    // ============================================
    console.log('\n📊 Actualizando contadores...');
    for (const rifa of rifas) {
      const countRes = await client.query(
        `SELECT COUNT(*) FILTER (WHERE estado != 'DISPONIBLE') AS vendidas FROM boletas WHERE rifa_id = $1`,
        [rifa.id]
      );
      await client.query(
        `UPDATE rifas SET boletas_vendidas = $1 WHERE id = $2`,
        [parseInt(countRes.rows[0].vendidas), rifa.id]
      );
    }

    // ============================================
    // 7. COMMIT
    // ============================================
    await client.query('COMMIT');

    // ============================================
    // 8. Resumen
    // ============================================
    console.log('\n' + '='.repeat(65));
    console.log('🎉 DATOS DE ANALYTICS INSERTADOS EXITOSAMENTE');
    console.log('='.repeat(65));
    console.log(`\n📋 RESUMEN GENERAL:`);
    console.log(`   🛒 ${totalVentas} ventas creadas`);
    console.log(`   💵 ${totalAbonos} abonos registrados (CONFIRMADO)`);
    console.log(`   💰 Recaudo total: $${totalRecaudo.toLocaleString('es-CO')}`);

    console.log(`\n💳 RECAUDO POR MEDIO DE PAGO:`);
    const mediosSorted = Object.entries(recaudoPorMedio).sort((a, b) => b[1] - a[1]);
    for (const [medio, monto] of mediosSorted) {
      const pct = ((monto / totalRecaudo) * 100).toFixed(1);
      console.log(`   ${medio}: $${monto.toLocaleString('es-CO')} (${pct}%)`);
    }

    console.log(`\n📈 SERIE DIARIA (recaudo por día):`);
    const diasSorted = Object.entries(recaudoPorDia).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [dia, monto] of diasSorted) {
      const barLen = Math.round(monto / (totalRecaudo / 30));
      const bar = '█'.repeat(Math.min(barLen, 30));
      console.log(`   ${dia}: $${monto.toLocaleString('es-CO').padStart(12)} ${bar}`);
    }

    console.log(`\n📅 Rango de fechas: ${diasSorted[0]?.[0]} → ${diasSorted[diasSorted.length - 1]?.[0]}`);
    console.log(`   Días con ventas: ${diasSorted.length}`);
    console.log(`\n🔗 Abre Analytics en la app y filtra por rifa y fechas!`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
