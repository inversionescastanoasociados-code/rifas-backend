const { Pool } = require('pg');
const pool = new Pool({
  host: 'crossover.proxy.rlwy.net', port: 34599, database: 'railway',
  user: 'postgres', password: 'iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ', ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Buscar boletas cuyo hash empiece con 91929
    console.log('=== Buscar hashes que empiecen con 91929 ===');
    const match = await pool.query(
      "SELECT numero, verificacion_hash, qr_url, rifa_id FROM boletas WHERE verificacion_hash LIKE '91929%'"
    );
    console.log(`Encontradas: ${match.rows.length}`);
    match.rows.forEach(b => {
      const decoded = decodeURIComponent(b.qr_url.split('data=')[1].split('&')[0]);
      console.log(`  Boleta #${b.numero}, Rifa: ${b.rifa_id}`);
      console.log(`  Hash: ${b.verificacion_hash}`);
      console.log(`  QR apunta a: ${decoded}`);
    });

    // Buscar boletas cuyo QR URL contenga "91929"
    console.log('\n=== Buscar QR URLs que contengan 91929 ===');
    const qrMatch = await pool.query(
      "SELECT numero, verificacion_hash, qr_url, rifa_id FROM boletas WHERE qr_url LIKE '%91929%'"
    );
    console.log(`Encontradas: ${qrMatch.rows.length}`);
    qrMatch.rows.forEach(b => {
      const decoded = decodeURIComponent(b.qr_url.split('data=')[1].split('&')[0]);
      console.log(`  Boleta #${b.numero}, Hash: ${b.verificacion_hash}`);
      console.log(`  QR apunta a: ${decoded}`);
    });

    // Verificar: ¿el QR de la boleta #1 de "rifan 2 prd" genera la URL correcta?
    console.log('\n=== Boleta #1 de rifan 2 prd (hash empieza con 91929) ===');
    const b1 = await pool.query(
      "SELECT * FROM boletas WHERE rifa_id = 'a7ed3394-bc23-4646-8b75-473d18c3a0a1' AND numero = 1"
    );
    if (b1.rows.length > 0) {
      const b = b1.rows[0];
      console.log(`  Hash completo: ${b.verificacion_hash}`);
      console.log(`  QR URL raw: ${b.qr_url}`);
      
      // Lo que ve el usuario al escanear el QR
      const decoded = decodeURIComponent(b.qr_url.split('data=')[1].split('&')[0]);
      console.log(`  URL destino del QR: ${decoded}`);
      
      // Verificar contra el endpoint
      console.log(`\n  Probando verificación...`);
      const https = require('node:https');
      const url = `https://rifas-backend-production.up.railway.app/api/verificar/${b.verificacion_hash}`;
      const resp = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
      });
      console.log(`  Status: ${resp.status}`);
      const parsed = JSON.parse(resp.body);
      console.log(`  Success: ${parsed.success}`);
      if (parsed.data) {
        console.log(`  Boleta número: ${parsed.data.boleta.numero}`);
        console.log(`  Estado: ${parsed.data.boleta.estado}`);
        console.log(`  Rifa: ${parsed.data.rifa.nombre}`);
      }
    }

    // Verificar QR image URL - ¿el QR se genera correctamente?
    console.log('\n=== TEST: Descargar QR y verificar contenido ===');
    const testBoleta = await pool.query(
      "SELECT numero, qr_url, verificacion_hash FROM boletas WHERE rifa_id = 'a7ed3394-bc23-4646-8b75-473d18c3a0a1' AND numero = 1"
    );
    console.log(`QR Image URL: ${testBoleta.rows[0].qr_url}`);
    console.log(`\nEl QR de la imagen se genera con la API: api.qrserver.com`);
    console.log(`Cuando el usuario escanea este QR, el teléfono abre la URL:`);
    const finalUrl = decodeURIComponent(testBoleta.rows[0].qr_url.split('data=')[1].split('&')[0]);
    console.log(`  ${finalUrl}`);
    console.log(`\nEsta URL debería llevar al sitio elgrancamion.com/verificar/{hash}`);
    console.log(`El sitio elgrancamion.com debe hacer fetch a:`);
    console.log(`  https://rifas-backend-production.up.railway.app/api/verificar/${testBoleta.rows[0].verificacion_hash}`);

  } catch(err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
})();
