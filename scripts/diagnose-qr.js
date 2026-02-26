const { Pool } = require('pg');
const pool = new Pool({
  host: 'crossover.proxy.rlwy.net', port: 34599, database: 'railway',
  user: 'postgres', password: 'iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ', ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    const rifas = [
      { id: 'a7ed3394-bc23-4646-8b75-473d18c3a0a1', nombre: 'rifan 2 prd' },
      { id: '1f950567-6d88-4f31-bc49-c8e89a96b329', nombre: 'rifa produccion nueva' }
    ];

    for (const rifa of rifas) {
      console.log(`\n========== ${rifa.nombre} ==========`);
      
      // Primeras 5 boletas
      const ej = await pool.query(
        'SELECT numero, verificacion_hash, qr_url FROM boletas WHERE rifa_id = $1 ORDER BY numero LIMIT 5',
        [rifa.id]
      );
      
      for (const b of ej.rows) {
        let decoded = 'SIN QR';
        if (b.qr_url) {
          try {
            const dataParam = b.qr_url.split('data=')[1];
            decoded = dataParam ? decodeURIComponent(dataParam.split('&')[0]) : 'NO DATA PARAM';
          } catch(e) { decoded = 'ERROR DECODE'; }
        }
        console.log(`  Boleta #${b.numero}:`);
        console.log(`    Hash: ${b.verificacion_hash}`);
        console.log(`    QR apunta a: ${decoded}`);
      }

      // Hashes con formato incorrecto
      const badHash = await pool.query(
        "SELECT COUNT(*) as cnt FROM boletas WHERE rifa_id = $1 AND (LENGTH(verificacion_hash) != 32 OR verificacion_hash !~ '^[a-f0-9]{32}$')",
        [rifa.id]
      );
      console.log(`  Hashes con formato incorrecto: ${badHash.rows[0].cnt}`);

      // Duplicados por rifa
      const dupHash = await pool.query(
        'SELECT verificacion_hash, COUNT(*) as cnt FROM boletas WHERE rifa_id = $1 GROUP BY verificacion_hash HAVING COUNT(*) > 1',
        [rifa.id]
      );
      console.log(`  Hashes duplicados en esta rifa: ${dupHash.rows.length}`);
    }

    // Duplicados globales
    console.log('\n=== DUPLICADOS GLOBALES DE HASH ===');
    const globalDup = await pool.query(
      'SELECT verificacion_hash, COUNT(*) as cnt FROM boletas GROUP BY verificacion_hash HAVING COUNT(*) > 1'
    );
    console.log(`Total hashes duplicados globalmente: ${globalDup.rows.length}`);
    if (globalDup.rows.length > 0) {
      globalDup.rows.slice(0, 5).forEach(d => console.log(`  Hash ${d.verificacion_hash}: ${d.cnt} veces`));
    }

    // Probar verificación con un hash real
    console.log('\n=== PROBANDO ENDPOINT DE VERIFICACIÓN ===');
    const testBoleta = await pool.query(
      "SELECT b.numero, b.verificacion_hash, b.estado, r.nombre as rifa FROM boletas b JOIN rifas r ON r.id = b.rifa_id ORDER BY b.created_at DESC LIMIT 1"
    );
    const hash = testBoleta.rows[0].verificacion_hash;
    console.log(`Probando hash: ${hash} (Boleta #${testBoleta.rows[0].numero} - ${testBoleta.rows[0].rifa})`);

    const fetch = require('node:https');
    const url = `https://rifas-backend-production.up.railway.app/api/verificar/${hash}`;
    console.log(`URL: ${url}`);

    const resp = await new Promise((resolve, reject) => {
      fetch.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      }).on('error', reject);
    });

    console.log(`Status: ${resp.status}`);
    console.log(`Respuesta:`, JSON.stringify(resp.data, null, 2));

    // Verificar la URL que el QR genera
    console.log('\n=== VERIFICACIÓN DE URL DEL QR ===');
    const qrBoleta = await pool.query(
      "SELECT numero, verificacion_hash, qr_url FROM boletas WHERE rifa_id = 'a7ed3394-bc23-4646-8b75-473d18c3a0a1' ORDER BY numero LIMIT 1"
    );
    const qr = qrBoleta.rows[0];
    const qrDecoded = decodeURIComponent(qr.qr_url.split('data=')[1].split('&')[0]);
    console.log(`Boleta #${qr.numero}:`);
    console.log(`  QR URL decodificada: ${qrDecoded}`);
    console.log(`  Hash en DB: ${qr.verificacion_hash}`);
    console.log(`  ¿Hash está en la URL del QR? ${qrDecoded.includes(qr.verificacion_hash)}`);
    
    // Extraer el hash de la URL del QR
    const hashFromUrl = qrDecoded.split('/').pop();
    console.log(`  Hash extraído de URL: ${hashFromUrl}`);
    console.log(`  ¿Coinciden? ${hashFromUrl === qr.verificacion_hash}`);

  } catch(err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
})();
