const { pool } = require('../src/db/pool');

async function createAbono() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      INSERT INTO abonos (
        venta_id, 
        registrado_por, 
        monto, 
        moneda, 
        estado, 
        referencia, 
        notas, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) RETURNING *`,
      [
        '8f3615e9-a51f-4592-b1bd-12d649c79161',  // venta_id existente
        '5ca52891-1dcf-4c3c-9ef8-918c4def8061',  // registrado_por (super admin)
        250000,                                   // monto (abono parcial)
        'COP',                                    // moneda
        'CONFIRMADO',                              // estado
        'LIQ-001',                                // referencia
        'Segundo abono - liquidación parcial'     // notas
      ]
    );
    console.log('✅ Abono creado:');
    console.log(JSON.stringify(result.rows[0], null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
  }
}

createAbono();
