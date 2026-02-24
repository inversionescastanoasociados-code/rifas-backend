/**
 * SCRIPT DE DATOS DE PRUEBA - RIFAS SYSTEM
 * 
 * Inserta datos dummy realistas para probar todo el sistema:
 * - 15 clientes colombianos
 * - 2 rifas activas (una premium, una económica)  
 * - Boletas en diferentes estados (PAGADA, ABONADA, RESERVADA, DISPONIBLE)
 * - Ventas con distintos estados
 * - Abonos parciales y completos
 * - Historial de pagos variado
 * 
 * Ejecutar: node scripts/seed-dummy-data.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'crossover.proxy.rlwy.net',
  port: process.env.DB_PORT || 34599,
  database: process.env.DB_NAME || 'railway',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ',
});

async function q(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function seed() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('🚀 Iniciando inserción de datos dummy...\n');

    // ============================================
    // 1. Obtener usuario admin existente y medios de pago
    // ============================================
    const userResult = await client.query(`SELECT id FROM usuarios WHERE activo = true LIMIT 1`);
    if (userResult.rows.length === 0) {
      throw new Error('No hay usuarios activos en la DB. Crea uno primero.');
    }
    const adminId = userResult.rows[0].id;
    console.log(`✅ Usuario admin encontrado: ${adminId}`);

    const mediosResult = await client.query(`SELECT id, nombre FROM medios_pago WHERE activo = true`);
    if (mediosResult.rows.length === 0) {
      throw new Error('No hay medios de pago. Inserta al menos uno.');
    }
    const mediosPago = mediosResult.rows;
    console.log(`✅ Medios de pago: ${mediosPago.map(m => m.nombre).join(', ')}`);

    const getMedioPago = (nombre) => {
      const found = mediosPago.find(m => m.nombre.toLowerCase().includes(nombre.toLowerCase()));
      return found || mediosPago[0];
    };

    // ============================================
    // 2. Insertar 15 clientes colombianos
    // ============================================
    console.log('\n👥 Insertando clientes...');
    
    const clientesData = [
      { nombre: 'Carlos Andrés Martínez', telefono: '3101234567', email: 'carlos.martinez.test@email.com', identificacion: '1098765432', direccion: 'Cra 15 #45-12, Bucaramanga' },
      { nombre: 'María Fernanda López', telefono: '3209876543', email: 'maria.lopez.test@email.com', identificacion: '1087654321', direccion: 'Cll 72 #10-23, Bogotá' },
      { nombre: 'Juan David Rodríguez', telefono: '3154567890', email: 'juan.rodriguez.test@email.com', identificacion: '1076543210', direccion: 'Av 6 Norte #25N-30, Cali' },
      { nombre: 'Ana María García', telefono: '3187654321', email: 'ana.garcia.test@email.com', identificacion: '1065432109', direccion: 'Cra 43 #52-12, Medellín' },
      { nombre: 'Pedro José Hernández', telefono: '3001122334', email: 'pedro.hernandez.test@email.com', identificacion: '1054321098', direccion: 'Cll 30 #5-45, Barranquilla' },
      { nombre: 'Laura Valentina Torres', telefono: '3112233445', email: 'laura.torres.test@email.com', identificacion: '1043210987', direccion: 'Cra 7 #32-18, Pereira' },
      { nombre: 'Andrés Felipe Díaz', telefono: '3223344556', email: 'andres.diaz.test@email.com', identificacion: '1032109876', direccion: 'Cll 19 #4-88, Manizales' },
      { nombre: 'Camila Andrea Moreno', telefono: '3134455667', email: 'camila.moreno.test@email.com', identificacion: '1021098765', direccion: 'Av Santander #45-60, Cartagena' },
      { nombre: 'Santiago Alejandro Ruiz', telefono: '3045566778', email: 'santiago.ruiz.test@email.com', identificacion: '1010987654', direccion: 'Cra 27 #36-22, Bucaramanga' },
      { nombre: 'Valentina Sofía Castro', telefono: '3156677889', email: 'valentina.castro.test@email.com', identificacion: '1009876543', direccion: 'Cll 100 #15-40, Bogotá' },
      { nombre: 'Diego Alejandro Vargas', telefono: '3167788990', email: 'diego.vargas.test@email.com', identificacion: '998765432', direccion: 'Cra 50 #80-12, Medellín' },
      { nombre: 'Isabella Mariana Reyes', telefono: '3178899001', email: 'isabella.reyes.test@email.com', identificacion: '987654321', direccion: 'Cll 5 #38-55, Cali' },
      { nombre: 'Mateo Sebastián Ortiz', telefono: '3089900112', email: 'mateo.ortiz.test@email.com', identificacion: '976543210', direccion: 'Cra 10 #20-30, Santa Marta' },
      { nombre: 'Gabriela Alejandra Muñoz', telefono: '3190011223', email: 'gabriela.munoz.test@email.com', identificacion: '965432109', direccion: 'Av El Dorado #68-10, Bogotá' },
      { nombre: 'Daniel Esteban Jiménez', telefono: '3201122334', email: 'daniel.jimenez.test@email.com', identificacion: '954321098', direccion: 'Cll 45 #28-15, Ibagué' },
    ];

    const clienteIds = [];
    for (const c of clientesData) {
      const res = await client.query(
        `INSERT INTO clientes (nombre, telefono, email, identificacion, direccion)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (identificacion) DO UPDATE SET nombre = EXCLUDED.nombre
         RETURNING id`,
        [c.nombre, c.telefono, c.email, c.identificacion, c.direccion]
      );
      clienteIds.push(res.rows[0].id);
    }
    console.log(`   ✅ ${clienteIds.length} clientes insertados`);

    // ============================================
    // 3. Crear 2 rifas de prueba
    // ============================================
    console.log('\n🎟️ Creando rifas...');
    
    // Rifa 1: Premium - Moto
    const rifa1Res = await client.query(
      `INSERT INTO rifas (nombre, slug, descripcion, estado, precio_boleta, fecha_inicio, fecha_fin, fecha_sorteo, premio_principal, total_boletas, boletas_vendidas, creado_por)
       VALUES ($1, $2, $3, 'ACTIVA', $4, $5, $6, $7, $8, $9, 0, $10)
       RETURNING id`,
      [
        'Gran Rifa Moto Honda CB190R 2026',
        'rifa-moto-honda-cb190r-2026',
        'Participa por una espectacular Moto Honda CB190R 2026 0km. Color negro mate, edición especial. Incluye SOAT, matrícula y casco.',
        150000,
        new Date('2026-02-01'),
        new Date('2026-04-30'),
        new Date('2026-05-01'),
        'Moto Honda CB190R 2026 0km',
        100,
        adminId
      ]
    );
    const rifa1Id = rifa1Res.rows[0].id;
    console.log(`   ✅ Rifa 1 (Moto, $150.000, 100 boletas): ${rifa1Id}`);

    // Rifa 2: Económica - iPhone
    const rifa2Res = await client.query(
      `INSERT INTO rifas (nombre, slug, descripcion, estado, precio_boleta, fecha_inicio, fecha_fin, fecha_sorteo, premio_principal, total_boletas, boletas_vendidas, creado_por)
       VALUES ($1, $2, $3, 'ACTIVA', $4, $5, $6, $7, $8, $9, 0, $10)
       RETURNING id`,
      [
        'Rifa iPhone 16 Pro Max 256GB',
        'rifa-iphone-16-pro-max',
        'Gana un iPhone 16 Pro Max 256GB color Titanio Natural. Nuevo, sellado, con garantía Apple de 1 año.',
        50000,
        new Date('2026-02-10'),
        new Date('2026-03-31'),
        new Date('2026-04-01'),
        'iPhone 16 Pro Max 256GB Titanio',
        200,
        adminId
      ]
    );
    const rifa2Id = rifa2Res.rows[0].id;
    console.log(`   ✅ Rifa 2 (iPhone, $50.000, 200 boletas): ${rifa2Id}`);

    // ============================================
    // 4. Crear boletas para ambas rifas
    // ============================================
    console.log('\n🎫 Creando boletas...');
    
    // Rifa 1: 100 boletas (0-99)
    for (let i = 0; i < 100; i++) {
      await client.query(
        `INSERT INTO boletas (rifa_id, numero, estado) VALUES ($1, $2, 'DISPONIBLE')
         ON CONFLICT (numero, rifa_id) DO NOTHING`,
        [rifa1Id, i]
      );
    }
    console.log(`   ✅ 100 boletas creadas para Rifa Moto`);

    // Rifa 2: 200 boletas (0-199)
    for (let i = 0; i < 200; i++) {
      await client.query(
        `INSERT INTO boletas (rifa_id, numero, estado) VALUES ($1, $2, 'DISPONIBLE')
         ON CONFLICT (numero, rifa_id) DO NOTHING`,
        [rifa2Id, i]
      );
    }
    console.log(`   ✅ 200 boletas creadas para Rifa iPhone`);

    // ============================================
    // 5. Crear ventas con diferentes estados
    // ============================================
    console.log('\n💰 Creando ventas y asignando boletas...');

    const efectivo = getMedioPago('efectivo');
    const nequi = getMedioPago('nequi');

    // Helper: crear venta completa
    async function crearVenta({ rifaId, clienteId, boletaNums, precioBoleta, estadoVenta, estadoBoleta, abonoPercent, medioPago, notas }) {
      const cantBoletas = boletaNums.length;
      const montoTotal = precioBoleta * cantBoletas;
      const abonoTotal = Math.round(montoTotal * (abonoPercent / 100));
      
      // Crear venta
      const ventaRes = await client.query(
        `INSERT INTO ventas (rifa_id, cliente_id, vendedor_id, monto_total, abono_total, estado_venta, medio_pago_id, gateway_pago, es_venta_admin, notas_admin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
         RETURNING id`,
        [rifaId, clienteId, adminId, montoTotal, abonoTotal, estadoVenta, medioPago.id, medioPago.nombre, notas || null]
      );
      const ventaId = ventaRes.rows[0].id;

      // Asignar boletas
      for (const num of boletaNums) {
        await client.query(
          `UPDATE boletas SET estado = $1, cliente_id = $2, vendido_por = $3, venta_id = $4, updated_at = CURRENT_TIMESTAMP
           WHERE rifa_id = $5 AND numero = $6`,
          [estadoBoleta, clienteId, adminId, ventaId, rifaId, num]
        );
      }

      // Crear abonos (distribuidos por boleta)
      if (abonoTotal > 0) {
        const montoPorBoleta = abonoTotal / cantBoletas;
        for (const num of boletaNums) {
          const boletaRes = await client.query(
            `SELECT id FROM boletas WHERE rifa_id = $1 AND numero = $2`,
            [rifaId, num]
          );
          if (boletaRes.rows.length > 0) {
            await client.query(
              `INSERT INTO abonos (venta_id, boleta_id, monto, estado, medio_pago_id, gateway_pago, moneda, registrado_por, notas)
               VALUES ($1, $2, $3, 'CONFIRMADO', $4, $5, 'COP', $6, $7)`,
              [ventaId, boletaRes.rows[0].id, montoPorBoleta, medioPago.id, medioPago.nombre, adminId, notas || 'Pago registrado']
            );
          }
        }
      }

      return ventaId;
    }

    // ---- RIFA 1: MOTO ($150.000 c/u) ----

    // Cliente 0: Carlos - 3 boletas PAGADAS (100%)
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[0], boletaNums: [7, 14, 21],
      precioBoleta: 150000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: efectivo, notas: 'Pago completo en efectivo'
    });
    console.log('   ✅ Carlos: 3 boletas PAGADAS (Moto)');

    // Cliente 1: María - 2 boletas ABONADAS (70%)
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[1], boletaNums: [33, 45],
      precioBoleta: 150000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 70, medioPago: nequi, notas: 'Abono por Nequi - queda pendiente 30%'
    });
    console.log('   ✅ María: 2 boletas ABONADAS al 70% (Moto)');

    // Cliente 2: Juan - 1 boleta ABONADA (40%)
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[2], boletaNums: [55],
      precioBoleta: 150000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 40, medioPago: efectivo, notas: 'Primer abono - prometió pagar el resto la próxima semana'
    });
    console.log('   ✅ Juan: 1 boleta ABONADA al 40% (Moto)');

    // Cliente 3: Ana - 4 boletas PAGADAS
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[3], boletaNums: [10, 20, 30, 40],
      precioBoleta: 150000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: nequi, notas: 'Pago completo por Nequi'
    });
    console.log('   ✅ Ana: 4 boletas PAGADAS (Moto)');

    // Cliente 4: Pedro - 2 boletas RESERVADAS (0% pago)
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[4], boletaNums: [66, 77],
      precioBoleta: 150000, estadoVenta: 'PENDIENTE', estadoBoleta: 'RESERVADA',
      abonoPercent: 0, medioPago: efectivo, notas: 'Reserva - va a pagar mañana'
    });
    console.log('   ✅ Pedro: 2 boletas RESERVADAS (Moto)');

    // Cliente 5: Laura - 5 boletas PAGADAS
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[5], boletaNums: [1, 11, 22, 44, 88],
      precioBoleta: 150000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: efectivo, notas: 'Compra grande - pago completo'
    });
    console.log('   ✅ Laura: 5 boletas PAGADAS (Moto)');

    // Cliente 6: Andrés - 1 boleta ABONADA (25%)
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[6], boletaNums: [99],
      precioBoleta: 150000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 25, medioPago: nequi, notas: 'Abono inicial pequeño'
    });
    console.log('   ✅ Andrés: 1 boleta ABONADA al 25% (Moto)');

    // Cliente 7: Camila - 2 boletas PAGADAS
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[7], boletaNums: [50, 60],
      precioBoleta: 150000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: efectivo, notas: 'Pago completo'
    });
    console.log('   ✅ Camila: 2 boletas PAGADAS (Moto)');

    // ---- RIFA 2: iPHONE ($50.000 c/u) ----

    // Cliente 0: Carlos - TAMBIÉN compra en Rifa 2 (2 boletas PAGADAS)
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[0], boletaNums: [5, 15],
      precioBoleta: 50000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: nequi, notas: 'Pago Nequi'
    });
    console.log('   ✅ Carlos: 2 boletas PAGADAS (iPhone)');

    // Cliente 1: María - 3 boletas ABONADAS (50%) en Rifa 2
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[1], boletaNums: [25, 50, 75],
      precioBoleta: 50000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 50, medioPago: efectivo, notas: 'Abono del 50% en efectivo'
    });
    console.log('   ✅ María: 3 boletas ABONADAS al 50% (iPhone)');

    // Cliente 3: Ana - 2 boletas RESERVADAS en Rifa 2
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[3], boletaNums: [100, 101],
      precioBoleta: 50000, estadoVenta: 'PENDIENTE', estadoBoleta: 'RESERVADA',
      abonoPercent: 0, medioPago: efectivo, notas: 'Reserva para pagar el viernes'
    });
    console.log('   ✅ Ana: 2 boletas RESERVADAS (iPhone)');

    // Cliente 8: Santiago - 6 boletas PAGADAS en Rifa 2
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[8], boletaNums: [10, 20, 30, 40, 60, 80],
      precioBoleta: 50000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: nequi, notas: 'Gran compra pagada por Nequi'
    });
    console.log('   ✅ Santiago: 6 boletas PAGADAS (iPhone)');

    // Cliente 9: Valentina - 4 boletas ABONADAS (80%)
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[9], boletaNums: [111, 122, 133, 144],
      precioBoleta: 50000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 80, medioPago: efectivo, notas: 'Casi completo - falta 20%'
    });
    console.log('   ✅ Valentina: 4 boletas ABONADAS al 80% (iPhone)');

    // Cliente 10: Diego - 1 boleta PAGADA + 2 ABONADAS (60%)
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[10], boletaNums: [155],
      precioBoleta: 50000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: nequi, notas: 'Pago completo 1'
    });
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[10], boletaNums: [166, 177],
      precioBoleta: 50000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 60, medioPago: efectivo, notas: 'Abono parcial - segunda compra'
    });
    console.log('   ✅ Diego: 1 PAGADA + 2 ABONADAS al 60% (iPhone)');

    // Cliente 11: Isabella - 3 boletas RESERVADAS
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[11], boletaNums: [188, 190, 195],
      precioBoleta: 50000, estadoVenta: 'PENDIENTE', estadoBoleta: 'RESERVADA',
      abonoPercent: 0, medioPago: efectivo, notas: 'Reserva telefónica'
    });
    console.log('   ✅ Isabella: 3 boletas RESERVADAS (iPhone)');

    // Cliente 12: Mateo - 2 boletas PAGADAS en Rifa 2
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[12], boletaNums: [7, 77],
      precioBoleta: 50000, estadoVenta: 'PAGADA', estadoBoleta: 'PAGADA',
      abonoPercent: 100, medioPago: efectivo, notas: 'Pago en efectivo'
    });
    console.log('   ✅ Mateo: 2 boletas PAGADAS (iPhone)');

    // Cliente 5: Laura - TAMBIÉN compra en Rifa 2 (3 boletas ABONADAS 30%)
    await crearVenta({
      rifaId: rifa2Id, clienteId: clienteIds[5], boletaNums: [33, 44, 55],
      precioBoleta: 50000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 30, medioPago: nequi, notas: 'Primer abono Nequi'
    });
    console.log('   ✅ Laura: 3 boletas ABONADAS al 30% (iPhone)');

    // Cliente 13: Gabriela - 1 boleta ABONADA (15%) en Rifa 1
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[13], boletaNums: [85],
      precioBoleta: 150000, estadoVenta: 'ABONADA', estadoBoleta: 'ABONADA',
      abonoPercent: 15, medioPago: efectivo, notas: 'Abono mínimo inicial'
    });
    console.log('   ✅ Gabriela: 1 boleta ABONADA al 15% (Moto)');

    // Cliente 14: Daniel - 3 boletas RESERVADAS en Rifa 1
    await crearVenta({
      rifaId: rifa1Id, clienteId: clienteIds[14], boletaNums: [91, 92, 93],
      precioBoleta: 150000, estadoVenta: 'PENDIENTE', estadoBoleta: 'RESERVADA',
      abonoPercent: 0, medioPago: efectivo, notas: 'Reserva - pagará la próxima semana'
    });
    console.log('   ✅ Daniel: 3 boletas RESERVADAS (Moto)');

    // ============================================
    // 6. Actualizar contadores de rifas
    // ============================================
    console.log('\n📊 Actualizando contadores de rifas...');
    
    for (const rifaId of [rifa1Id, rifa2Id]) {
      const countRes = await client.query(
        `SELECT 
          COUNT(*) FILTER (WHERE estado != 'DISPONIBLE') AS vendidas
         FROM boletas WHERE rifa_id = $1`,
        [rifaId]
      );
      const { vendidas } = countRes.rows[0];
      await client.query(
        `UPDATE rifas SET boletas_vendidas = $1 WHERE id = $2`,
        [parseInt(vendidas), rifaId]
      );
    }
    console.log('   ✅ Contadores actualizados');

    // ============================================
    // 7. Commit
    // ============================================
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DATOS DUMMY INSERTADOS EXITOSAMENTE');
    console.log('='.repeat(60));
    console.log('\n📋 RESUMEN:');
    console.log('   👥 15 clientes colombianos');
    console.log('   🎟️ 2 rifas activas:');
    console.log('      - Moto Honda CB190R ($150.000 x 100 boletas)');
    console.log('      - iPhone 16 Pro Max ($50.000 x 200 boletas)');
    console.log('\n   🏷️ RIFA MOTO - Boletas asignadas:');
    console.log('      ✅ 14 PAGADAS (Carlos 3, Ana 4, Laura 5, Camila 2)');
    console.log('      🔵 4 ABONADAS (María 2 al 70%, Juan 1 al 40%, Andrés 1 al 25%, Gabriela 1 al 15%)');
    console.log('      🟡 5 RESERVADAS (Pedro 2, Daniel 3)');
    console.log('      ⬜ 77 DISPONIBLES');
    console.log('\n   📱 RIFA iPHONE - Boletas asignadas:');
    console.log('      ✅ 11 PAGADAS (Carlos 2, Santiago 6, Diego 1, Mateo 2)');
    console.log('      🔵 12 ABONADAS (María 3 al 50%, Valentina 4 al 80%, Diego 2 al 60%, Laura 3 al 30%)');
    console.log('      🟡 5 RESERVADAS (Ana 2, Isabella 3)');
    console.log('      ⬜ 172 DISPONIBLES');
    console.log('\n   💰 Clientes en AMBAS rifas: Carlos, María, Ana, Laura');
    console.log('   📊 Mix de estados: PAGADA, ABONADA (15%-80%), RESERVADA');
    console.log('\n🔗 Ahora abre la app y prueba el módulo de Clientes!');
    
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
