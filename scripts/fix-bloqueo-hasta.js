/**
 * Script para actualizar bloqueo_hasta de boletas reservadas
 * 
 * La fecha correcta para la rifa "EL GRAN CAMION" (sorteo 20/06/2026):
 * bloqueo_hasta = 20/06/2026 23:59:59 hora Colombia (UTC-5)
 *              = 21/06/2026 04:59:59 UTC
 * 
 * Uso:
 *   DATABASE_URL="postgresql://..." node scripts/fix-bloqueo-hasta.js
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL');
  console.error('   Uso: DATABASE_URL="postgresql://..." node scripts/fix-bloqueo-hasta.js');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    // 1. Ver cuántas boletas reservadas hay y su bloqueo actual
    const antes = await pool.query(`
      SELECT b.id, b.numero, b.estado, b.bloqueo_hasta, 
             c.nombre as cliente, r.nombre as rifa, r.fecha_sorteo
      FROM boletas b
      LEFT JOIN clientes c ON b.cliente_id = c.id
      LEFT JOIN rifas r ON b.rifa_id = r.id
      WHERE b.estado = 'RESERVADA' 
        AND b.bloqueo_hasta IS NOT NULL
      ORDER BY b.numero
    `);

    console.log(`\n📊 Boletas reservadas encontradas: ${antes.rows.length}`);
    console.log('─'.repeat(80));
    
    for (const b of antes.rows) {
      const bloqueo = b.bloqueo_hasta ? new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : 'N/A';
      console.log(`  Boleta #${String(b.numero).padStart(4, '0')} | Estado: ${b.estado} | Bloqueo hasta: ${bloqueo} | Cliente: ${b.cliente || 'N/A'}`);
    }

    if (antes.rows.length === 0) {
      console.log('✅ No hay boletas reservadas que actualizar');
      return;
    }

    // 2. Obtener la fecha del sorteo de cada rifa para calcular la fecha correcta
    const rifas = await pool.query(`
      SELECT DISTINCT r.id, r.nombre, r.fecha_sorteo
      FROM rifas r
      JOIN boletas b ON b.rifa_id = r.id
      WHERE b.estado = 'RESERVADA' AND b.bloqueo_hasta IS NOT NULL
    `);

    console.log(`\n🎰 Rifas con boletas reservadas:`);
    for (const r of rifas.rows) {
      console.log(`  - ${r.nombre} | Sorteo: ${r.fecha_sorteo}`);
    }

    // 3. Actualizar: para cada rifa, poner bloqueo_hasta = fecha_sorteo 23:59:59 COT
    // fecha_sorteo (DATE) en PostgreSQL: '2026-06-20'
    // Queremos: '2026-06-20 23:59:59-05' (hora Colombia)
    const updateResult = await pool.query(`
      UPDATE boletas b
      SET bloqueo_hasta = (r.fecha_sorteo::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'America/Bogota',
          updated_at = CURRENT_TIMESTAMP
      FROM rifas r
      WHERE b.rifa_id = r.id
        AND b.estado = 'RESERVADA'
        AND b.bloqueo_hasta IS NOT NULL
        AND r.fecha_sorteo IS NOT NULL
      RETURNING b.id, b.numero, b.bloqueo_hasta, r.nombre as rifa
    `);

    console.log(`\n✅ Boletas actualizadas: ${updateResult.rows.length}`);
    console.log('─'.repeat(80));
    
    for (const b of updateResult.rows) {
      const bloqueo = new Date(b.bloqueo_hasta).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      console.log(`  Boleta #${String(b.numero).padStart(4, '0')} → Nuevo bloqueo: ${bloqueo}`);
    }

    // 4. También actualizar expires_at en ventas que tengan boletas reservadas
    const ventasUpdate = await pool.query(`
      UPDATE ventas v
      SET expires_at = (r.fecha_sorteo::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'America/Bogota',
          updated_at = CURRENT_TIMESTAMP
      FROM rifas r
      WHERE v.rifa_id = r.id
        AND v.es_venta_online = true
        AND v.estado_venta IN ('SIN_REVISAR', 'PENDIENTE', 'ABONADA')
        AND r.fecha_sorteo IS NOT NULL
      RETURNING v.id, v.estado_venta, v.expires_at
    `);

    console.log(`\n✅ Ventas actualizadas: ${ventasUpdate.rows.length}`);
    for (const v of ventasUpdate.rows) {
      const exp = new Date(v.expires_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      console.log(`  Venta ${v.id.substring(0, 8)}... | Estado: ${v.estado_venta} → Nuevo expires_at: ${exp}`);
    }

    console.log('\n🎉 ¡Migración completada exitosamente!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(() => process.exit(1));
