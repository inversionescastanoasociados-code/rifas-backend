const { pool } = require('../src/db/pool');

async function inspectDatabaseSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 INSPECCIÓN DEL ESQUEMA DE LA BASE DE DATOS\n');
    
    // 1. Inspeccionar tabla boletas
    console.log('📋 TABLA: BOLETAS');
    console.log('='.repeat(50));
    
    const boletasColumns = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'boletas' 
      ORDER BY ordinal_position
    `);
    
    console.log('Columnas:');
    boletasColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULL)'}`);
    });
    
    // 2. Inspeccionar tabla ventas
    console.log('\n📋 TABLA: VENTAS');
    console.log('='.repeat(50));
    
    const ventasColumns = await client.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'ventas' 
      ORDER BY ordinal_position
    `);
    
    console.log('Columnas:');
    ventasColumns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULL)'}`);
    });
    
    // 3. Inspeccionar tabla clientes
    console.log('\n📋 TABLA: CLIENTES');
    console.log('='.repeat(50));
    
    try {
      const clientesColumns = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = 'clientes' 
        ORDER BY ordinal_position
      `);
      
      console.log('Columnas:');
      clientesColumns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULL)'}`);
      });
    } catch (error) {
      console.log('❌ La tabla clientes no existe o hay un error:', error.message);
    }
    
    // 4. Inspeccionar foreign keys
    console.log('\n🔗 FOREIGN KEYS');
    console.log('='.repeat(50));
    
    const foreignKeys = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (tc.table_name = 'boletas' OR tc.table_name = 'ventas')
    `);
    
    console.log('Relaciones:');
    foreignKeys.rows.forEach(fk => {
      console.log(`  - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    // 5. Verificar enums
    console.log('\n🏷️ ENUMS');
    console.log('='.repeat(50));
    
    try {
      const enums = await client.query(`
        SELECT t.typname AS enum_name,
               e.enumlabel AS enum_value
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        WHERE t.typname LIKE '%estado%'
        ORDER BY t.typname, e.enumsortorder
      `);
      
      console.log('Valores de enums:');
      enums.rows.forEach(enum_row => {
        console.log(`  - ${enum_row.enum_name}: ${enum_row.enum_value}`);
      });
    } catch (error) {
      console.log('❌ Error consultando enums:', error.message);
    }
    
    // 6. Datos de ejemplo
    console.log('\n📊 DATOS DE EJEMPLO');
    console.log('='.repeat(50));
    
    try {
      const sampleBoleta = await client.query('SELECT * FROM boletas LIMIT 1');
      if (sampleBoleta.rows.length > 0) {
        console.log('Boleta de ejemplo:');
        console.log(JSON.stringify(sampleBoleta.rows[0], null, 2));
      }
    } catch (error) {
      console.log('❌ Error obteniendo boleta de ejemplo:', error.message);
    }
    
    try {
      const sampleVenta = await client.query('SELECT * FROM ventas LIMIT 1');
      if (sampleVenta.rows.length > 0) {
        console.log('\nVenta de ejemplo:');
        console.log(JSON.stringify(sampleVenta.rows[0], null, 2));
      }
    } catch (error) {
      console.log('❌ Error obteniendo venta de ejemplo:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
  } finally {
    client.release();
    console.log('\n✅ Inspección completada');
  }
}

// Ejecutar la inspección
if (require.main === module) {
  inspectDatabaseSchema().catch(console.error);
}

module.exports = { inspectDatabaseSchema };
