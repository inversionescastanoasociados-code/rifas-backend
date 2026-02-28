/**
 * Script para sincronizar imágenes locales del directorio storage/ a la DB remota.
 * Uso: node scripts/sync-images-to-db.js
 * 
 * Sube cada imagen al endpoint /api/uploads/imagen usando autenticación JWT.
 * Las imágenes se guardan automáticamente en la DB por el controller actualizado.
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE = process.env.API_URL || 'https://rifas-backend-production.up.railway.app';
const STORAGE_DIR = path.join(__dirname, '..', 'storage');

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL || 'admin@rifas.com',
      password: process.env.ADMIN_PASSWORD || 'admin123'
    })
  });
  const data = await res.json();
  if (!data.token && !data.data?.token) {
    console.error('Login failed:', data);
    process.exit(1);
  }
  return data.token || data.data?.token;
}

async function uploadImage(token, filePath, filename) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  
  const formData = new FormData();
  formData.append('imagen', fs.createReadStream(filePath));

  const res = await fetch(`${API_BASE}/api/uploads/imagen`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...formData.getHeaders()
    },
    body: formData
  });

  const data = await res.json();
  return data;
}

async function main() {
  console.log(`📁 Directorio de storage: ${STORAGE_DIR}`);
  
  if (!fs.existsSync(STORAGE_DIR)) {
    console.log('❌ No existe el directorio storage/');
    return;
  }

  const files = fs.readdirSync(STORAGE_DIR);
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const images = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));

  console.log(`📷 ${images.length} imágenes encontradas`);

  if (images.length === 0) return;

  // Login
  console.log('🔐 Autenticando...');
  const token = await login();
  console.log('✅ Autenticado');

  // Las imágenes ya existen con nombres específicos en el filesystem.
  // En lugar de re-subirlas (lo que genera nuevos nombres), 
  // vamos a insertarlas directamente via un endpoint especial.
  // Pero como no tenemos endpoint directo a DB, usemos otra estrategia:
  // Llamar directamente a la DB si tenemos DATABASE_URL.

  // Alternativa más simple: hacer curl directo con los nombres correctos
  // No podemos usar la API de upload porque genera nombres nuevos.
  // Mejor: conectar directamente a la DB.

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.log('⚠️  No se encontró DATABASE_URL. Configúralo para sincronizar directamente.');
    console.log('   Ejemplo: DATABASE_URL="postgresql://..." node scripts/sync-images-to-db.js');
    console.log('');
    console.log('   Alternativa: Las imágenes se sincronizarán automáticamente cuando el');
    console.log('   servidor inicie y encuentre archivos en storage/ que no estén en la DB.');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  let synced = 0;
  for (const filename of images) {
    try {
      // Check if already exists
      const exists = await pool.query(
        'SELECT 1 FROM imagenes_storage WHERE filename = $1',
        [filename]
      );

      if (exists.rows.length > 0) {
        console.log(`  ⏭  ${filename} (ya existe en DB)`);
        continue;
      }

      const filePath = path.join(STORAGE_DIR, filename);
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
      const ext = path.extname(filename).toLowerCase();
      const mimeType = mimeMap[ext] || 'image/jpeg';

      await pool.query(
        `INSERT INTO imagenes_storage (filename, mime_type, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO UPDATE SET data = $3, mime_type = $2`,
        [filename, mimeType, base64]
      );

      synced++;
      console.log(`  ✅ ${filename} sincronizado`);
    } catch (err) {
      console.error(`  ❌ ${filename}: ${err.message}`);
    }
  }

  await pool.end();
  console.log(`\n🎉 ${synced} imágenes sincronizadas a la DB`);
}

main().catch(console.error);
