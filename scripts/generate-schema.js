const { pool } = require('../src/db/pool');
const fs = require('fs');

async function generateFullSQL() {
  const client = await pool.connect();
  
  try {
    let sql = '';
    
    // 1. Header
    sql += '-- =============================================\n';
    sql += '-- RIFAS BACKEND - SCRIPT DE CREACIÓN DE BASE DE DATOS\n';
    sql += '-- Generado automáticamente: ' + new Date().toISOString() + '\n';
    sql += '-- =============================================\n\n';
    
    // 2. Extensiones
    sql += '-- =============================================\n';
    sql += '-- EXTENSIONES\n';
    sql += '-- =============================================\n';
    sql += 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n';
    
    // 3. ENUMS
    sql += '-- =============================================\n';
    sql += '-- ENUMS\n';
    sql += '-- =============================================\n';
    
    const enums = await client.query(`
      SELECT t.typname as enum_name, 
             array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
      ORDER BY t.typname
    `);
    
    enums.rows.forEach(en => {
      // enum_values puede venir como string o array dependiendo de pg
      let values;
      if (Array.isArray(en.enum_values)) {
        values = en.enum_values.map(v => "'" + v + "'").join(', ');
      } else {
        // Si viene como string tipo {val1,val2,val3}
        const arr = en.enum_values.replace(/[{}]/g, '').split(',');
        values = arr.map(v => "'" + v.trim() + "'").join(', ');
      }
      sql += 'CREATE TYPE ' + en.enum_name + ' AS ENUM (' + values + ');\n';
    });
    sql += '\n';
    
    // 4. TABLAS (en orden correcto para FKs)
    const tableOrder = ['usuarios', 'clientes', 'medios_pago', 'rifas', 'ventas', 'boletas', 'venta_detalles', 'abonos', 'pagos', 'transferencias'];
    
    sql += '-- =============================================\n';
    sql += '-- TABLAS\n';
    sql += '-- =============================================\n\n';
    
    for (const tableName of tableOrder) {
      const columns = await client.query(`
        SELECT 
          column_name,
          data_type,
          udt_name,
          is_nullable,
          column_default,
          character_maximum_length,
          numeric_precision,
          numeric_scale
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' 
        ORDER BY ordinal_position
      `);
      
      if (columns.rows.length === 0) continue;
      
      sql += '-- Tabla: ' + tableName.toUpperCase() + '\n';
      sql += 'CREATE TABLE ' + tableName + ' (\n';
      
      const colDefs = [];
      columns.rows.forEach(col => {
        let colDef = '  ' + col.column_name + ' ';
        
        if (col.data_type === 'USER-DEFINED') {
          colDef += col.udt_name;
        } else if (col.data_type === 'character varying') {
          colDef += 'VARCHAR(' + (col.character_maximum_length || 255) + ')';
        } else if (col.data_type === 'numeric') {
          colDef += 'NUMERIC';
        } else if (col.data_type === 'timestamp with time zone') {
          colDef += 'TIMESTAMPTZ';
        } else if (col.data_type === 'ARRAY') {
          colDef += col.udt_name;
        } else {
          colDef += col.data_type.toUpperCase();
        }
        
        if (col.is_nullable === 'NO') {
          colDef += ' NOT NULL';
        }
        
        if (col.column_default) {
          colDef += ' DEFAULT ' + col.column_default;
        }
        
        colDefs.push(colDef);
      });
      
      sql += colDefs.join(',\n') + '\n);\n\n';
    }
    
    // 5. PRIMARY KEYS
    sql += '-- =============================================\n';
    sql += '-- PRIMARY KEYS\n';
    sql += '-- =============================================\n';
    
    for (const tableName of tableOrder) {
      const checkTable = await client.query(`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = '${tableName}' AND table_schema = 'public'
      `);
      if (checkTable.rows.length > 0) {
        sql += 'ALTER TABLE ' + tableName + ' ADD PRIMARY KEY (id);\n';
      }
    }
    sql += '\n';
    
    // 6. UNIQUE CONSTRAINTS
    sql += '-- =============================================\n';
    sql += '-- UNIQUE CONSTRAINTS\n';
    sql += '-- =============================================\n';
    
    const uniques = await client.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        string_agg(kcu.column_name, ', ') as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
        AND tc.table_name != '_prisma_migrations'
      GROUP BY tc.table_name, tc.constraint_name
      ORDER BY tc.table_name
    `);
    
    if (uniques.rows.length === 0) {
      sql += '-- No hay restricciones UNIQUE adicionales\n';
    } else {
      uniques.rows.forEach(u => {
        sql += 'ALTER TABLE ' + u.table_name + ' ADD CONSTRAINT ' + u.constraint_name + ' UNIQUE (' + u.columns + ');\n';
      });
    }
    sql += '\n';
    
    // 7. FOREIGN KEYS
    sql += '-- =============================================\n';
    sql += '-- FOREIGN KEYS\n';
    sql += '-- =============================================\n';
    
    const fks = await client.query(`
      SELECT
        tc.constraint_name,
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.delete_rule,
        rc.update_rule
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name != '_prisma_migrations'
      ORDER BY tc.table_name
    `);
    
    fks.rows.forEach(fk => {
      sql += 'ALTER TABLE ' + fk.table_name + ' ADD CONSTRAINT ' + fk.constraint_name + ' ';
      sql += 'FOREIGN KEY (' + fk.column_name + ') REFERENCES ' + fk.foreign_table_name + '(' + fk.foreign_column_name + ')';
      if (fk.delete_rule && fk.delete_rule !== 'NO ACTION') sql += ' ON DELETE ' + fk.delete_rule;
      if (fk.update_rule && fk.update_rule !== 'NO ACTION') sql += ' ON UPDATE ' + fk.update_rule;
      sql += ';\n';
    });
    sql += '\n';
    
    // 8. ÍNDICES
    sql += '-- =============================================\n';
    sql += '-- ÍNDICES\n';
    sql += '-- =============================================\n';
    
    const indexes = await client.query(`
      SELECT
        indexname,
        tablename,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename != '_prisma_migrations'
        AND indexname NOT LIKE '%_pkey'
        AND indexdef NOT LIKE '%UNIQUE%'
      ORDER BY tablename, indexname
    `);
    
    if (indexes.rows.length === 0) {
      sql += '-- No hay índices adicionales\n';
    } else {
      indexes.rows.forEach(idx => {
        sql += idx.indexdef + ';\n';
      });
    }
    sql += '\n';
    
    // 9. FUNCIONES
    sql += '-- =============================================\n';
    sql += '-- FUNCIONES\n';
    sql += '-- =============================================\n';
    
    const functions = await client.query(`
      SELECT 
        p.proname as function_name,
        pg_get_functiondef(p.oid) as function_def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.prokind = 'f'
    `);
    
    if (functions.rows.length === 0) {
      sql += '-- No hay funciones definidas\n';
    } else {
      functions.rows.forEach(fn => {
        sql += fn.function_def + ';\n\n';
      });
    }
    sql += '\n';
    
    // 10. TRIGGERS
    sql += '-- =============================================\n';
    sql += '-- TRIGGERS\n';
    sql += '-- =============================================\n';
    
    const triggers = await client.query(`
      SELECT 
        trigger_name,
        event_manipulation,
        event_object_table,
        action_statement,
        action_timing
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
    `);
    
    if (triggers.rows.length === 0) {
      sql += '-- No hay triggers definidos\n';
    } else {
      triggers.rows.forEach(tr => {
        sql += 'CREATE TRIGGER ' + tr.trigger_name + ' ';
        sql += tr.action_timing + ' ' + tr.event_manipulation + ' ON ' + tr.event_object_table + ' ';
        sql += 'FOR EACH ROW ' + tr.action_statement + ';\n';
      });
    }
    
    // Guardar archivo
    fs.writeFileSync('scripts/database-schema.sql', sql);
    console.log('✅ Script SQL guardado en scripts/database-schema.sql');
    console.log('\n' + '='.repeat(60) + '\n');
    console.log(sql);
    
  } finally {
    client.release();
    pool.end();
  }
}

generateFullSQL().catch(console.error);
